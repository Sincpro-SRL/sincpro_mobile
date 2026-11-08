"use strict";
// In-memory stand-in for the native task registry, shared with the ESM stub.
const tasks = (globalThis.__expoTasks ??= new Map());

module.exports = {
  defineTask(name, run) {
    tasks.set(name, run);
  },
  isTaskDefined(name) {
    return tasks.has(name);
  },
};
