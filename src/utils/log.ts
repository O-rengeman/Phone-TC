/**
 * Dev-only debug logging. warn()/error() are not wrapped here — call
 * console.warn/console.error directly; eslint's no-console rule allows them.
 */
export const debug = import.meta.env.DEV ? console.debug.bind(console) : () => {};
