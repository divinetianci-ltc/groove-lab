const CACHE='groove-lab-fourbar-v7-mobile';
const FILES=['./','./index.html','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>(k.startsWith('groove-lab-fourbar-')&&k!==CACHE)||k==='groove-lab-mainroom-v1').map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
const cacheResponse=async(request,res)=>{if(res.ok&&!new URL(request.url).pathname.startsWith(new URL('./audio/',self.location.href).pathname))try{const cache=await caches.open(CACHE);await cache.put(request,res.clone())}catch{}return res};
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;
  if(e.request.mode==='navigate')e.respondWith(fetch(e.request).then(res=>cacheResponse(e.request,res)).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
  else e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>cacheResponse(e.request,res))));
});
