import mitt, { Emitter, EventType, Handler } from "mitt";

type Events = Record<EventType, unknown>;

const DEBOUNCE_DELAY = 300;

interface Subscription {
  timer: NodeJS.Timeout | null;
  wrappedHandler: Handler<unknown>;
  originalHandler: Handler<unknown>;
}

class UIEventBusImpl {
  private emitter: Emitter<Events> = mitt();
  private subscriptions = new Map<string, Subscription>();
  private handlerIdCounter = 0;

  on<T = unknown>(event: string, handler: Handler<T>): () => void {
    const handlerId = `${event}_${++this.handlerIdCounter}`;

    const wrappedHandler: Handler<unknown> = (payload) => {
      const sub = this.subscriptions.get(handlerId);
      if (sub?.timer) {
        clearTimeout(sub.timer);
      }

      const timer = setTimeout(() => {
        handler(payload as T);
        const subscription = this.subscriptions.get(handlerId);
        if (subscription) subscription.timer = null;
      }, DEBOUNCE_DELAY);

      this.subscriptions.set(handlerId, {
        timer,
        wrappedHandler,
        originalHandler: handler as Handler<unknown>,
      });
    };

    this.subscriptions.set(handlerId, {
      timer: null,
      wrappedHandler,
      originalHandler: handler as Handler<unknown>,
    });
    this.emitter.on(event, wrappedHandler);

    return () => {
      const sub = this.subscriptions.get(handlerId);
      if (sub?.timer) clearTimeout(sub.timer);
      if (sub?.wrappedHandler) this.emitter.off(event, sub.wrappedHandler);
      this.subscriptions.delete(handlerId);
    };
  }

  off<T = unknown>(event: string, handler: Handler<T>): void {
    for (const [handlerId, sub] of this.subscriptions.entries()) {
      if (handlerId.startsWith(`${event}_`) && sub.originalHandler === handler) {
        if (sub.timer) clearTimeout(sub.timer);
        this.emitter.off(event, sub.wrappedHandler);
        this.subscriptions.delete(handlerId);
        return;
      }
    }
    this.emitter.off(event, handler as Handler<unknown>);
  }

  emit<T = unknown>(event: string, payload?: T): void {
    this.emitter.emit(event, payload);
  }

  clear(): void {
    this.subscriptions.forEach((sub) => {
      if (sub.timer) clearTimeout(sub.timer);
    });
    this.subscriptions.clear();
    this.emitter.all.clear();
  }
}

export const UIEventBus = new UIEventBusImpl();
