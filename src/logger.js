const debug = (...a) => console.log('[DEBUG]', ...a);
const error = (...a) => console.error('[ERROR]', ...a);
module.exports = { debug, error };
