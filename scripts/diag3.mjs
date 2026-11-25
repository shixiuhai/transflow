const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const sw = list.find((t) => t.type === 'service_worker');
console.log('sw', sw?.url);
const ws = new WebSocket(sw.webSocketDebuggerUrl);
const pending = new Map(); let seq = 0;
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params={}) => { const id=++seq; ws.send(JSON.stringify({id,method,params})); return new Promise(r=>pending.set(id,r)); };
await send('Runtime.enable');
const ev = async (expr) => {
  const r = await Promise.race([send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true}), new Promise(r=>setTimeout(()=>r('TIMEOUT'),5000))]);
  return r === 'TIMEOUT' ? 'TIMEOUT' : r.result?.result?.value;
};
console.log('manifest', await ev('JSON.stringify(chrome.runtime.getManifest())'));
console.log('id', await ev('chrome.runtime.id'));
console.log('tabs', await ev('chrome.tabs.query({}).then(t=>JSON.stringify(t.map(x=>({id:x.id,url:x.url,title:x.title}))))'));
console.log('send', await ev('chrome.tabs.query({}).then(t=>chrome.tabs.sendMessage(t[0].id,{type:"ping"}).then(r=>"OK:"+JSON.stringify(r)).catch(e=>"ERR:"+e.message))'));
ws.close();
