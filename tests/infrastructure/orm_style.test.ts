import assert from "node:assert/strict";
import { before, test } from "node:test";

import { criteria, type CriteriaFor, resumingFrom, selection } from "@sincpro/criteria";

import {
  DocumentRepository,
  sqliteDocuments,
} from "../../sincpro_mobile/adapters/repositories/document.repository.ts";
import { identifier, sql } from "../../sincpro_mobile/domain/database/sql.ts";
import { Entity } from "../../sincpro_mobile/domain/entity/entity.ts";
import { DomainValidationError } from "../../sincpro_mobile/exceptions.ts";
import { DBCursor } from "../../sincpro_mobile/infrastructure/database/index.ts";
import { queryPage } from "../../sincpro_mobile/infrastructure/database/paged_query.ts";

class Customer extends Entity {
  static make(data?: Partial<Customer>): Customer {
    return Customer.obj<Customer>(data);
  }

  vat = "";
  city = "";
}

class Ticket extends Entity {
  static make(data?: Partial<Ticket>): Ticket {
    return Ticket.obj<Ticket>(data);
  }

  static override DEFAULT_ORDER() {
    return [{ field: "number" }];
  }

  number = 0;
  state = "open";
  priority = 0;
  total = 0;
  customerId = "";
}

/** A domain's repository: what it asks by name, over everything the repository answers. */
class Tickets extends DocumentRepository<Ticket> {
  open(asked: CriteriaFor<Ticket> = {}) {
    return this.search(criteria<Ticket>().selection(["state", "=", "open"]).merge(asked));
  }

  ofCity(city: string, asked: CriteriaFor<Ticket> = {}) {
    return this.searchSql(
      sql`SELECT t.* FROM tickets t
          JOIN customers c ON c.uuid = json_extract(t.data, '$.customerId')
          WHERE json_extract(c.data, '$.city') = ${city}`,
      criteria(asked),
    );
  }
}

const customers = sqliteDocuments(Customer, "customers");
const tickets = sqliteDocuments(Ticket, "tickets", { repository: Tickets });

let made: Ticket[] = [];

before(async () => {
  const [north, south] = [
    Customer.make({ name: "Norte", vat: "1", city: "La Paz" }),
    Customer.make({ name: "Sur", vat: "2", city: "Tarija" }),
  ];
  await customers.save([north, south]);
  made = Array.from({ length: 10 }, (_, number) =>
    Ticket.make({
      number,
      state: number % 3 === 0 ? "closed" : "open",
      priority: number % 4,
      total: number * 10,
      customerId: number < 6 ? north.uuid : south.uuid,
    }),
  );
  await tickets.save(made);
});

const numbers = (records: { toArray(): Ticket[] }) =>
  records.toArray().map((ticket) => ticket.number);

test("a repository of one's own is the template: its questions by name, typed", async () => {
  const open = await tickets.open(criteria<Ticket>().limit(3));

  assert.ok(tickets instanceof Tickets);
  assert.deepEqual(numbers(open), [1, 2, 4]);
  assert.deepEqual(open.total, { value: 6, exact: true });
});

test("the backend's words read one, several, all, the first and whether any", async () => {
  const one = await tickets.get(made[4].uuid);
  const several = await tickets.browse([made[7].uuid, "gone", made[2].uuid]);
  const closed = await tickets.fetchAll(
    criteria<Ticket>().selection(["state", "=", "closed"]),
  );
  const first = await tickets.first(criteria<Ticket>().order("-total"));
  const none = await tickets.exists(criteria<Ticket>().selection(["total", ">", 1000]));

  assert.equal(one?.number, 4);
  assert.deepEqual(numbers(several), [7, 2]);
  assert.deepEqual(numbers(closed), [0, 3, 6, 9]);
  assert.equal(first?.number, 9);
  assert.equal(none, false);
});

test("AND, OR and NOT nest as the builder writes them, read in SQL", async () => {
  const asked = criteria<Ticket>().selection(
    ["state", "=", "open"],
    selection.any(selection.all(["priority", ">=", 2], ["total", "<", 50]), [
      "number",
      "in",
      [8],
    ]),
    selection.negate(["number", "=", 2]),
  );

  const found = await tickets.fetchAll(asked);

  assert.deepEqual(
    numbers(found),
    made
      .filter(
        (ticket) =>
          ticket.state === "open" &&
          ((ticket.priority >= 2 && ticket.total < 50) || ticket.number === 8) &&
          ticket.number !== 2,
      )
      .map((ticket) => ticket.number),
  );
});

test("a SQL statement too particular for a criteria still reads a page: joined, filtered, paged, counted", async () => {
  const first = await tickets.ofCity(
    "La Paz",
    criteria<Ticket>().selection(["state", "=", "open"]).order("-total").limit(2),
  );
  const next = await tickets.ofCity(
    "La Paz",
    resumingFrom(
      criteria<Ticket>().selection(["state", "=", "open"]).order("-total").limit(2).value,
      first.cursor,
    ),
  );

  assert.deepEqual(numbers(first), [5, 4]);
  assert.deepEqual(first.total, { value: 4, exact: true });
  assert.deepEqual(numbers(next), [2, 1]);
  assert.equal(next.cursor, null);
});

test("a report is a statement of its own, paged by cursor or by rows, and counted", async () => {
  type Row = { uuid: string; number: number; vat: string };
  const report = sql`SELECT t.uuid, json_extract(t.data, '$.number') AS number,
      json_extract(c.data, '$.vat') AS vat
    FROM tickets t JOIN customers c ON c.uuid = json_extract(t.data, '$.customerId')`;
  const asked = criteria<Row>().selection(["vat", "=", "2"]).order("number").limit(3);

  const page = await queryPage<Row>(report, asked, { identity: "uuid" });
  const next = await queryPage<Row>(report, asked.cursor(page.cursor), { identity: "uuid" });
  const skipped = await queryPage<Row>(report, asked.offset(3), { identity: "uuid" });

  assert.deepEqual(
    page.rows.map((row) => row.number),
    [6, 7, 8],
  );
  assert.deepEqual(page.count, { value: 4, exact: true });
  assert.deepEqual(
    next.rows.map((row) => row.number),
    [9],
  );
  assert.deepEqual(
    skipped.rows.map((row) => row.number),
    [9],
  );
  assert.equal(skipped.cursor, null);
});

test("a statement binds every value: text from outside never becomes SQL", async () => {
  const typed = "' OR 1=1 --";
  const injected = await tickets.ofCity(typed);
  const listed = sql`SELECT uuid FROM tickets WHERE json_extract(data, '$.number') IN (${[1, 2]})`;
  const empty = sql`SELECT uuid FROM tickets WHERE uuid IN (${[]})`;

  assert.equal(injected.length, 0);
  assert.deepEqual(listed.params, [1, 2]);
  assert.match(listed.text, /IN \(\?, \?\)/);
  assert.equal((await DBCursor.getAllAsync(empty.text, ...empty.params)).length, 0);
  assert.throws(() => identifier("tickets; DROP TABLE tickets"), DomainValidationError);
  assert.equal(sql`SELECT * FROM ${identifier("tickets")}`.text, "SELECT * FROM tickets");
});
