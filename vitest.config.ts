import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/utils/**'],
      exclude: [
        'src/utils/**/*.test.ts',
        // Thin Capacitor native-plugin wrapper: only meaningful inside a native
        // build, so it is exercised via manual/native QA rather than jsdom units.
        'src/utils/TimecodeNativeBridge.ts',
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
