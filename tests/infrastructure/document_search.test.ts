import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { type Criteria, criteria, InvalidCriteria, resumingFrom } from "@sincpro/criteria";

import { sqliteDocuments } from "../../sincpro_mobile/adapters/repositories/document.repository.ts";
import { COUNT_CEILING } from "../../sincpro_mobile/domain/database/criteria_sql.ts";
import {
  Entity,
  ERemoteState,
  RemoteEntity,
} from "../../sincpro_mobile/domain/entity/entity.ts";
import { DBCursor } from "../../sincpro_mobile/infrastructure/database/index.ts";

class Ticket extends Entity {
  static make(data?: Partial<Ticket>): Ticket {
    return Ticket.obj<Ticket>(data);
  }

  number = 0;
  title = "";
  state = "open";
  priority: number | null = null;
  urgent = false;
}

class Product extends RemoteEntity {
  static make(data?: Partial<Product>): Product {
    return Product.obj<Product>(data);
  }

  static fromRemoteDTO(): Product {
    return Product.make();
  }

  sku = "";
}

const tickets = sqliteDocuments(Ticket, "search_tickets", {
  columns: { state: (ticket) => ticket.state },
});
const products = sqliteDocuments(Product, "search_products");

type Sorted = {
  field: "number" | "state" | "priority" | "urgent" | "uuid";
  descending?: boolean;
};

beforeEach(async () => {
  await tickets.count();
  await products.count();
  await DBCursor.mutateDatabase("DELETE FROM search_tickets");
  await DBCursor.mutateDatabase("DELETE FROM search_products");
});

async function saved(values: Partial<Ticket>[]): Promise<Ticket[]> {
  const made = values.map((one) => Ticket.make(one));
  await tickets.save(made);
  return made;
}

function scalar(value: unknown): number | string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value as number | string;
}

function compared(left: unknown, right: unknown): number {
  const a = scalar(left);
  const b = scalar(right);
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a < b ? -1 : 1;
}

/** The uuids in the order SQLite pages them: NULL first, `uuid` closing in the first direction. */
function inOrder(records: readonly Ticket[], sorts: readonly Sorted[]): string[] {
  const closed = sorts.some((sort) => sort.field === "uuid")
    ? sorts
    : [...sorts, { field: "uuid" as const, descending: sorts[0]?.descending === true }];
  return [...records]
    .sort((left, right) => {
      for (const sort of closed) {
        const side = compared(left[sort.field], right[sort.field]);
        if (side !== 0) return sort.descending ? -side : side;
      }
      return 0;
    })
    .map((record) => record.uuid);
}

async function walked(criteria: Criteria<Ticket>): Promise<string[]> {
  const seen: string[] = [];
  let asked = criteria;
  for (let pages = 0; pages < 100; pages++) {
    const page = await tickets.search(asked);
    seen.push(...page.toArray().map((record) => record.uuid));
    if (page.cursor === null) return seen;
    asked = resumingFrom(criteria, page.cursor);
  }
  throw new Error("the cursor never ended");
}

test("a page that names no order reads newest first, fifty at a time, and says how many", async () => {
  const made = await saved(Array.from({ length: 60 }, (_, index) => ({ number: index })));

  const page = await tickets.search();

  assert.equal(page.length, 50);
  assert.deepEqual(
    page.toArray().map((record) => record.uuid),
    inOrder(made, [{ field: "uuid", descending: true }]).slice(0, 50),
  );
  assert.notEqual(page.cursor, null);
  assert.deepEqual(page.total, { value: 60, exact: true });
});

test("the entity's DEFAULT_ORDER orders a page that names none", async () => {
  class Numbered extends Entity {
    static override DEFAULT_ORDER() {
      return [{ field: "number" }];
    }

    static make(data?: Partial<Numbered>): Numbered {
      return Numbered.obj<Numbered>(data);
    }

    number = 0;
  }
  const numbered = sqliteDocuments(Numbered, "search_numbered");
  await numbered.save([3, 1, 2].map((number) => Numbered.make({ number })));

  const page = await numbered.search();

  assert.deepEqual(
    page.toArray().map((record) => record.number),
    [1, 2, 3],
  );
});

test("walking the cursor visits every record once, in order, through ties and nulls", async () => {
  const priorities = [null, 2, 1, null, 2, 3, 1, null, 2, 2, 3, null, 1];
  const made = await saved(
    priorities.map((priority, index) => ({
      number: index,
      priority,
      state: index % 3 === 0 ? "closed" : "open",
      urgent: index % 2 === 0,
    })),
  );
  const orders: Sorted[][] = [
    [{ field: "priority" }],
    [{ field: "priority", descending: true }],
    [{ field: "state" }, { field: "priority", descending: true }],
    [{ field: "urgent", descending: true }, { field: "priority" }],
    [{ field: "uuid" }],
  ];

  for (const order of orders) {
    const seen = await walked({ order, pagination: { limit: 3 } });
    assert.deepEqual(seen, inOrder(made, order), JSON.stringify(order));
  }
});

