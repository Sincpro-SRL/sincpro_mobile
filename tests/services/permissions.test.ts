import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { configureProcess, failureOf } from "@sincpro/client-framework";
import { type MemoryTracer, memoryTracer } from "@sincpro/client-framework/testing";

import { PrinterAdapter } from "../../sincpro_mobile/adapters/Printer.adapter.ts";
import type { Notice } from "../../sincpro_mobile/domain/notifier.ts";
import {
  type DevicePermissions,
  EPermission,
  type PermissionStates,
  type PermissionStatus,
} from "../../sincpro_mobile/domain/permissions.ts";
import { BluetoothPermissionDenied } from "../../sincpro_mobile/exceptions.ts";
import type { CommonDependencies } from "../../sincpro_mobile/infrastructure/dependencies.ts";
import { createPermissionStates } from "../../sincpro_mobile/infrastructure/permission_states.ts";
import {
  CommandCheckPermission,
  CommandOpenPermissionSettings,
  CommandRequestPermission,
  commonBoundedContext,
} from "../../sincpro_mobile/services/index.ts";
import { permissionPrompt } from "../../sincpro_mobile/ui/permissions/prompt.ts";

/** The phone's permissions in a test: where each stands, what the dialog answers, what was shown. */
function phone(now: PermissionStatus, answer: PermissionStatus = now) {
  const shown = { dialogs: 0, settings: 0 };
  const permissions: DevicePermissions = {
    check: async () => now,
    request: async () => {
      shown.dialogs++;
      return answer;
    },
    openSettings: async () => {
      shown.settings++;
    },
  };
  return { permissions, shown };
}

let tracer: MemoryTracer;
let notices: Notice[];
let states: PermissionStates;
let restores: (() => void)[];

function swap<K extends keyof CommonDependencies>(name: K, fake: object): void {
  const current = commonBoundedContext.deps[name];
  commonBoundedContext.addDependency(name, fake as CommonDependencies[K], {
    replaces: current,
  });
  restores.push(() =>
    commonBoundedContext.addDependency(name, current, {
      replaces: fake as CommonDependencies[K],
    }),
  );
}

const spanOf = (useCase: string) => tracer.spans.find((span) => span.name === useCase);
const told = () => notices.map((notice) => notice.name);

beforeEach(() => {
  tracer = memoryTracer();
  configureProcess({ tracer });
  notices = [];
  restores = [];
  states = createPermissionStates();
  swap("notifier", { notify: (notice: Notice) => void notices.push(notice) });
  swap("permissionStates", states);
});

afterEach(() => {
  for (const restore of restores.reverse()) restore();
});

test("checking a permission never shows a dialog, and every screen following it sees it", async () => {
  const { permissions, shown } = phone("denied");
  swap("permissions", permissions);
  let followers = 0;
  states.subscribe(() => followers++);

  const status = await commonBoundedContext.execute(
    new CommandCheckPermission(EPermission.LOCATION),
  );

  assert.equal(status, "denied");
  assert.deepEqual(shown, { dialogs: 0, settings: 0 });
  assert.equal(states.get(EPermission.LOCATION), "denied");
  assert.equal(followers, 1);
  assert.deepEqual(told(), [], "a check tells the person nothing");
});

test("the system's dialog is shown only when it can still ask", async () => {
  for (const now of ["granted", "blocked", "unavailable"] as const) {
    const { permissions, shown } = phone(now);
    swap("permissions", permissions);

    const status = await commonBoundedContext.execute(
      new CommandRequestPermission(EPermission.BLUETOOTH),
    );

    assert.equal(status, now);
    assert.equal(shown.dialogs, 0, `${now}: no dialog`);
  }
  assert.deepEqual(
    told(),
    ["permission.blocked", "permission.unavailable"],
    "granted already is nothing to tell; blocked says where to grant it",
  );
});

test("a denial is the person's answer: told, recorded, and the run is not a failure", async () => {
  const { permissions, shown } = phone("denied", "denied");
  swap("permissions", permissions);

  const status = await commonBoundedContext.execute(
    new CommandRequestPermission(EPermission.LOCATION),
  );

  assert.equal(status, "denied");
  assert.equal(shown.dialogs, 1);
  assert.deepEqual(told(), ["permission.denied"]);
  assert.equal(states.get(EPermission.LOCATION), "denied");
  const span = spanOf("common/RequestPermission");
  assert.equal(span?.outcome, "ok");
  assert.equal(span?.attributes["permission.kind"], "location");
  assert.equal(span?.attributes["permission.asked"], true);
});

test("granted at the dialog: the person is told and every screen follows", async () => {
  const { permissions } = phone("denied", "granted");
  swap("permissions", permissions);

  await commonBoundedContext.execute(new CommandRequestPermission(EPermission.BLUETOOTH));

  assert.deepEqual(told(), ["permission.granted"]);
  assert.equal(states.get(EPermission.BLUETOOTH), "granted");
});

test("«don't ask again» at the dialog leads to the settings, opened through a run", async () => {
  const { permissions, shown } = phone("denied", "blocked");
  swap("permissions", permissions);

  const status = await commonBoundedContext.execute(
    new CommandRequestPermission(EPermission.BLUETOOTH),
  );
  const prompt = permissionPrompt(EPermission.BLUETOOTH, status);
  await commonBoundedContext.execute(
    new CommandOpenPermissionSettings(EPermission.BLUETOOTH),
  );

  assert.deepEqual(told(), ["permission.blocked"]);
  assert.equal(prompt.action, "settings");
  assert.equal(shown.settings, 1);
  assert.equal(
    spanOf("common/OpenPermissionSettings")?.attributes["permission.kind"],
    "bluetooth",
  );
});

test("the printer never asks for Bluetooth: without it, connecting and scanning fail, no dialog", async () => {
  const { permissions, shown } = phone("denied", "granted");
  const printer = new PrinterAdapter(permissions);

  await assert.rejects(printer.connect("AA:BB", "Caja 1"), BluetoothPermissionDenied);
  await assert.rejects(printer.scanPrinters(), BluetoothPermissionDenied);

  assert.equal(shown.dialogs, 0, "a print from the queue runs with no one looking");
  const error = await printer.connect("AA:BB", "Caja 1").catch((caught: unknown) => caught);
  assert.equal(failureOf(error).kind, "permission_denied");
});

test("a screen reads what it is for before the dialog, and the action that fits", () => {
  assert.deepEqual(permissionPrompt(EPermission.BLUETOOTH, "denied"), {
    message: "Para buscar la impresora, conectarla e imprimir.",
    action: "request",
    actionLabel: "Permitir",
  });
  assert.equal(
    permissionPrompt(EPermission.LOCATION, "denied", "Para la ruta del día.").message,
    "Para la ruta del día.",
  );
  assert.equal(permissionPrompt(EPermission.LOCATION, "granted").action, null);
  assert.equal(permissionPrompt(EPermission.LOCATION, undefined).action, null);
  assert.equal(permissionPrompt(EPermission.BLUETOOTH, "unavailable").action, null);
});
