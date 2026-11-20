import assert from "node:assert/strict";
import { afterEach, before, beforeEach, test } from "node:test";

import {
  configureProcess,
  type DomainEvent,
  failureOf,
  Publisher,
} from "@sincpro/client-framework";
import { memoryLogger, memoryTracer } from "@sincpro/client-framework/testing";

import { printJobRepository } from "../../sincpro_mobile/adapters/repositories/print_job.repository.ts";
import type { Notice, Notifier } from "../../sincpro_mobile/domain/notifier.ts";
import type { PrintImageRequestedEvent } from "../../sincpro_mobile/domain/print/events.ts";
import {
  EPrintJobScope,
  EPrintPages,
  type PrintPage,
} from "../../sincpro_mobile/domain/print/print_job.ts";
import MIGRATIONS, {
  DATABASE_TABLES,
} from "../../sincpro_mobile/entrypoints/db/migrations.ts";
import { printCycleHandlers } from "../../sincpro_mobile/entrypoints/webview/print_cycle.ts";
import { DBCursor } from "../../sincpro_mobile/infrastructure/database/index.ts";
import type { CommonDependencies } from "../../sincpro_mobile/infrastructure/dependencies.ts";
import { PrintJobPromptStore } from "../../sincpro_mobile/infrastructure/print/print_job_prompt.ts";
import { PagePrintWatch } from "../../sincpro_mobile/infrastructure/webview/page_print_watch.ts";
import {
  CommandCancelPrintJob,
  CommandOpenPrintJob,
  CommandPrintJobPages,
  CommandReceivePrintPage,
  CommandResumePrintJobs,
  commonBoundedContext,
} from "../../sincpro_mobile/services/index.ts";

let notices: Notice[];
let queued: PrintImageRequestedEvent[];
let prompt: PrintJobPromptStore;
let restores: (() => void)[];
let failQueueAt: number | null;

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

function printsPages(mode: EPrintPages): void {
  commonBoundedContext.deps.printer.configure({ pages: mode });
}

const page = (image: string): PrintPage => ({ image, width: 544, height: 300 });
const titles = () => queued.map((event) => event.title);
const images = () => queued.map((event) => event.imageBase64);

/** The pages of a print of `total`, as the WebView's capture sends them. */
async function arrive(jobId: string, total: number, order?: number[]): Promise<void> {
  const places = order ?? Array.from({ length: total }, (_, at) => at + 1);
  for (const place of places) {
    await commonBoundedContext.execute(
      new CommandReceivePrintPage(jobId, "Tickets", place, total, page(`ticket-${place}`)),
    );
  }
}

before(async () => {
  const migration = MIGRATIONS.find((one) => one.name === DATABASE_TABLES.PRINT_JOBS);
  assert.ok(migration, "the print jobs migration exists");
  await migration.migrationFn();
});

beforeEach(async () => {
  configureProcess({ tracer: memoryTracer(), logger: { engine: memoryLogger() } });
  await DBCursor.execAsync(
    `DELETE FROM ${DATABASE_TABLES.PRINT_JOB_PAGES}; DELETE FROM ${DATABASE_TABLES.PRINT_JOBS};`,
  );
  notices = [];
  queued = [];
  restores = [];
  failQueueAt = null;
  prompt = new PrintJobPromptStore();
  const notifier: Notifier = { notify: (notice) => void notices.push(notice) };
  const queue = {
    put: async (event: DomainEvent) => {
      if (failQueueAt === queued.length + 1) throw new Error("disk full");
      queued.push(event as PrintImageRequestedEvent);
    },
    drain: async () => undefined,
  };
  swap("notifier", notifier);
  swap("printJobPrompt", prompt);
  swap("publisher", new Publisher(queue as never));
  printsPages(EPrintPages.ASK);
});

afterEach(() => {
  for (const restore of restores.reverse()) restore();
  printsPages(EPrintPages.ASK);
});

