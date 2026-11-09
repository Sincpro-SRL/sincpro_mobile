import assert from "node:assert/strict";
import test from "node:test";

import { PrintImageRequestedEvent } from "../../sincpro_mobile/domain/print/events.ts";
import { WebViewMessageReceivedEvent } from "../../sincpro_mobile/domain/webview/events.ts";

const image = "a".repeat(400);
const stored = (event: { asJSON(): string }) =>
  JSON.parse(event.asJSON()) as Record<string, string>;
const print = () =>
  PrintImageRequestedEvent.create({
    imageBase64: image,
    width: 10,
    height: 20,
    title: "ticket",
  });

test("a print event keeps its image whether pending, failed or printed", () => {
  // The history is cleaned by retention and on logout, never by consuming an event.
  assert.equal(stored(print()).imageBase64, image);
  assert.equal(stored(print().markAsFailed("printer off")).imageBase64, image);
  assert.equal(stored(print().markAsAcknowledged()).imageBase64, image);
  assert.equal(stored(print()).title, "ticket");
});

test("the queue's copy of a failed print still carries the image to preview and retry", () => {
  const copy = PrintImageRequestedEvent.fromJSON<PrintImageRequestedEvent>(print().asJSON());
  copy.markAsFailed("printer off");
  assert.equal(stored(copy).imageBase64, image);
});

test("a WebView message keeps its raw content", () => {
  const raw = JSON.stringify({ type: "PRINT_IMAGE", image: "b".repeat(400) });
  const event = WebViewMessageReceivedEvent.create({ raw, source: "https://odoo" });
  assert.equal(stored(event).raw, raw);
  assert.equal(stored(event.markAsAcknowledged()).raw, raw);
});
