import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {updateQrPage} from '../scripts/qr-color-picker-ui.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const js=fs.readFileSync(path.join(root,'cloudflare-overrides/assets/js/qr-color-picker.js'),'utf8');
const css=fs.readFileSync(path.join(root,'cloudflare-overrides/assets/css/qr-color-picker.css'),'utf8');
const fixture='<!doctype html><html><head><title>QR</title></head><body><form><div class="v17-inline"><div class="v17-field"><label for="qrDark">لون الرمز</label><input id="qrDark" type="color" value="#111827"></div><div class="v17-field"><label for="qrLight">لون الخلفية</label><input id="qrLight" type="color" value="#ffffff"></div></div></form></body></html>';
test('replaces giant native wells with neat swatch and hex label',()=>{
 const html=updateQrPage(fixture);
 for(const id of ['qrDark','qrLight','qrDarkHex','qrLightHex','qrContrastHint'])assert.match(html,new RegExp(`id="${id}"`));
 assert.match(html,/qr-color-picker.css\?v=18.3/);
 assert.match(html,/qr-color-picker.js\?v=18.3/);
 assert.match(html,/data-qr-preset="classic"/);
 assert.match(html,/data-qr-preset="violet"/);
 assert.match(html,/data-qr-preset="blue"/);
 assert.match(html,/aria-live="polite"/);
});
test('build fails instead of silently replacing wrong page or duplicating UI',()=>{
 assert.throws(()=>updateQrPage('<html><head></head><body></body></html>'),/original palette/);
 assert.throws(()=>updateQrPage(updateQrPage(fixture)),/already installed/);
});
test('native input stays keyboard reachable, but color wheel is invisible',()=>{
 assert.match(css,/input\[type="color"\]/);
 assert.match(css,/opacity:0!important/);
 assert.match(css,/:focus-within/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/\.v17-color-swatch/);
});
test('palette JS keeps existing QR invalidation and updates HEX in response to user input',()=>{
 assert.match(js,/new Event\('input',\{bubbles:true\}\)/);
 assert.match(js,/output\.textContent = hex\(input\.value\)/);
 assert.match(js,/aria-pressed/);
 assert.match(js,/lowContrast/);
 new vm.Script(js);
});
test('preset palette defaults offer strong dark/light contrast',()=>{
 const RGB=x=>[1,3,5].map(i=>parseInt(x.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4));
 const lum=x=>{const c=RGB(x);return .2126*c[0]+.7152*c[1]+.0722*c[2]};
 for(const [a,b] of [['#111827','#ffffff'],['#4c1d95','#f5f3ff'],['#1e3a8a','#eff6ff']]){
  const l=[lum(a),lum(b)].sort((a,b)=>b-a);
  assert.ok((l[0]+.05)/(l[1]+.05)>4.5,`Insufficient contrast: ${a}, ${b}`);
 }
});


test('preset click updates visible HEX and triggers existing form invalidation',()=>{
  let invalidations=0;
  const input=(value)=>({value,handlers:{},addEventListener(type,cb){(this.handlers[type]??=[]).push(cb)},
    dispatchEvent(event){for(const cb of this.handlers[event.type]??[])cb(event);if(event.bubbles)invalidations++},
    closest(){return {style:{setProperty(k,v){this[k]=v}}}}});
  const d=input('#111827'),l=input('#ffffff');
  const hexDark={textContent:''},hexLight={textContent:''},hint={dataset:{},textContent:''};
  const buttons=['classic','violet','blue'].map(slug=>({dataset:{qrPreset:slug},handlers:{},setAttribute(k,v){this[k]=v},
    addEventListener(type,cb){this.handlers[type]=cb},click(){this.handlers.click()}}));
  const nodes={qrDark:d,qrLight:l,qrDarkHex:hexDark,qrLightHex:hexLight,qrContrastHint:hint};
  const doc={getElementById(id){return nodes[id]},querySelectorAll(){return buttons}};
  const contrast=(a,b)=>a===b?1:10;
  vm.runInNewContext(js,{document:doc,window:{DocMivoQRData:{contrast}},Event:class Event {constructor(type,opt){this.type=type;this.bubbles=opt.bubbles}}});
  assert.equal(hexDark.textContent,'#111827');
  assert.equal(hexLight.textContent,'#FFFFFF');
  buttons[1].click();
  assert.equal(d.value,'#4c1d95');
  assert.equal(l.value,'#f5f3ff');
  assert.equal(hexDark.textContent,'#4C1D95');
  assert.equal(hexLight.textContent,'#F5F3FF');
  assert.equal(invalidations,2);
  assert.equal(buttons[1]['aria-pressed'],'true');
  assert.equal(buttons[0]['aria-pressed'],'false');
  l.value = d.value;
  for(const cb of l.handlers.input) cb({});
  assert.equal(hint.dataset.lowContrast,'true');
});