test("N pages arriving in any order make one job, offered once and printing nothing yet", async () => {
  await arrive("job-1", 3, [2, 3, 1]);
  await arrive("job-1", 3, [3]);

  assert.equal(queued.length, 0, "the person chooses first");
  const offer = prompt.current();
  assert.deepEqual(offer?.job, { id: "job-1", title: "Tickets", total: 3, printed: 0 });
  assert.equal(offer?.next?.image, "ticket-1");
  assert.deepEqual(
    notices.map((notice) => `${notice.key}:${notice.name}`),
    ["print:job-1:printer.job_ready"],
  );
});

test("one by one: each «Siguiente» queues the next page alone, the last forgets the job", async () => {
  await arrive("job-1", 3);

  await commonBoundedContext.execute(new CommandPrintJobPages("job-1", EPrintJobScope.NEXT));
  assert.deepEqual(titles(), ["Tickets · 1 de 3"]);
  assert.equal(prompt.current()?.job.printed, 1);
  assert.equal(prompt.current()?.next?.image, "ticket-2");

  await commonBoundedContext.execute(new CommandPrintJobPages("job-1", EPrintJobScope.NEXT));
  await commonBoundedContext.execute(new CommandPrintJobPages("job-1", EPrintJobScope.NEXT));

  assert.deepEqual(images(), ["ticket-1", "ticket-2", "ticket-3"]);
  assert.ok(
    queued.every((event) => event.jobId === "job-1"),
    "every page under the job's notice",
  );
  assert.equal(prompt.current(), null);
  assert.equal(await printJobRepository.find("job-1"), null);
  await assert.rejects(
    commonBoundedContext.execute(new CommandPrintJobPages("job-1", EPrintJobScope.NEXT)),
    (error) => failureOf(error).kind === "invalid",
    "a job that ended prints nothing more",
  );
});

test("«Imprimir las restantes» queues every page left, in order, after the ones that went", async () => {
  await arrive("job-1", 4);
  await commonBoundedContext.execute(new CommandPrintJobPages("job-1", EPrintJobScope.NEXT));

  await commonBoundedContext.execute(new CommandPrintJobPages("job-1", EPrintJobScope.REST));

  assert.deepEqual(images(), ["ticket-1", "ticket-2", "ticket-3", "ticket-4"]);
  assert.deepEqual(titles().slice(1), [
    "Tickets · 2 de 4",
    "Tickets · 3 de 4",
    "Tickets · 4 de 4",
  ]);
  assert.equal(prompt.current(), null);
});

test("a page moved by one run is not moved again by a run holding the old count", async () => {
  await arrive("job-1", 3);

  assert.equal(await printJobRepository.advance("job-1", 0, 1), true);
  assert.equal(await printJobRepository.advance("job-1", 0, 1), false);
  assert.equal((await printJobRepository.find("job-1"))?.printed, 1);
});

test("an app that prints step by step queues the first page and waits for the next", async () => {
  printsPages(EPrintPages.STEP);

  await arrive("job-1", 3);

  assert.deepEqual(images(), ["ticket-1"]);
  assert.equal(prompt.current()?.job.printed, 1);
});

test("an app that prints everything queues every page and asks nothing", async () => {
  printsPages(EPrintPages.ALL);

  await arrive("job-1", 3);

  assert.deepEqual(images(), ["ticket-1", "ticket-2", "ticket-3"]);
  assert.equal(prompt.current(), null);
  assert.equal(await printJobRepository.find("job-1"), null);
});

test("a page that cannot be queued puts the job back on it, to ask again", async () => {
  await arrive("job-1", 3);
  failQueueAt = 2;

  await assert.rejects(
    commonBoundedContext.execute(new CommandPrintJobPages("job-1", EPrintJobScope.REST)),
    /disk full/,
  );

  assert.deepEqual(images(), ["ticket-1"]);
  assert.equal(prompt.current()?.job.printed, 1);
  assert.equal(prompt.current()?.next?.image, "ticket-2");
  assert.equal(notices.at(-1)?.name, "printer.print_failed");

  failQueueAt = null;
  await commonBoundedContext.execute(new CommandPrintJobPages("job-1", EPrintJobScope.REST));
  assert.deepEqual(images(), ["ticket-1", "ticket-2", "ticket-3"]);
});

