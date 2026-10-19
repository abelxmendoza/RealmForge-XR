/**
 * Hooks for the emulated-headset tests (e2e/xr.e2e.mjs): the IWER Quest emulator behind `?iwer`, and
 * handles the tests read (renderer, panel layouts, stores). On in dev and in the e2e build
 * (VITE_XR_EMULATOR=1); off in a normal production build, where the emulator is never loaded.
 */
export const XR_TEST_HOOKS = import.meta.env.DEV || import.meta.env.VITE_XR_EMULATOR === '1'
