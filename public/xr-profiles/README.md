# Bundled WebXR controller and hand models

From `@webxr-input-profiles/assets@1.0.20` (license in `LICENSE.md`), trimmed to the Quest profiles:
Touch Plus (Quest 3 / 3S), Touch Pro, Touch v3 (Quest 2) and the generic hand.
`src/xr/xrStore.ts` points `baseAssetPath` here so controllers and hands render without a CDN
(venue Wi-Fi drops used to throw "Failed to fetch" on entering XR).
