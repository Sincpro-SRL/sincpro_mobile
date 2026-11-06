import { generateUUID } from "@sincpro/mobile/infrastructure/database/utils";

import { DomainEvent, EEventStatus } from "./domain_event";

type Constructor<T> = new (...args: any[]) => T;

export function IntegrationEventMixin<TBase extends Constructor<DomainEvent>>(Base: TBase) {
  return class extends Base {
    // TS2545: a mixin class must declare a rest constructor.
    // eslint-disable-next-line @typescript-eslint/no-useless-constructor
    constructor(...args: any[]) {
      super(...args);
    }

    public status: EEventStatus = EEventStatus.PENDING;
    public attempts: number = 0;
    public errorMessage: string | null = null;
    public acknowledgedAt: string | null = null;
    public failedAt: string | null = null;
    public readonly requiresNetwork: boolean = false;

    markAsProcessing(): this {
      this.status = EEventStatus.PROCESSING;
      this.attempts += 1;
      return this;
    }

    markAsAcknowledged(): this {
      this.status = EEventStatus.ACKNOWLEDGED;
      this.acknowledgedAt = new Date().toISOString();
      return this;
    }

    markAsFailed(errorMessage: string): this {
      this.status = EEventStatus.FAILED;
      this.errorMessage = errorMessage;
      this.failedAt = new Date().toISOString();
      return this;
    }

    markAsCancelled(): this {
      this.status = EEventStatus.CANCELLED;
      return this;
    }

    retry(): this {
      this.status = EEventStatus.PENDING;
      this.errorMessage = null;
      return this;
    }

    cloneWithReset(): this {
      const clone = (this.constructor as typeof DomainEvent).from(this) as this;
      Object.assign(clone, {
        uuid: generateUUID(),
        createdAt: new Date().toISOString(),
        status: EEventStatus.PENDING,
        attempts: 0,
        errorMessage: null,
        acknowledgedAt: null,
        failedAt: null,
      });
      return clone;
    }

    get isPending(): boolean {
      return this.status === EEventStatus.PENDING;
    }

    get isProcessing(): boolean {
      return this.status === EEventStatus.PROCESSING;
    }

    get isAcknowledged(): boolean {
      return this.status === EEventStatus.ACKNOWLEDGED;
    }

    get isFailed(): boolean {
      return this.status === EEventStatus.FAILED;
    }

    get isCancelled(): boolean {
      return this.status === EEventStatus.CANCELLED;
    }
  };
}

export class IntegrationEvent extends IntegrationEventMixin(DomainEvent) {}
