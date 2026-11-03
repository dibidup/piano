// Piano Grooves: funciona sin conexión (caché propia; solo borra cachés de esta app).
const C='pg-v6';const CORE=['./','index.html','app.js','pianoeng.js','chapters.js','insts.js','drums.js','jsqr.js','manifest.webmanifest','icon-192.png','icon-512.png','apple-touch-icon.png','favicon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('pg-')&&k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
  const font=/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);if(u.origin!==location.origin&&!font)return;
  e.respondWith(caches.open(C).then(async c=>{const hit=await c.match(r,{ignoreSearch:r.mode==='navigate'});
    const net=fetch(r).then(res=>{if(res&&(res.ok||res.type==='opaque'))c.put(r,res.clone());return res}).catch(()=>hit);
    return hit||net}))});
