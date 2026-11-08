"use strict";
// Records what the scheduler was asked to do, shared with the ESM stub.
const registered = (globalThis.__expoRegisteredTasks ??= new Map());

module.exports = {
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  async registerTaskAsync(name, options) {
    registered.set(name, options);
  },
  async unregisterTaskAsync(name) {
    registered.delete(name);
  },
};
