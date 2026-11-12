import assert from "node:assert/strict";
import test from "node:test";

import { envelopeOf } from "@sincpro/client-framework";

import { newEvent } from "../../sincpro_mobile/domain/events/delivery.ts";
import { PrintImageRequestedEvent } from "../../sincpro_mobile/domain/print/events.ts";
import { storedMessageOf } from "../../sincpro_mobile/infrastructure/events/stored.ts";

const image = "a".repeat(400);
const stored = (event: PrintImageRequestedEvent) =>
  storedMessageOf("event", event, envelopeOf(event)).payload as Record<string, unknown>;
const print = () =>
  newEvent(PrintImageRequestedEvent, {
    imageBase64: image,
    width: 10,
    height: 20,
    title: "ticket",
  });

test("a print event keeps its image in what the queue stores, to preview and retry", () => {
  // The history is cleaned by retention and on logout, never by delivering an event.
  assert.equal(stored(print()).imageBase64, image);
  assert.equal(stored(print()).title, "ticket");
  assert.equal(print().name, "common.print.v1.image_requested");
});