test("cancelling stops the pages left and says how many came out", async () => {
  await arrive("job-1", 3);
  await commonBoundedContext.execute(new CommandPrintJobPages("job-1", EPrintJobScope.NEXT));

  await commonBoundedContext.execute(new CommandCancelPrintJob("job-1"));

  assert.equal(queued.length, 1);
  assert.equal(prompt.current(), null);
  assert.equal(await printJobRepository.find("job-1"), null);
  const cancelled = notices.at(-1);
  assert.equal(cancelled?.name, "printer.job_cancelled");
  assert.match(String(cancelled?.message), /1 de 3 páginas impresas/);
});

test("on start, a job left waiting comes back where it was; one whose pages never all came is forgotten", async () => {
  await arrive("job-1", 3);
  await commonBoundedContext.execute(new CommandPrintJobPages("job-1", EPrintJobScope.NEXT));
  await arrive("job-2", 3, [1]);
  prompt = new PrintJobPromptStore();
  swap("printJobPrompt", prompt);

  const resumed = await commonBoundedContext.execute(new CommandResumePrintJobs());

  assert.equal(resumed, 1);
  assert.equal(prompt.current()?.job.id, "job-1");
  assert.equal(prompt.current()?.next?.image, "ticket-2");
  await arrive("job-2", 3, [2, 3]);
  assert.equal(
    prompt.current()?.job.id,
    "job-1",
    "job-2 started over: its first page is gone",
  );
});

test("any code opens a job of its own pages; one page prints as any image, none is refused", async () => {
  const jobId = await commonBoundedContext.execute(
    new CommandOpenPrintJob("Etiquetas", [page("a"), page("b")]),
  );
  assert.equal(prompt.current()?.job.id, jobId);
  assert.equal(prompt.current()?.job.total, 2);
  assert.equal(queued.length, 0);

  await commonBoundedContext.execute(new CommandOpenPrintJob("Recibo", [page("only")]));
  assert.deepEqual(images(), ["only"]);

  await assert.rejects(
    commonBoundedContext.execute(new CommandOpenPrintJob("Nada", [])),
    (error) => failureOf(error).kind === "invalid",
  );
});

test("the page's print cycle: pages of N become one job; a failed capture forgets what arrived", async () => {
  const watch = new PagePrintWatch(1_000);
  const handlers = printCycleHandlers(watch);
  const post = (message: object) =>
    handlers[(message as { type: string }).type]!(message as never);
  const image = (jobId: string, at: number, pages: number) => ({
    type: "PRINT_IMAGE",
    image: `ticket-${at}`,
    width: 544,
    height: 300,
    page: at,
    pages,
    jobId,
    metadata: { title: "Tickets" },
  });

  await post({ type: "PRINT_STARTED", title: "Tickets", pages: 2, jobId: "job-1" });
  await post(image("job-1", 1, 2));
  assert.ok(watch.isWatching("job-1"), "the next page is still awaited");
  await post(image("job-1", 2, 2));
  assert.equal(watch.isWatching("job-1"), false);
  assert.equal(prompt.current()?.job.total, 2);
  assert.equal(queued.length, 0);

  await post({ type: "PRINT_STARTED", title: "Tickets", pages: 3, jobId: "job-2" });
  await post(image("job-2", 1, 3));
  await post({ type: "PRINT_FAILED", title: "Tickets", reason: "tainted", jobId: "job-2" });
  assert.equal(
    (
      await DBCursor.getAllAsync(
        `SELECT page FROM ${DATABASE_TABLES.PRINT_JOB_PAGES} WHERE job_id = ?`,
        "job-2",
      )
    ).length,
    0,
  );
  assert.equal(notices.at(-1)?.name, "printer.capture_failed");
});
