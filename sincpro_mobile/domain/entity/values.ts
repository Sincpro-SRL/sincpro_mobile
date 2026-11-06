import { DomainValidationError } from "@sincpro/mobile/exceptions";

export interface ValueRule<T> {
  readonly name: string;
  holds(value: T): boolean;
  parse(value: T): T;
}

export function valueRule<T>(name: string, holds: (value: T) => boolean): ValueRule<T> {
  return {
    name,
    holds,
    parse(value: T): T {
      if (!holds(value)) {
        throw new DomainValidationError(`${name} does not hold`);
      }
      return value;
    },
  };
}
