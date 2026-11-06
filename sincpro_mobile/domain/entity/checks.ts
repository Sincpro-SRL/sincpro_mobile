import { heldEntities, relations } from "@sincpro/mobile/domain/entity/relations";
import { ChecksFailed, DomainValidationError } from "@sincpro/mobile/exceptions";

const CHECK = Symbol("check");

type CheckMethod = ((this: object) => void) & { [CHECK]?: (entity: object) => unknown };

export function check(watches: (entity: object) => unknown) {
  return function (
    _target: object,
    _key: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    (descriptor.value as CheckMethod)[CHECK] = watches;
    return descriptor;
  };
}

function watchedNames(watches: (entity: object) => unknown, entity: object): string[] {
  const names: string[] = [];
  const proxy = new Proxy(entity, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && prop !== "constructor") names.push(prop);
      return Reflect.get(target, prop, receiver);
    },
  });
  watches(proxy);
  return names;
}

function rulesOf(
  entity: object,
): { name: string; watches: (entity: object) => unknown; run: () => void }[] {
  const seen = new Set<string>();
  const rules: { name: string; watches: (entity: object) => unknown; run: () => void }[] = [];
  let proto = Object.getPrototypeOf(entity);
  while (proto && proto !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (seen.has(key)) continue;
      const value = proto[key] as CheckMethod | undefined;
      const watches = value?.[CHECK];
      if (!watches || typeof value !== "function") continue;
      seen.add(key);
      rules.push({ name: key, watches, run: value.bind(entity) });
    }
    proto = Object.getPrototypeOf(proto);
  }
  return rules;
}

function failureOf(rule: string, run: () => void): { rule: string; message: string } | null {
  try {
    run();
    return null;
  } catch (error) {
    if (error instanceof DomainValidationError) {
      return { rule, message: error.message };
    }
    throw error;
  }
}

export interface CheckFailure {
  rule: string;
  message: string;
  path: string[];
}

export function checkWarnings(entity: object, touched: readonly string[]): CheckFailure[] {
  return collect(entity, [], new Set(touched));
}

export function assertChecks(entity: object): void {
  const failures = collect(entity, [], null);
  if (failures.length > 0) throw new ChecksFailed(failures);
}

function collect(
  entity: object,
  path: string[],
  touched: Set<string> | null,
): CheckFailure[] {
  const failures: CheckFailure[] = [];
  for (const rule of rulesOf(entity)) {
    if (touched) {
      const fields = watchedNames(rule.watches, entity);
      const reached =
        fields.some((field) => touched.has(field)) ||
        (path.length > 0 && touched.has(path[0]));
      if (!reached) continue;
    }
    const failure = failureOf(rule.name, rule.run);
    if (failure) failures.push({ ...failure, path });
  }
  const record = entity as Record<string, unknown>;
  for (const relation of relations(entity)) {
    heldEntities(record[relation.field]).forEach((child, index) => {
      failures.push(...collect(child, [...path, relation.field, String(index)], touched));
    });
  }
  return failures;
}
