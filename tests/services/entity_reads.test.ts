import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { BoundedContext, configureProcess, failureOf } from "@sincpro/client-framework";
import {
  memoryLogger,
  type MemoryReporter,
  memoryReporter,
  type MemoryTracer,
  memoryTracer,
} from "@sincpro/client-framework/testing";
import { type Criteria, type Page, resource } from "@sincpro/criteria";

import { sqliteDocuments } from "../../sincpro_mobile/adapters/repositories/document.repository.ts";
import { TEXT } from "../../sincpro_mobile/domain/database/criteria.ts";
import { Entity } from "../../sincpro_mobile/domain/entity/entity.ts";
import {
  Get,
  GetMany,
  LiteralSearch,
  Search,
} from "../../sincpro_mobile/domain/reads/queries.ts";
import { AggregateNotFound } from "../../sincpro_mobile/exceptions.ts";
import { EntityReads } from "../../sincpro_mobile/framework/entity_reads.ts";
import { DBCursor } from "../../sincpro_mobile/infrastructure/database/index.ts";

class Ticket extends Entity {
  static make(data?: Partial<Ticket>): Ticket {
    return Ticket.obj<Ticket>(data);
  }

  static override DEFAULT_ORDER() {
    return [{ field: "number" }];
  }

  static override DEFAULT_DISPLAY(): string {
    return "title";
  }

  static override DEFAULT_LITERAL_SEARCH(): Criteria | null {
    return {
      selection: {
        all: [
          { field: "state", operator: "=", value: "open" },
          {
            any: [
              { field: "code", operator: "starts with", value: TEXT },
              { field: "title", operator: "like", value: TEXT },
            ],
          },
        ],
      },
    };
  }

  number = 0;
  code = "";
  title = "";
  state = "open";
}

class Customer extends Entity {
  static make(data?: Partial<Customer>): Customer {
    return Customer.obj<Customer>(data);
  }

  static override DEFAULT_GET_ID(): string {
    return "vat";
  }

  static override DEFAULT_LITERAL_SEARCH(): Criteria | null {
    return null;
  }

  vat = "";
}

class Tag extends Entity {
  static make(data?: Partial<Tag>): Tag {
    return Tag.obj<Tag>(data);
  }
}

const tickets = sqliteDocuments(Ticket, "reads_tickets");
const customers = sqliteDocuments(Customer, "reads_customers");
const tags = sqliteDocuments(Tag, "reads_tags");

const ticketsBoundedContext = new BoundedContext("tickets");

class CommandSearchTickets extends Search(Ticket) {
  constructor(
    criteria: Criteria<Ticket> = {},
    readonly includeClosed = false,
  ) {
    super(criteria);
  }
}

@ticketsBoundedContext.feature(CommandSearchTickets)
class SearchTickets extends EntityReads<CommandSearchTickets> {
  protected override search(query: CommandSearchTickets) {
    if (query.includeClosed) return super.search(query);
    return super.search(query, {
      selection: { field: "state", operator: "=", value: "open" },
    });
  }
}

class CommandGetTicket extends Get(Ticket) {}

class CommandFindTickets extends LiteralSearch(Ticket) {}

@ticketsBoundedContext.feature([CommandGetTicket, CommandFindTickets])
class TicketReads extends EntityReads<CommandGetTicket | CommandFindTickets> {}

class CommandGetManyTickets extends GetMany(Ticket) {}

@ticketsBoundedContext.feature(CommandGetManyTickets)
class GetManyTickets extends EntityReads<CommandGetManyTickets> {}

class CommandGetCustomer extends Get(Customer) {}

class CommandFindCustomers extends LiteralSearch(Customer) {}

@ticketsBoundedContext.feature([CommandGetCustomer, CommandFindCustomers])
class CustomerReads extends EntityReads<CommandGetCustomer | CommandFindCustomers> {}

class CommandFindTags extends LiteralSearch(Tag) {}

