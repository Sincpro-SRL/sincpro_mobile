import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { configureProcess, failureOf } from "@sincpro/client-framework";
import {
  memoryLogger,
  type MemoryTracer,
  memoryTracer,
} from "@sincpro/client-framework/testing";
import { criteria, resource, selection } from "@sincpro/criteria";

import { sqliteDocuments } from "../../sincpro_mobile/adapters/repositories/document.repository.ts";
import { Entity } from "../../sincpro_mobile/domain/entity/entity.ts";
import { AggregateNotFound } from "../../sincpro_mobile/exceptions.ts";
import { DBCursor } from "../../sincpro_mobile/infrastructure/database/index.ts";
import {
  CommandFindEntities,
  CommandGetEntity,
  CommandGetManyEntities,
  CommandSearchEntities,
  commonBoundedContext,
} from "../../sincpro_mobile/services/index.ts";

/** An app's entity, as written: nothing declared for its reads. */
class Customer extends Entity {
  static make(data?: Partial<Customer>): Customer {
    return Customer.obj<Customer>(data);
  }

  vat = "";
}

const customers = sqliteDocuments(Customer, "generic_customers");

let tracer: MemoryTracer;

beforeEach(async () => {
  tracer = memoryTracer();
  configureProcess({ tracer, logger: { engine: memoryLogger() } });
  await customers.count();
  await DBCursor.mutateDatabase("DELETE FROM generic_customers");
});

async function saved(names: string[]): Promise<Customer[]> {
  const made = names.map((name, index) => Customer.make({ name, vat: `V-${index}` }));
  await customers.save(made);
  return made;
}

test("any entity is read with no use case declared: a page, newest first, typed", async () => {
  const made = await saved(["Ana", "Beto", "Carla"]);

  const page = await commonBoundedContext.execute(
    new CommandSearchEntities(Customer, { pagination: { limit: 2 } }),
  );
  const vat: string = page.rows[0].vat;

  assert.deepEqual(
    page.rows.map((customer) => customer.uuid),
    [...made]
      .map((customer) => customer.uuid)
      .sort()
      .reverse()
      .slice(0, 2),
  );
  assert.ok(vat.startsWith("V-"));
  assert.deepEqual(page.count, { value: 3, exact: true });
  const span = tracer.spans.find((one) => one.name === "common/SearchEntities");
  assert.equal(span?.attributes["reads.entity"], "Customer");
});

test("Get, GetMany and a select's text read any entity the same way", async () => {
  const [ana, beto] = await saved(["Ana López", "Beto", "Analía"]);

  const one = await commonBoundedContext.execute(new CommandGetEntity(Customer, ana.uuid));
  const several = await commonBoundedContext.execute(
    new CommandGetManyEntities(Customer, [beto.uuid, "gone", ana.uuid]),
  );
  const options = await commonBoundedContext.execute(
    new CommandFindEntities(Customer, "ANA"),
  );
  const missing = await commonBoundedContext
    .execute(new CommandGetEntity(Customer, "gone"))
    .catch((caught: unknown) => caught);

  assert.equal(one.name, "Ana López");
  assert.deepEqual(
    several.records.map((customer) => customer.name),
    ["Beto", "Ana López"],
  );
  assert.deepEqual(several.missing, ["gone"]);
  assert.deepEqual(options.rows.map((customer) => customer.name).sort(), [
    "Ana López",
    "Analía",
  ]);
  assert.ok(missing instanceof AggregateNotFound);
  assert.equal(failureOf(missing).kind, "not_found");
});

test("a screen's Reading walks the generic Search like any source", async () => {
  await saved(Array.from({ length: 7 }, (_, index) => `C-${index}`));
  const source = resource<Customer>((criteria) =>
    commonBoundedContext.execute(new CommandSearchEntities(Customer, criteria)),
  );

  const reading = source.read({ order: [{ field: "name" }], pagination: { limit: 3 } });
  await reading.load();
  while (reading.hasMore) await reading.more();

  assert.deepEqual(
    reading.rows.map((customer) => customer.name),
    ["C-0", "C-1", "C-2", "C-3", "C-4", "C-5", "C-6"],
  );
});

test("the reads take the criteria builder: typed fields, AND/OR written as they read", async () => {
  await saved(["Ana", "Beto", "Carla", "Dora"]);

  const page = await commonBoundedContext.execute(
    new CommandSearchEntities(
      Customer,
      criteria<Customer>()
        .selection(selection.any(["name", "like", "an"], ["vat", "=", "V-3"]))
        .order("name")
        .limit(5),
    ),
  );

  assert.deepEqual(
    page.rows.map((customer) => customer.name),
    ["Ana", "Dora"],
  );
});