test("the filter narrows the page and the count, and the cursor keeps to it", async () => {
  const made = await saved(
    Array.from({ length: 9 }, (_, index) => ({
      number: index,
      state: index < 7 ? "open" : "closed",
    })),
  );
  const open: Criteria<Ticket> = {
    selection: { field: "state", operator: "=", value: "open" },
    order: [{ field: "number" }],
    pagination: { limit: 2 },
  };

  const first = await tickets.search(open);
  const all = await walked(open);

  assert.deepEqual(first.total, { value: 7, exact: true });
  assert.deepEqual(
    all,
    inOrder(
      made.filter((record) => record.state === "open"),
      [{ field: "number" }],
    ),
  );
});

test("a page past rows skips them and mints no cursor: it is resumed by counting", async () => {
  await saved(Array.from({ length: 5 }, (_, index) => ({ number: index })));

  const page = await tickets.search({
    order: [{ field: "number" }],
    pagination: { limit: 2, strategy: { rows: 2 } },
  });

  assert.deepEqual(
    page.toArray().map((record) => record.number),
    [2, 3],
  );
  assert.equal(page.cursor, null);
});

test("the last page and an empty one have no cursor", async () => {
  await saved([{ number: 1 }, { number: 2 }]);

  const last = await tickets.search({ pagination: { limit: 2 } });
  const none = await tickets.search({ pagination: { limit: 0 } });

  assert.equal(last.cursor, null);
  assert.equal(none.length, 0);
  assert.equal(none.cursor, null);
});

test("a cursor minted under another ordering is refused, so a reading starts over", async () => {
  await saved(Array.from({ length: 4 }, (_, index) => ({ number: index })));
  const page = await tickets.search({
    order: [{ field: "number" }],
    pagination: { limit: 2 },
  });

  await assert.rejects(
    tickets.search(
      resumingFrom<Ticket>(
        { order: [{ field: "title" }], pagination: { limit: 2 } },
        page.cursor,
      ),
    ),
    InvalidCriteria,
  );
  await assert.rejects(
    tickets.search({ pagination: { limit: 2, strategy: { token: "not-a-cursor" } } }),
    InvalidCriteria,
  );
});

test("the count is what the criteria asks: none, up to the ceiling, or exact", async () => {
  await DBCursor.execAsync(
    `WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < ${COUNT_CEILING + 1})
     INSERT INTO search_tickets (uuid, version, data, state)
     SELECT printf('t-%06d', n), 1, json_object('number', n), 'open' FROM seq`,
  );

  const uncounted = await tickets.search({ pagination: { limit: 1 }, count: "none" });
  const capped = await tickets.count();
  const exact = await tickets.count({ count: "exact" });
  const narrowed = await tickets.count({
    selection: { field: "number", operator: "<=", value: 10 },
  });

  assert.equal(uncounted.total, null);
  assert.deepEqual(capped, { value: COUNT_CEILING, exact: false });
  assert.deepEqual(exact, { value: COUNT_CEILING + 1, exact: true });
  assert.deepEqual(narrowed, { value: 10, exact: true });
});

test("browse reads the ids asked, in their order, past one batch, skipping what is missing", async () => {
  const made = await saved(Array.from({ length: 1200 }, (_, index) => ({ number: index })));
  const asked = [...made].reverse().map((record) => record.uuid);

  const found = await tickets.browse(["missing", ...asked, made[0].uuid]);

  assert.deepEqual(
    found.toArray().map((record) => record.uuid),
    [...asked, made[0].uuid],
  );
});

test("findByRemoteIds and findByRemoteState group what they find in the order asked", async () => {
  const [a, b, c] = ["a", "b", "c"].map((sku, index) =>
    Product.make({ sku, remoteId: index + 1 }),
  );
  await products.save([a, b, c]);
  await products.acknowledge(b);

  const byRemoteId = await products.findByRemoteIds([3, 1, 99]);
  const byState = await products.findByRemoteState([
    ERemoteState.SYNCED,
    ERemoteState.PENDING,
  ]);
  const one = await products.findByRemoteId(2);

  assert.deepEqual(
    byRemoteId.toArray().map((product) => product.sku),
    ["c", "a"],
  );
  assert.equal(byState.toArray()[0].sku, "b");
  assert.deepEqual(
    byState
      .toArray()
      .slice(1)
      .map((product) => product.sku)
      .sort(),
    ["a", "c"],
  );
  assert.equal(one?.sku, "b");
});

test("a reading counts once: its first page; a page that resumes counts only when asked", async () => {
  await saved(Array.from({ length: 7 }, (_, index) => ({ number: index })));
  const asked = criteria<Ticket>().order("number").limit(3);

  const first = await tickets.search(asked);
  const resumed = await tickets.search(asked.cursor(first.cursor));
  const skipped = await tickets.search(asked.offset(3));
  const always = await tickets.search(asked.counting("exact").cursor(first.cursor));

  assert.deepEqual(first.total, { value: 7, exact: true });
  assert.equal(resumed.total, null, "a Reading keeps what the first page counted");
  assert.equal(skipped.total, null);
  assert.deepEqual(always.total, { value: 7, exact: true });
});
