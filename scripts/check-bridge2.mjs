import puppeteer from 'puppeteer-core';
const b=await puppeteer.connect({browserURL:'http://127.0.0.1:9350',defaultViewport:null});
const p=(await b.pages()).find(x=>x.url().includes('canberratimes'));
console.log(JSON.stringify(await p.evaluate(()=>({bridge:window.__transflowKeyBridge,seen:window.__transflowKeySeen})),null,2));
await b.disconnect();
