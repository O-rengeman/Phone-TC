import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    // Was 'src/**/*.test.ts' — silently skipped every .tsx test (renderHook
    // specs for hooks that need JSX providers/wrappers use .test.tsx).
    include: ['src/**/*.test.{ts,tsx}'],
    // Registers @testing-library/react's cleanup() after every test — see
    // src/test/setup.ts for why this is required (globals: true is not set).
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/utils/**', 'src/hooks/**'],
      exclude: [
        'src/utils/**/*.test.ts',
        'src/hooks/**/*.test.{ts,tsx}',
        // Thin Capacitor native-plugin wrapper: only meaningful inside a native
        // build, so it is exercised via manual/native QA rather than jsdom units.
        'src/utils/TimecodeNativeBridge.ts',
        // Deliberately covered by thin state-transition tests only (per the
        // Phase 4 plan): their real value (PeerJS connection lifecycle,
        // AudioWorklet/AudioContext behavior) can't be meaningfully exercised
        // under jsdom fakes and is verified via the Phase 7 device/browser
        // checklist instead.
        'src/hooks/useP2P.ts',
        'src/hooks/useLtcEngine.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
