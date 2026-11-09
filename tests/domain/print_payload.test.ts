import assert from "node:assert/strict";
import test from "node:test";

import { PrintImageRequestedEvent } from "../../sincpro_mobile/domain/print/events.ts";
import {
  holdPrintImage,
  MAX_PENDING_PRINT_IMAGES,
  takePrintImage,
} from "../../sincpro_mobile/infrastructure/print/pending_images.ts";

test("a print event keeps the image in memory and stores only a marker", () => {
  const image = "a".repeat(400);
  const event = PrintImageRequestedEvent.create({
    imageBase64: image,
    width: 10,
    height: 20,
    title: "ticket",
  });

  const stored = JSON.parse(event.asJSON()) as { imageBase64: string; title: string };

  assert.equal(event.imageBase64, image);
  assert.equal(stored.title, "ticket");
  assert.equal(stored.imageBase64, "[omitido 400 bytes]");
});

test("the pending image is readable once by event id", () => {
  holdPrintImage("evt-1", "png-bytes");

  assert.equal(takePrintImage("evt-1"), "png-bytes");
  assert.equal(takePrintImage("evt-1"), undefined);
});

test("only the latest pending images are kept, so a failed print cannot leak memory", () => {
  for (let index = 0; index < MAX_PENDING_PRINT_IMAGES + 2; index += 1) {
    holdPrintImage(`leak-${index}`, `image-${index}`);
  }
  assert.equal(takePrintImage("leak-0"), undefined);
  assert.equal(takePrintImage("leak-1"), undefined);
  assert.equal(
    takePrintImage(`leak-${MAX_PENDING_PRINT_IMAGES + 1}`),
    `image-${MAX_PENDING_PRINT_IMAGES + 1}`,
  );
});

test("a stored WebView message cannot carry a ticket to print again", async () => {
  // The events screen republishes what is stored; with the full message it reprinted tickets.
  const { WebViewMessageReceivedEvent } =
    await import("../../sincpro_mobile/domain/webview/events.ts");
  const raw = JSON.stringify({ type: "PRINT_IMAGE", image: "b".repeat(400) });
  const event = WebViewMessageReceivedEvent.create({ raw, source: "https://odoo" });

  const stored = JSON.parse(event.asJSON()) as { raw: string; source: string };

  assert.equal(event.raw, raw);
  assert.equal(stored.source, "https://odoo");
  assert.match(stored.raw, /^\[omitido \d+ bytes\]$/);
});
