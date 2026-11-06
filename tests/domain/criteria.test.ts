import assert from "node:assert/strict";
import test from "node:test";

import { criteria, type Expression, InvalidCriteria, selection } from "@sincpro/criteria";

import { Entity } from "../../sincpro_mobile/domain/entity/entity.ts";
import { EntityCollection } from "../../sincpro_mobile/domain/entity/entity_collection.ts";

class Note extends Entity {
  name = "";
  total = 0;
  tags: string[] = [];

  static make(data?: Partial<Note>): Note {
    return Note.obj<Note>(data);
  }
}

function notes(): EntityCollection<Note> {
  return new EntityCollection([
    Note.make({ name: "Draft invoice", total: 10, tags: ["raw"] }),
    Note.make({ name: "Posted", total: 50, tags: [] }),
    Note.make({ name: "Credit", total: 50, tags: ["raw", "late"] }),
  ]);
}

function names(collection: EntityCollection<Note>): string[] {
  return collection.toArray().map((note) => note.name);
}

test("selection: all of the conditions, and a null does not compare", () => {
  const found = notes().findByCriteria(
    criteria<Note>().selection(
      ["total", ">", 10],
      selection.negate(["name", "like", "credit"]),
    ).value,
  );

  assert.deepEqual(names(found), ["Posted"]);
});

test("selection: any keeps a row that answers one branch", () => {
  const found = notes().findByCriteria(
    criteria<Note>().selection(
      selection.any(["total", "<", 20], ["tags", "contains", "late"]),
    ).value,
  );

  assert.deepEqual(names(found), ["Draft invoice", "Credit"]);
});

test("a builder is the same criteria as its value", () => {
  const asked = criteria<Note>().selection(["name", "starts with", "posted"]).order("name");
  assert.deepEqual(names(notes().findByCriteria(asked)), ["Posted"]);
});

test("an expression is the selection", () => {
  const found = notes().findByCriteria({
    all: [
      { field: "total", operator: ">=", value: 50 },
      { field: "name", operator: "not in", value: ["Credit"] },
    ],
  });

  assert.deepEqual(names(found), ["Posted"]);
});

test("a criteria with no selection returns every row", () => {
  assert.equal(notes().findByCriteria({}).length, 3);
});

test("order is the criteria order, and a page is cut only when one is asked", () => {
  const ordered = notes().findByCriteria({ order: [{ field: "total" }, { field: "name" }] });
  assert.deepEqual(names(ordered), ["Draft invoice", "Credit", "Posted"]);

  const page = notes().findByCriteria({
    order: [{ field: "name" }],
    pagination: { limit: 2 },
  });
  assert.deepEqual(names(page), ["Credit", "Draft invoice"]);
});

test("an operator the engine does not declare is refused", () => {
  assert.throws(
    () =>
      notes().findByCriteria({
        field: "name",
        operator: "not_like",
        value: "x",
      } as unknown as Expression<Note>),
    InvalidCriteria,
  );
});

test("a grouping is not a document list", () => {
  assert.throws(
    () =>
      notes().findByCriteria({
        grouping: { group_by: [{ field: "name" }] },
      }),
    InvalidCriteria,
  );
});
