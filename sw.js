const CACHE='lumi-v4';
const FILES=['./','./index.html','./css/style.css','./js/lumi-core.js','./js/lumi-device.js','./js/app.js','./manifest.json','./icons/icon-192.svg','./icons/icon-512.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  // Nunca cachear llamadas a APIs de IA ni peticiones de otros dominios.
  if(u.origin!==self.location.origin)return;
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{
    const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return res;
  }).catch(()=>caches.match('./index.html'))));
});
