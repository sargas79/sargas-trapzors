/**
 * Pure logger factory. Foundry-specific state is injected so it can be tested in Node.
 * Player clients never log trap details (plan section 11).
 * @param {object} opts
 * @param {string} [opts.prefix]
 * @param {() => boolean} opts.isGM
 * @param {() => boolean} opts.isDebugEnabled
 * @param {{debug:Function, info:Function, warn:Function, error:Function}} [opts.sink]
 */
export function createLogger({ prefix = "sargas-trapzors", isGM, isDebugEnabled, sink = console } = {}) {
  const tag = `${prefix} |`;
  const gm = () => Boolean(isGM?.());
  const verbose = () => gm() && Boolean(isDebugEnabled?.());
  return {
    debug: (...args) => { if (verbose()) sink.debug(tag, ...args); },
    info: (...args) => { if (verbose()) sink.info(tag, ...args); },
    warn: (...args) => { if (gm()) sink.warn(tag, ...args); },
    error: (...args) => { if (gm()) sink.error(tag, ...args); }
  };
}
