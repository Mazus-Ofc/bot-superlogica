"use strict";

function ts() {
  return new Date().toISOString();
}
function debug(...args) { console.log(`${ts()}: [DEBUG]`, ...args); }
function info(...args) { console.log(`${ts()}: [INFO]`, ...args); }
function warn(...args) { console.warn(`${ts()}: [WARN]`, ...args); }
function error(...args) { console.error(`${ts()}: [ERROR]`, ...args); }

module.exports = { debug, info, warn, error };
