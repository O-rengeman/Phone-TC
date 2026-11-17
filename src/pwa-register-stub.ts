// Stub for 'virtual:pwa-register' used by builds that exclude vite-plugin-pwa
// (e.g. vite.browser.config.ts). No service worker is registered.
export function registerSW(_options?: unknown): (reloadPage?: boolean) => Promise<void> {
  return async () => {};
}
