// In-memory stand-in for the native task registry, shared with the CJS stub.
type Task = () => Promise<unknown>;
const globals = globalThis as { __expoTasks?: Map<string, Task> };
const tasks = (globals.__expoTasks ??= new Map());

export function defineTask(name: string, run: Task): void {
  tasks.set(name, run);
}

export function isTaskDefined(name: string): boolean {
  return tasks.has(name);
}
