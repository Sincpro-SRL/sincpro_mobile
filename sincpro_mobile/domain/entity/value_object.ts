import { safeJsonParse, safeJsonStringify } from "@sincpro/mobile/tools/utils/serializer";

export interface IValueObject {
  asJSON(): string;
  fromJSON(json: any): this;
}

export class ValueObject implements IValueObject {
  static obj<T>(data?: Partial<T>): T {
    const instance = new (this as any)();
    if (data) {
      Object.assign(instance, data);
    }
    return instance;
  }

  static fromJSON<T>(json: any): T {
    let data = json;
    if (typeof json === "string") {
      data = safeJsonParse(json);
    }
    const instance = new (this as any)();
    Object.assign(instance, data);
    return instance;
  }

  asJSON(pretty: boolean = false): string {
    if (pretty) {
      return safeJsonStringify(this, true);
    }
    return safeJsonStringify(this);
  }

  fromJSON(json: any): this {
    return (this.constructor as any).fromJSON(json);
  }

  clone(): this {
    const json = this.asJSON();
    return (this.constructor as any).fromJSON(json);
  }

  equals(other: any): boolean {
    if (!other) return false;
    if (this.constructor !== other.constructor) return false;
    return this.asJSON() === other.asJSON();
  }
}
