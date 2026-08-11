/**
 * Preload that makes every fetch throw, so a script's transport-failure handling
 * can be exercised without a network. Used via `node --import`.
 */
globalThis.fetch = () => {
  throw new Error('simulated transport failure');
};
