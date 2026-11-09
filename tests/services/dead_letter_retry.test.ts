import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import type { IntegrationEvent } from "@sincpro/mobile/domain/events";
import { EventBus } from "@sincpro/mobile/infrastructure/workers/EventBus";
import { DeadLetterQueueUseCases } from "@sincpro/mobile/services/dead_letter_queue.service";

const originalPublish = EventBus.publish;
afterEach(() => {
  EventBus.publish = originalPublish;
});

/** A dead letter queue in memory and a use case wired to it. */
function setup(uuids: string[]) {
  const queue = new Set(uuids);
  const published: string[] = [];
  EventBus.publish = async (event: IntegrationEvent) => {
    await Promise.resolve();
    published.push(event.uuid);
  };
  const useCases = new DeadLetterQueueUseCases();
  Object.defineProperty(useCases, "repository", {
    value: {
      remove: async (uuid: string) => {
        await Promise.resolve();
        return queue.delete(uuid);
      },
      save: async (event: IntegrationEvent) => {
        queue.add(event.uuid);
      },
    },
  });
  return { queue, published, useCases };
}

const failedPrint = (uuid: string) =>
  ({ uuid, name: "print", retry() {} }) as IntegrationEvent;

test("a failed event is retried once, even with two taps at the same time", async () => {
  const { published, queue, useCases } = setup(["ticket-1"]);
  const event = failedPrint("ticket-1");

  const results = await Promise.all([
    useCases.retryFailedEvent(event),
    useCases.retryFailedEvent(event),
  ]);

  assert.deepEqual(results.sort(), [false, true]);
  assert.deepEqual(published, ["ticket-1"], "the print is sent once");
  assert.equal(queue.size, 0);
});

test("a retry from a list that was not refreshed sends nothing", async () => {
  const { published, useCases } = setup(["ticket-1"]);
  const event = failedPrint("ticket-1");

  assert.equal(await useCases.retryFailedEvent(event), true);
  assert.equal(await useCases.retryFailedEvent(event), false);
  assert.deepEqual(published, ["ticket-1"]);
});

test("an event that fails again can be retried again", async () => {
  const { published, queue, useCases } = setup(["ticket-1"]);
  const event = failedPrint("ticket-1");

  await useCases.retryFailedEvent(event);
  queue.add("ticket-1"); // the bus puts it back when the print fails again
  assert.equal(await useCases.retryFailedEvent(event), true);
  assert.deepEqual(published, ["ticket-1", "ticket-1"]);
});

test("if publishing fails the event stays in the dead letter queue", async () => {
  const { queue, useCases } = setup(["ticket-1"]);
  EventBus.publish = async () => {
    throw new Error("db locked");
  };

  await assert.rejects(useCases.retryFailedEvent(failedPrint("ticket-1")), /db locked/);
  assert.ok(queue.has("ticket-1"));
});
