/**
 * Returns the current timestamp in milliseconds.
 * Exported as a named function to allow mocking in tests
 * and to avoid direct Date.now() calls inside components.
 */
export const getStableTimestamp = (): number => Date.now();