@ticketsBoundedContext.feature(CommandFindTags)
class FindTags extends EntityReads<CommandFindTags> {}

let tracer: MemoryTracer;
let reporter: MemoryReporter;

beforeEach(async () => {
  tracer = memoryTracer();
  reporter = memoryReporter();
  configureProcess({ tracer, reporter, logger: { engine: memoryLogger() } });
  for (const [repository, table] of [
    [tickets, "reads_tickets"],
    [customers, "reads_customers"],
    [tags, "reads_tags"],
  ] as const) {
    await repository.count();
    await DBCursor.mutateDatabase(`DELETE FROM ${table}`);
  }
});

async function ticketsNumbered(count: number, closed: number[] = []): Promise<Ticket[]> {
  const made = Array.from({ length: count }, (_, number) =>
    Ticket.make({
      number,
      code: `T-${String(number).padStart(3, "0")}`,
      title: `Ticket ${number}`,
      state: closed.includes(number) ? "closed" : "open",
    }),
  );
  await tickets.save([...made].reverse());
  return made;
}

const numbers = (page: Page<Ticket>) => page.rows.map((ticket) => ticket.number);

test("Search answers a page as a remote one: rows, cursor, count, in the entity's order", async () => {
  await ticketsNumbered(5);

  const page = await ticketsBoundedContext.execute(
    new CommandSearchTickets({ pagination: { limit: 2 } }),
  );

  assert.deepEqual(numbers(page), [0, 1]);
  assert.notEqual(page.cursor, null);
  assert.deepEqual(page.count, { value: 5, exact: true });
  assert.equal(page.meta?.identity, "uuid");
  assert.equal(page.meta?.display, "title");
  assert.equal(page.meta?.default_order, "number");
  assert.equal(page.meta?.fields.number?.type, "integer");
  assert.equal(page.meta?.fields.title?.type, "text");
  assert.ok(page.meta?.fields.title?.ops.includes("like"), "a screen knows how to filter it");
  assert.deepEqual(page.dropped, []);
  assert.ok(tracer.spans.some((span) => span.name === "tickets/SearchTickets"));
});

test("the scope a use case adds joins the caller's criteria; the caller's order wins", async () => {
  await ticketsNumbered(6, [1, 4]);

  const open = await ticketsBoundedContext.execute(
    new CommandSearchTickets({
      selection: { field: "number", operator: ">=", value: 1 },
      order: [{ field: "number", descending: true }],
    }),
  );
  const all = await ticketsBoundedContext.execute(new CommandSearchTickets({}, true));

  assert.deepEqual(numbers(open), [5, 3, 2]);
  assert.deepEqual(open.count, { value: 3, exact: true });
  assert.deepEqual(numbers(all), [0, 1, 2, 3, 4, 5]);
});

test("a Reading over Search walks every page with its cursor, as it walks a remote one", async () => {
  await ticketsNumbered(23, [7]);
  const source = resource<Ticket>((criteria) =>
    ticketsBoundedContext.execute(new CommandSearchTickets(criteria)),
  );

  const reading = source.read({ pagination: { limit: 5 } });
  await reading.load();
  while (reading.hasMore) await reading.more();

  assert.deepEqual(
    reading.rows.map((ticket) => ticket.number),
    Array.from({ length: 23 }, (_, number) => number).filter((number) => number !== 7),
  );
  assert.deepEqual(reading.count, { value: 22, exact: true });
});

test("Get answers the record of a key, or a not_found refusal that is never reported", async () => {
  const [first] = await ticketsNumbered(2);

  const found = await ticketsBoundedContext.execute(new CommandGetTicket(first.uuid));
  const error = await ticketsBoundedContext
    .execute(new CommandGetTicket("missing"))
    .catch((caught: unknown) => caught);

  assert.ok(found instanceof Ticket);
  assert.equal(found.number, 0);
  assert.ok(error instanceof AggregateNotFound);
  assert.equal(failureOf(error).kind, "not_found");
  assert.equal(
    tracer.spans.filter((span) => span.name === "tickets/TicketReads").at(-1)?.outcome,
    "refused",
  );
  assert.equal(reporter.reports.length, 0);
});

