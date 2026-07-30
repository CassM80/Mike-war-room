const CACHE='war-room-sprint-32-4';
const ASSETS=["./","./index.html","./manifest.webmanifest","./icon-192.png","./icon-512.png","./css/styles.css","./data/players.js",
  "./data/auctionConsensus.js","./data/espnRankings.js","./js/playerData.js","./js/storage.js","./js/draftEngine.js","./js/leagueValuation.js","./js/recommendationEngine.js",
  "./js/marketCoverage.js","./js/marketSync.js","./js/playerIntegrity.js","./js/auctionEngine.js","./js/blueprint.js","./js/myGuys.js","./js/ui.js","./js/mobileWarRoom.js","./js/app.js","./js/mockSimulator.js"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',e=>{if(e.request.url.includes('api.sleeper.app')){e.respondWith(fetch(e.request));return;}if(e.request.mode==='navigate'||e.request.url.endsWith('/index.html')){e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(cache=>cache.put(e.request,c));return r;}).catch(()=>caches.match(e.request)));return;}e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));});
