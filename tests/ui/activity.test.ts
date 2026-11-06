import assert from "node:assert/strict";
import test from "node:test";

import {
  type ActivityFact,
  activityVisible,
  applyActivity,
  declaresUi,
  emptyActivity,
} from "../../sincpro_mobile/infrastructure/ui/activity.ts";

function fact(partial: Omit<ActivityFact, "id"> & { id?: string }): ActivityFact {
  return { id: partial.id ?? partial.name, ...partial };
}

test("an event is silent until its class sets ui", () => {
  class Quiet {}
  class Shown {
    static readonly ui = true;
  }

  assert.equal(declaresUi(new Quiet()), false);
  assert.equal(declaresUi(new Shown()), true);
});

test("a fact without ui stays out of the toast unless the reader asks for all", () => {
  const enabled = { queue: true, cron: true, device: true };
  const hidden = fact({
    channel: "queue",
    name: "distribution.customers.fetched",
    label: "Sincronizando clientes",
    status: "running",
    ui: false,
  });

  assert.equal(activityVisible(hidden, enabled), false);
  assert.equal(activityVisible(hidden, { ...enabled, queue: false }, true), true);
});

test("a channel setting mutes declared facts and an empty label stays hidden", () => {
  const enabled = { queue: false, cron: true, device: true };
  const declared = fact({
    channel: "queue",
    name: "distribution.sale_order.created",
    label: "Creando orden de venta",
    status: "running",
    ui: true,
  });
  const blank = fact({
    channel: "cron",
    name: "SYNC_DISTRIBUTION_APP",
    label: "",
    status: "running",
    ui: true,
  });

  assert.equal(activityVisible(declared, enabled), false);
  assert.equal(activityVisible(declared, { ...enabled, queue: true }), true);
  assert.equal(activityVisible(blank, enabled), false);
});

test("running replaces the same job, failure clears it, success clears the failure", () => {
  const running = fact({
    channel: "queue",
    name: "distribution.sale_order.created",
    label: "Creando orden de venta",
    status: "running",
    ui: true,
  });
  const started = applyActivity(emptyActivity, running);
  assert.equal(started.running.length, 1);

  const failed = applyActivity(started, {
    ...running,
    id: "2",
    status: "failed",
    detail: "red",
  });
  assert.equal(failed.running.length, 0);
  assert.equal(failed.failure?.detail, "red");

  const again = applyActivity(failed, { ...running, id: "3", status: "running" });
  assert.equal(again.failure, undefined);
  assert.equal(again.running.length, 1);

  const done = applyActivity(again, { ...running, id: "4", status: "succeeded" });
  assert.equal(done.running.length, 0);
});

test("a device notice does not take the progress slot", () => {
  const progress = fact({
    channel: "queue",
    name: "common.print.v1.image_requested",
    label: "Imprimiendo...",
    status: "running",
    ui: true,
  });
  const notice = fact({
    channel: "device",
    name: "printer.connected",
    label: "Impresora conectada",
    detail: "Conectado a Caja",
    status: "succeeded",
    variant: "success",
    ui: true,
  });

  const next = applyActivity(applyActivity(emptyActivity, progress), notice);
  assert.equal(next.running.length, 1);
  assert.equal(next.notices.length, 1);
  assert.equal(next.failure, undefined);
});