test("Get finds a record by the entity's natural key and keeps to the caller's filter", async () => {
  await customers.save([Customer.make({ vat: "1020", name: "ACME" })]);

  const found = await ticketsBoundedContext.execute(new CommandGetCustomer("1020"));
  const filtered = await ticketsBoundedContext
    .execute(
      new CommandGetCustomer("1020", {
        selection: { field: "name", operator: "=", value: "Other" },
      }),
    )
    .catch((caught: unknown) => caught);

  assert.equal(found.name, "ACME");
  assert.ok(filtered instanceof AggregateNotFound);
});

test("GetMany answers in the order asked, a repeated key once, and lists the missing", async () => {
  const made = await ticketsNumbered(4);

  const found = await ticketsBoundedContext.execute(
    new CommandGetManyTickets([made[3].uuid, "gone", made[0].uuid, made[3].uuid]),
  );
  const none = await ticketsBoundedContext.execute(new CommandGetManyTickets([]));

  assert.deepEqual(
    found.records.map((ticket) => ticket.number),
    [3, 0],
  );
  assert.deepEqual(found.missing, ["gone"]);
  assert.deepEqual(none, { records: [], missing: [] });
});

test("LiteralSearch matches the text as the entity declares it, in a short page", async () => {
  await ticketsNumbered(12, [2]);

  const byCode = await ticketsBoundedContext.execute(new CommandFindTickets("T-01"));
  const byTitle = await ticketsBoundedContext.execute(new CommandFindTickets("ticket 1"));
  const blank = await ticketsBoundedContext.execute(new CommandFindTickets("   "));
  const longer = await ticketsBoundedContext.execute(
    new CommandFindTickets("", { pagination: { limit: 20 } }),
  );

  assert.deepEqual(numbers(byCode), [10, 11]);
  assert.deepEqual(numbers(byTitle), [1, 10, 11]);
  assert.deepEqual(numbers(blank), [0, 1, 3, 4, 5, 6, 7, 8]);
  assert.equal(longer.rows.length, 11, "the template's own condition holds without a text");
});

test("an entity that searches nothing finds nothing for a text; a blank text is its first page", async () => {
  await customers.save([Customer.make({ vat: "1", name: "ACME" })]);

  const typed = await ticketsBoundedContext.execute(new CommandFindCustomers("ACME"));
  const blank = await ticketsBoundedContext.execute(new CommandFindCustomers(""));

  assert.equal(typed.rows.length, 0);
  assert.equal(blank.rows.length, 1);
});

test("by default a text is searched in the entity's name", async () => {
  await tags.save(["urgent", "billing", "urgent-later"].map((name) => Tag.make({ name })));

  const page = await ticketsBoundedContext.execute(new CommandFindTags("URGENT"));

  assert.deepEqual(page.rows.map((tag) => tag.name).sort(), ["urgent", "urgent-later"]);
});

test("one Feature answers every read it is registered for, under its own name", async () => {
  await ticketsNumbered(1);

  await ticketsBoundedContext.execute(new CommandFindTickets("T"));
  await ticketsBoundedContext.execute(new CommandGetManyTickets([]));

  assert.ok(tracer.spans.some((span) => span.name === "tickets/TicketReads"));
  assert.ok(tracer.spans.some((span) => span.name === "tickets/GetManyTickets"));
  assert.equal(ticketsBoundedContext.handlerOf(CommandFindTickets), TicketReads);
  assert.equal(ticketsBoundedContext.handlerOf(CommandGetCustomer), CustomerReads);
  assert.equal(ticketsBoundedContext.handlerOf(CommandSearchTickets), SearchTickets);
  assert.equal(ticketsBoundedContext.handlerOf(CommandGetManyTickets), GetManyTickets);
  assert.equal(ticketsBoundedContext.handlerOf(CommandFindTags), FindTags);
});
