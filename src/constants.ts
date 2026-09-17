// Shared app-wide constants. Kept in a plain module (no component/hook
// exports) so files that co-export components and hooks — like
// LTCSyncContext.tsx — don't also need to export constants and trip
// react-refresh/only-export-components.

export const FPS_OPTIONS = [
  { label: '23.976', value: 23.976, drop: false, fpsNum: 24000, fpsDen: 1001 },
  { label: '24', value: 24, drop: false, fpsNum: 24000, fpsDen: 1000 },
  { label: '25', value: 25, drop: false, fpsNum: 25000, fpsDen: 1000 },
  { label: '29.97', value: 29.97, drop: false, fpsNum: 30000, fpsDen: 1001 },
  { label: '29.97 DF', value: 29.97, drop: true, fpsNum: 30000, fpsDen: 1001 },
  { label: '30', value: 30, drop: false, fpsNum: 30000, fpsDen: 1000 },
];

export const MARKER_HEX: Record<string, string> = {
  Red: '#ff3b40', Blue: '#3b82f6', Green: '#22c55e', Yellow: '#f59e0b',
};
