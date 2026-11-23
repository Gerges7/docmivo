import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const cfg=JSON.parse(fs.readFileSync(path.join(root,'wrangler.jsonc'),'utf8'));
const headers=fs.readFileSync(path.join(root,'cloudflare-overrides/_headers'),'utf8');
const worker=fs.readFileSync(path.join(root,'src/worker.mjs'),'utf8');
const builder=fs.readFileSync(path.join(root,'scripts/build-cloudflare.mjs'),'utf8');

test('API and HTML keep Worker middleware',()=>{
 assert.equal(cfg.name,'docmivo');
 assert.equal(cfg.assets.binding,'ASSETS');
 const rules=cfg.assets.run_worker_first;
 assert.ok(Array.isArray(rules),'Selective routing must be an array');
 assert.ok(rules.includes('/*'),'HTML and all API routes must retain Worker-first');
 assert.ok(!rules.includes('!/api/*'));
});

test('large static resource directory bypasses paid/free Worker invocations',()=>{
 const rules=cfg.assets.run_worker_first;
 assert.ok(rules.includes('!/assets/*'),'Static resources must bypass the Worker script');
 assert.ok(rules.includes('!/favicon.svg'));
 assert.ok(rules.includes('!/manifest.webmanifest'));
 assert.ok(!rules.includes('!/tools/*'),'Tools HTML must retain host-aware robots header');
 assert.ok(!rules.includes('!/guides/*'),'Guides HTML must retain host-aware robots header');
});

test('Cloudflare static response headers and workers.dev noindex retained',()=>{
 assert.match(headers,/\/assets\/\*[\s\S]*?X-Content-Type-Options:\s*nosniff/);
 assert.match(headers,/https:\/\/:version\.:subdomain\.workers\.dev\/\*[\s\S]*?X-Robots-Tag:\s*noindex/);
 assert.match(worker,/hostname\.endsWith\('\.workers\.dev'\)/);
 assert.match(worker,/X-Robots-Tag/);
 assert.match(worker,/u\.hostname==='www\.getdocmivo\.com'/);
});

test('static header override is copied into output by build',()=>{
 assert.match(builder,/walkFiles\(overlays\)/);
 const lines=headers.split(/\r?\n/);
 assert.ok(lines.filter(x=>x.trim().startsWith('/')).length>=3);
 assert.ok(!/immutable/i.test(headers),'Unfingerprinted assets must not be cached immutably');
});
