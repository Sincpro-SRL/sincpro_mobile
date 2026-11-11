import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { BoundedContext, Command, Feature, newEntityId } from "@sincpro/client-framework";

import { createKernel } from "../../sincpro_mobile/framework/createApp.ts";
import { installWebCrypto } from "../../sincpro_mobile/infrastructure/web_crypto.ts";

const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");

/** A phone's Hermes: no Web Crypto at all. */
beforeEach(() => {
  Object.defineProperty(globalThis, "crypto", {
    value: undefined,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  if (original) Object.defineProperty(globalThis, "crypto", original);
});

class CommandProbe extends Command<string> {}

class Probe extends Feature<CommandProbe, string> {
  execute(): string {
    return this.execution.id;
  }
}

test("without Web Crypto, a run cannot even have an id — what the phone showed", async () => {
  const probeBoundedContext = new BoundedContext("probe");
  probeBoundedContext.feature(CommandProbe)(Probe);
  await assert.rejects(probeBoundedContext.execute(new CommandProbe()), /getRandomValues/);
});

test("the kernel installs Web Crypto before any Command runs", async () => {
  createKernel();
  const probeBoundedContext = new BoundedContext("probe");
  probeBoundedContext.feature(CommandProbe)(Probe);
  const id = await probeBoundedContext.execute(new CommandProbe());
  assert.match(id, /^[0-9a-f]{32}$/);
  assert.match(globalThis.crypto.randomUUID(), /^[0-9a-f-]{36}$/);
});

test("what the platform already has is kept; only a missing method is added", () => {
  const subtle = { marker: true };
  const getRandomValues = <T extends ArrayBufferView>(array: T): T => array;
  Object.defineProperty(globalThis, "crypto", {
    value: { subtle, getRandomValues },
    configurable: true,
    writable: true,
  });
  installWebCrypto();
  const installed = globalThis.crypto as unknown as {
    subtle: unknown;
    randomUUID: () => string;
  };
  assert.equal(installed.subtle, subtle);
  assert.match(installed.randomUUID(), /^[0-9a-f-]{36}$/);
  assert.match(newEntityId(), /^[0-9a-f]{32}$/);
});
