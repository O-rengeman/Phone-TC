import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// @testing-library/react's auto-cleanup relies on detecting a *global*
// afterEach (registered when `test.globals: true` in vitest.config.ts).
// This project imports `afterEach` explicitly from 'vitest' per file instead,
// so nothing ever unmounts a renderHook()'d component between tests —
// their effects (setInterval, etc.) keep running and accumulate across every
// test in a file, which reliably OOMs suites with many renderHook calls
// (e.g. useNetworkSync.test.tsx). Registering cleanup here once fixes all
// hook/component test files without repeating it in each one.
afterEach(() => {
  cleanup();
});
