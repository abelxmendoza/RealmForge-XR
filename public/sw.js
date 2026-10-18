// Minimal service worker so browsers offer "Install app" for RealmForge XR.
// It caches nothing: every request goes to the network, so deploys show up immediately.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
