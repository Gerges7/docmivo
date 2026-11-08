const path=require('node:path');
const here=__dirname;
require(path.join(here,'../cloudflare-overrides/assets/js/vendor/docmivo-qr-engine.js'));
require(path.join(here,'../cloudflare-overrides/assets/js/v17-qr-core.js'));
const qrCls=globalThis.DocMivoQRCode;
const f=globalThis.DocMivoQRData;
const input=[
 ['url','url',{url:'https://getdocmivo.com/tools/qr-code'}],
 ['arabic','text',{text:'مرحباً بكم في DocMivo'}],
 ['wifi','wifi',{ssid:'Test Wi-Fi',password:'p,a;ss',security:'WPA',hidden:false}],
 ['vcard','vcard',{name:'Test Person',phone:'+201000000000',email:'test@docmivo.com'}],
 ['emoji','text',{text:'QR ✅ 🌍'}]
];
for (const [id,type,data] of input){
 const txt=f.payload(type,data);const qr=new qrCls(-1,2);qr.addData(Buffer.from(txt,'utf8').toString('latin1'));qr.make();
 const n=qr.getModuleCount(),bits=[];for(let y=0;y<n;y++)bits.push(Array.from({length:n},(_,x)=>qr.isDark(y,x)?1:0));
 process.stdout.write(JSON.stringify({id,txt,n,bits})+'\n');
}
