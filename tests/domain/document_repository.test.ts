import assert from "node:assert/strict";
import test from "node:test";

import { DomainEvent, type StoredMessage } from "@sincpro/client-framework";
import { criteria, selection } from "@sincpro/criteria";

import { DocumentRepository } from "../../sincpro_mobile/adapters/repositories/document.repository.ts";
import {
  EntityUpdated,
  withChangeTracking,
} from "../../sincpro_mobile/domain/entity/change_tracking.ts";
import { check } from "../../sincpro_mobile/domain/entity/checks.ts";
import {
  Entity,
  ERemoteState,
  RemoteEntity,
} from "../../sincpro_mobile/domain/entity/entity.ts";
import { relation, RelationCascade } from "../../sincpro_mobile/domain/entity/relations.ts";
import { valueRule } from "../../sincpro_mobile/domain/entity/values.ts";
import {
  type Outbox,
  StoreMode,
} from "../../sincpro_mobile/domain/repositories/document_store.ts";
import { Hooks } from "../../sincpro_mobile/domain/repositories/hooks.ts";
import {
  ChecksFailed,
  DomainAppError,
  DomainValidationError,
  StaleAggregate,
} from "../../sincpro_mobile/exceptions.ts";
import { FakeDocumentDatabase, FakeDocumentStore } from "../support/fake_document_store.ts";

class Note extends Entity {
  static make(data?: Partial<Note>): Note {
    return Note.obj<Note>(data);
  }

  title = "";
}

class Placed extends DomainEvent {
  static readonly eventName = "test.note.v1.placed";
  static readonly label = "Placed";
  title = "";
}

class Line extends Entity {
  static make(data?: Partial<Line>): Line {
    return Line.obj<Line>(data);
  }

  amount = 0;
}

class Order extends Entity {
  static make(data?: Partial<Order>): Order {
    return Order.obj<Order>(data);
  }

  @relation(Line)
  lines: Line[] = [];
}

class Project extends Entity {
  static make(data?: Partial<Project>): Project {
    return Project.obj<Project>(data);
  }

  state = "draft";
  deadline = "";

  @check((project) => [(project as Project).state, (project as Project).deadline])
  deadlineWhenConfirmed(): void {
    if (this.state === "confirmed" && this.deadline === "") {
      throw new DomainValidationError("A confirmed project needs a deadline");
    }
  }
}

class TrackedNote extends withChangeTracking(Entity) {
  static make(data?: Partial<TrackedNote>): TrackedNote {
    return TrackedNote.obj<TrackedNote>(data);
  }

  title = "";
}

class FakeOutbox implements Outbox {
  scheduled = 0;

  constructor(private readonly database: FakeDocumentDatabase) {}

  async save(stored: StoredMessage): Promise<void> {
    await new FakeDocumentStore(this.database, "events").upsert({
      uuid: stored.envelope.id,
      version: 1,
      data: JSON.stringify(stored),
      columns: {},
    });
  }

  schedule(): void {
    this.scheduled += 1;
  }
}

function notes(
  database: FakeDocumentDatabase,
  options: { mode?: StoreMode; outbox?: Outbox; hooks?: Hooks } = {},
) {
  return new DocumentRepository(Note, new FakeDocumentStore(database, "notes"), options);
}

test("save stamps version 1 and a second writer of version 0 is stale", async () => {
  DocumentRepository.reset();
  const database = new FakeDocumentDatabase();
  const repository = notes(database);
  const note = Note.make({ title: "a" });
  assert.equal(note.isNew, true);

  await repository.save(note);
  assert.equal(note.version, 1);
  assert.equal(note.isNew, false);

  const other = Note.make({ uuid: note.uuid, title: "b" });
  await assert.rejects(() => repository.save(other), StaleAggregate);
});

test("two readers of the same version cannot both save", async () => {
  DocumentRepository.reset();
  const repository = notes(new FakeDocumentDatabase());
  const note = Note.make({ title: "a" });
  await repository.save(note);
  const first = await repository.findById(note.uuid);
  const second = await repository.findById(note.uuid);
  first!.title = "left";
  second!.title = "right";
  await repository.save(first!);
  await assert.rejects(() => repository.save(second!), StaleAggregate);
});

test("upsert writes over a newer version and still runs before_save", async () => {
  DocumentRepository.reset();
  const seen: string[] = [];
  const hooks = new Hooks().on(Note, {
    before_save() {
      seen.push("before_save");
    },
    before_create() {
      seen.push("before_create");
    },
  });
  const repository = notes(new FakeDocumentDatabase(), { hooks });
  const note = Note.make({ title: "remote" });
  note.version = 4;
  await repository.upsert(note);
  assert.equal(note.version, 1);
  assert.deepEqual(seen, ["before_save"]);
  const stored = await repository.findById(note.uuid);
  assert.equal(stored?.title, "remote");
});

test("a check refuses the save and a touched field warns the form", async () => {
  DocumentRepository.reset();
  const repository = new DocumentRepository(
    Project,
    new FakeDocumentStore(new FakeDocumentDatabase(), "projects"),
  );
  const project = Project.make({ state: "confirmed" });
  await assert.rejects(() => repository.save(project), ChecksFailed);
  assert.equal(await repository.findById(project.uuid), null);

  const { checkWarnings } = await import("../../sincpro_mobile/domain/entity/checks.ts");
  assert.equal(checkWarnings(project, ["deadline"]).length, 1);
  assert.equal(checkWarnings(project, ["title"]).length, 0);
});

test("a hook runs around the write and cannot re-enter the same repository", async () => {
  DocumentRepository.reset();
  const seen: string[] = [];
  const database = new FakeDocumentDatabase();
  let repository!: DocumentRepository<Note>;
  const hooks = new Hooks().on(Note, {
    async before_save(record: Note) {
      seen.push(`before:${record.version}`);
      await repository.save(Note.make({ title: "again" }));
    },
  });
  repository = notes(database, { hooks });
  await assert.rejects(() => repository.save(Note.make({ title: "a" })), DomainAppError);
  assert.deepEqual(seen, ["before:0"]);
  assert.equal((await repository.findAll()).length, 0);
});

test("after_save failure rolls the row and the in-memory version back", async () => {
  DocumentRepository.reset();
  const hooks = new Hooks().on(Note, {
    after_save() {
      throw new DomainValidationError("no");
    },
  });
  const repository = notes(new FakeDocumentDatabase(), { hooks });
  const note = Note.make({ title: "a" });
  await assert.rejects(() => repository.save(note), DomainValidationError);
  assert.equal(note.version, 0);
  assert.equal(await repository.findById(note.uuid), null);
});

test("save writes an owned line and a removed line is deleted", async () => {
  DocumentRepository.reset();
  const database = new FakeDocumentDatabase();
  const lines = new DocumentRepository(Line, new FakeDocumentStore(database, "lines"));
  const orders = new DocumentRepository(Order, new FakeDocumentStore(database, "orders"));
  const line = Line.make({ amount: 5 });
  const order = Order.make();
  order.lines = [line];
  await orders.save(order);

  assert.equal(line.version, 1);
  assert.equal(order.version, 1);
  const storedLine = await lines.findById(line.uuid);
  assert.equal(storedLine?.amount, 5);

  const loaded = await orders.findById(order.uuid);
  assert.equal(loaded?.lines.length, 1);
  loaded!.lines = [];
  await orders.save(loaded!);
  assert.equal(await lines.findById(line.uuid), null);
  assert.equal(loaded!.version, 2);
});

test("editing a line moves the order version, so the other reader is stale", async () => {
  DocumentRepository.reset();
  const database = new FakeDocumentDatabase();
  new DocumentRepository(Line, new FakeDocumentStore(database, "lines"));
  const orders = new DocumentRepository(Order, new FakeDocumentStore(database, "orders"));
  const order = Order.make();
  order.lines = [Line.make({ amount: 1 })];
  await orders.save(order);

  const left = await orders.findById(order.uuid);
  const right = await orders.findById(order.uuid);
  left!.lines[0].amount = 2;
  right!.lines[0].amount = 3;
  await orders.save(left!);
  await assert.rejects(() => orders.save(right!), StaleAggregate);
});

test("a relay save stores the event and schedules one delivery", async () => {
  DocumentRepository.reset();
  const database = new FakeDocumentDatabase();
  const outbox = new FakeOutbox(database);
  const repository = notes(database, { mode: StoreMode.RELAY, outbox });
  const note = Note.make({ title: "go" });
  note.record(Placed, { title: "go" });
  const eventId = note.eventIds[0];
  await repository.save(note, { deliver: false });
  assert.equal(outbox.scheduled, 0);
  assert.equal(note.recordedEvents().length, 0);
  assert.equal(note.eventIds.includes(eventId), false);
  assert.equal((await new FakeDocumentStore(database, "events").list()).length, 1);

  repository.kick();
  assert.equal(outbox.scheduled, 1);
});

test("local save leaves a deliverable event on the aggregate when there is no outbox", async () => {
  DocumentRepository.reset();
  const repository = notes(new FakeDocumentDatabase(), { mode: StoreMode.LOCAL });
  const note = Note.make();
  note.record(Placed, { title: "stay" });
  const eventId = note.eventIds[0];
  await repository.save(note);
  assert.equal(note.recordedEvents().length, 1);
  assert.equal(note.eventIds.includes(eventId), true);
});

test("publish is the explicit door", async () => {
  DocumentRepository.reset();
  const database = new FakeDocumentDatabase();
  const outbox = new FakeOutbox(database);
  const repository = notes(database, { outbox });
  const note = Note.make();
  note.record(Placed, { title: "hand" });
  const events = note.pullEvents().map((recorded) => recorded.event);
  await repository.publish(events);
  assert.equal(outbox.scheduled, 1);
  assert.equal((await new FakeDocumentStore(database, "events").list()).length, 1);
});

test("change tracking emits one update after a read, and nothing for a new aggregate", async () => {
  DocumentRepository.reset();
  const repository = new DocumentRepository(
    TrackedNote,
    new FakeDocumentStore(new FakeDocumentDatabase(), "tracked"),
  );
  const note = TrackedNote.make({ title: "a" });
  await repository.save(note);
  assert.equal(note.recordedEvents().length, 0);

  const loaded = await repository.findById(note.uuid);
  loaded!.title = "b";
  await repository.save(loaded!);
  const [recorded] = loaded!.pullEvents();
  assert.equal(recorded.event.name, "entity.updated");
});

test("a value rule rejects what it does not hold", () => {
  const discount = valueRule("Discount", (value: number) => value >= 0 && value <= 30);
  assert.equal(discount.parse(10), 10);
  assert.equal(discount.holds(0), true);
  assert.throws(() => discount.parse(45), DomainValidationError);
});

class Priced extends Entity {
  static make(data?: Partial<Priced>): Priced {
    return Priced.obj<Priced>(data);
  }

  amount = 0;

  @check((row) => (row as Priced).amount)
  positive(): void {
    if (this.amount <= 0) throw new DomainValidationError("amount must be positive");
  }
}

class Basket extends Entity {
  static make(data?: Partial<Basket>): Basket {
    return Basket.obj<Basket>(data);
  }

  @relation(Priced)
  lines: Priced[] = [];
}

test("a broken check on an owned line refuses the save before anything is written", async () => {
  DocumentRepository.reset();
  const database = new FakeDocumentDatabase();
  const baskets = new DocumentRepository(Basket, new FakeDocumentStore(database, "baskets"));
  const basket = Basket.make();
  basket.lines = [Priced.make({ amount: 0 })];

  await assert.rejects(
    () => baskets.save(basket),
    (error: unknown) => {
      assert.ok(error instanceof ChecksFailed);
      assert.deepEqual(error.failures[0]?.path, ["lines", "0"]);
      return true;
    },
  );
  assert.equal(basket.version, 0);
  assert.equal((await baskets.findAll()).length, 0);
});

test("findByIds returns the rows that exist and a read runs its hook", async () => {
  DocumentRepository.reset();
  const seen: string[] = [];
  const hooks = new Hooks().on(Note, {
    after_read(note) {
      seen.push(note.title);
    },
    after_search(notes) {
      seen.push(`search:${notes.length}`);
    },
  });
  const repository = notes(new FakeDocumentDatabase(), { hooks });
  const first = Note.make({ title: "a" });
  const second = Note.make({ title: "b" });
  await repository.save(first);
  await repository.save(second);

  const page = await repository.findByIds([first.uuid, "missing", second.uuid]);
  assert.deepEqual(
    page.toArray().map((note) => note.title),
    ["a", "b"],
  );
  assert.deepEqual(seen, ["a", "b", "search:2"]);
});

class SaveOrder extends Entity {
  static make(): SaveOrder {
    return SaveOrder.obj<SaveOrder>();
  }

  @relation(Line, RelationCascade.SAVE)
  lines: Line[] = [];
}

class UpdateOrder extends Entity {
  static make(): UpdateOrder {
    return UpdateOrder.obj<UpdateOrder>();
  }

  @relation(Line, RelationCascade.UPDATE)
  lines: Line[] = [];
}

class RemoveOrder extends Entity {
  static make(): RemoveOrder {
    return RemoveOrder.obj<RemoveOrder>();
  }

  @relation(Line, RelationCascade.REMOVE)
  lines: Line[] = [];
}

test("a relation that only saves leaves the line when it is dropped and when the order is removed", async () => {
  DocumentRepository.reset();
  const database = new FakeDocumentDatabase();
  const lines = new DocumentRepository(Line, new FakeDocumentStore(database, "lines"));
  const orders = new DocumentRepository(SaveOrder, new FakeDocumentStore(database, "orders"));
  const line = Line.make({ amount: 5 });
  const order = SaveOrder.make();
  order.lines = [line];
  await orders.save(order);

  const loaded = await orders.findById(order.uuid);
  loaded!.lines = [];
  await orders.save(loaded!);
  assert.equal((await lines.findById(line.uuid))?.amount, 5);

  await orders.remove(loaded!);
  assert.equal((await lines.findById(line.uuid))?.amount, 5);
});

test("a relation that only updates writes an existing line and skips a new one", async () => {
  DocumentRepository.reset();
  const database = new FakeDocumentDatabase();
  const lines = new DocumentRepository(Line, new FakeDocumentStore(database, "lines"));
  const orders = new DocumentRepository(
    UpdateOrder,
    new FakeDocumentStore(database, "orders"),
  );
  const line = Line.make({ amount: 1 });
  await lines.save(line);
  line.amount = 4;
  const fresh = Line.make({ amount: 9 });
  const order = UpdateOrder.make();
  order.lines = [line, fresh];
  await orders.save(order);

  assert.equal((await lines.findById(line.uuid))?.amount, 4);
  assert.equal(await lines.findById(fresh.uuid), null);
});

test("a relation that only removes deletes the line with the order and does not rewrite it", async () => {
  DocumentRepository.reset();
  const database = new FakeDocumentDatabase();
  const lines = new DocumentRepository(Line, new FakeDocumentStore(database, "lines"));
  const orders = new DocumentRepository(
    RemoveOrder,
    new FakeDocumentStore(database, "orders"),
  );
  const line = Line.make({ amount: 2 });
  await lines.save(line);
  line.amount = 8;
  const order = RemoveOrder.make();
  order.lines = [line];
  await orders.save(order);
  assert.equal((await lines.findById(line.uuid))?.amount, 2);

  await orders.remove(order);
  assert.equal(await lines.findById(line.uuid), null);
});

test("one save of two notes rolls both back when the second fails", async () => {
  DocumentRepository.reset();
  let calls = 0;
  const hooks = new Hooks().on(Note, {
    after_save() {
      calls += 1;
      if (calls === 2) throw new DomainValidationError("no");
    },
  });
  const repository = notes(new FakeDocumentDatabase(), { hooks });
  const first = Note.make({ title: "a" });
  const second = Note.make({ title: "b" });
  await assert.rejects(() => repository.save([first, second]), DomainValidationError);
  assert.equal(first.version, 0);
  assert.equal(second.version, 0);
  assert.equal((await repository.findAll()).length, 0);
});

test("two saves of different notes both persist", async () => {
  DocumentRepository.reset();
  const repository = notes(new FakeDocumentDatabase());
  const first = Note.make({ title: "a" });
  const second = Note.make({ title: "b" });
  await Promise.all([repository.save(first), repository.save(second)]);
  assert.equal(first.version, 1);
  assert.equal(second.version, 1);
  assert.equal((await repository.findAll()).length, 2);
});

test("a second repository for the same entity is refused", () => {
  DocumentRepository.reset();
  const database = new FakeDocumentDatabase();
  notes(database);
  assert.throws(() => notes(database), DomainAppError);
});

test("before_save can satisfy a check", async () => {
  DocumentRepository.reset();
  const hooks = new Hooks().on(Project, {
    before_save(project: Project) {
      project.deadline = "friday";
    },
  });
  const repository = new DocumentRepository(
    Project,
    new FakeDocumentStore(new FakeDocumentDatabase(), "projects"),
    { hooks },
  );
  const project = Project.make({ state: "confirmed" });
  await repository.save(project);
  assert.equal(project.version, 1);
  assert.equal((await repository.findById(project.uuid))?.deadline, "friday");
});

test("the parent stores the line id and reads the line row", async () => {
  DocumentRepository.reset();
  const database = new FakeDocumentDatabase();
  const lines = new DocumentRepository(Line, new FakeDocumentStore(database, "lines"));
  const orders = new DocumentRepository(Order, new FakeDocumentStore(database, "orders"));
  const line = Line.make({ amount: 5 });
  const order = Order.make();
  order.lines = [line];
  await orders.save(order);

  const row = await new FakeDocumentStore(database, "orders").read(order.uuid);
  const stored = JSON.parse(row!.data) as { lines: unknown };
  assert.deepEqual(stored.lines, [line.uuid]);

  const edited = await lines.findById(line.uuid);
  edited!.amount = 9;
  await lines.save(edited!);
  const loaded = await orders.findById(order.uuid);
  assert.equal(loaded?.lines[0].amount, 9);
});

test("upsert cascades to the line", async () => {
  DocumentRepository.reset();
  const database = new FakeDocumentDatabase();
  const lines = new DocumentRepository(Line, new FakeDocumentStore(database, "lines"));
  const orders = new DocumentRepository(Order, new FakeDocumentStore(database, "orders"));
  const line = Line.make({ amount: 1 });
  const order = Order.make();
  order.lines = [line];
  await orders.save(order);
  line.amount = 7;
  await orders.upsert(order);
  assert.equal((await lines.findById(line.uuid))?.amount, 7);
});

test("a failed order save rolls the line back too", async () => {
  DocumentRepository.reset();
  const database = new FakeDocumentDatabase();
  const hooks = new Hooks().on(Order, {
    after_save() {
      throw new DomainValidationError("no");
    },
  });
  const lines = new DocumentRepository(Line, new FakeDocumentStore(database, "lines"));
  const orders = new DocumentRepository(Order, new FakeDocumentStore(database, "orders"), {
    hooks,
  });
  const line = Line.make({ amount: 5 });
  const order = Order.make();
  order.lines = [line];
  await assert.rejects(() => orders.save(order), DomainValidationError);
  assert.equal(order.version, 0);
  assert.equal(line.version, 0);
  assert.equal(await lines.findById(line.uuid), null);
});

class TrackedOrder extends withChangeTracking(Order) {
  static make(): TrackedOrder {
    return TrackedOrder.obj<TrackedOrder>();
  }
}

test("a line change is part of the order diff", async () => {
  DocumentRepository.reset();
  const database = new FakeDocumentDatabase();
  new DocumentRepository(Line, new FakeDocumentStore(database, "lines"));
  const orders = new DocumentRepository(
    TrackedOrder,
    new FakeDocumentStore(database, "orders"),
  );
  const order = TrackedOrder.make();
  order.lines = [Line.make({ amount: 1 })];
  await orders.save(order);

  const loaded = await orders.findById(order.uuid);
  loaded!.lines[0].amount = 9;
  await orders.save(loaded!);
  const event = loaded!.pullEvents()[0].event as EntityUpdated;
  assert.equal(event.name, "entity.updated");
  assert.equal(event.changes.lines.to.includes("9"), true);
});

class Product extends RemoteEntity {
  static make(data?: Partial<Product>): Product {
    return Product.obj<Product>(data);
  }

  name = "";
}

test("findByRemoteId reads the remoteId column", async () => {
  DocumentRepository.reset();
  const database = new FakeDocumentDatabase();
  const products = new DocumentRepository(
    Product,
    new FakeDocumentStore(database, "products", ["remoteId", "remoteState"]),
    {
      columns: (product) => ({
        remoteId: product.remoteId ?? null,
        remoteState: product.remoteState,
      }),
    },
  );
  const product = Product.make({ name: "milk" });
  product.remoteId = 42;
  await products.save(product);
  assert.equal((await products.findByRemoteId(42))?.name, "milk");
  assert.equal((await products.findByRemoteState(ERemoteState.PENDING)).length, 1);
  assert.equal(products.findByRemoteIdSync(42)?.name, "milk");
});

class Customer extends RemoteEntity {
  static make(data?: Partial<Customer>): Customer {
    return Customer.obj<Customer>(data);
  }

  city = "";
}

function customersOf(database: FakeDocumentDatabase) {
  return new DocumentRepository(
    Customer,
    new FakeDocumentStore(database, "customers", ["remoteId", "remoteState", "ackedVersion"]),
  );
}

test("a local save stays dirty until Odoo accepts that version", async () => {
  DocumentRepository.reset();
  const customers = customersOf(new FakeDocumentDatabase());
  const customer = Customer.make({ city: "Oruro" });
  await customers.save(customer);

  assert.equal(customer.version, 1);
  assert.equal(customer.ackedVersion, 0);
  assert.equal(customer.isDirty, true);
  assert.equal(customer.remoteState, ERemoteState.PENDING);

  await customers.acknowledge(customer, 15);
  const loaded = await customers.findById(customer.uuid);

  assert.equal(customer.version, 1);
  assert.equal(customer.ackedVersion, 1);
  assert.equal(customer.remoteId, 15);
  assert.equal(customer.isDirty, false);
  assert.equal(loaded?.ackedVersion, 1);
  assert.equal(loaded?.remoteState, ERemoteState.SYNCED);
  assert.deepEqual(
    (await customers.findDirty()).mapToArray((item) => item.uuid),
    [],
  );
});

test("a pull keeps a dirty customer and replaces a clean one", async () => {
  DocumentRepository.reset();
  const database = new FakeDocumentDatabase();
  const customers = customersOf(database);
  const dirty = Customer.make({ city: "La Paz" });
  await customers.save(dirty);
  const clean = await customers.pull(null, Customer.make({ city: "Sucre", remoteId: 8 }));

  const kept = await customers.pull(
    dirty,
    Customer.make({ city: "Cochabamba", remoteId: 4 }),
  );
  const replaced = await customers.pull(
    clean,
    Customer.make({ city: "Potosí", remoteId: 8 }),
  );
  assert.equal(kept.city, "La Paz");

  const loaded = await customers.findByRemoteId(8);
  assert.equal(replaced.city, "Potosí");
  assert.equal(loaded?.city, "Potosí");
  assert.equal(loaded?.version, loaded?.ackedVersion);
  assert.equal(loaded?.isDirty, false);
  assert.deepEqual(
    (await customers.findDirty()).mapToArray((item) => item.city),
    ["La Paz"],
  );
});

test("a synced row written before ackedVersion is not dirty", async () => {
  DocumentRepository.reset();
  const database = new FakeDocumentDatabase();
  const customers = customersOf(database);
  const uuid = "old-customer";
  database.table("customers").set(uuid, {
    uuid,
    version: 4,
    data: JSON.stringify({
      uuid,
      version: 4,
      remoteId: 3,
      remoteState: ERemoteState.SYNCED,
      city: "Oruro",
    }),
    columns: { remoteId: 3, remoteState: ERemoteState.SYNCED },
  });

  const loaded = await customers.findById(uuid);
  assert.equal(loaded?.ackedVersion, 4);
  assert.equal(loaded?.isDirty, false);
});

test("a synchronous read skips hooks", async () => {
  DocumentRepository.reset();
  const seen: string[] = [];
  const hooks = new Hooks().on(Note, {
    after_read(note) {
      seen.push(note.title);
    },
  });
  const repository = notes(new FakeDocumentDatabase(), { hooks });
  const note = Note.make({ title: "sync" });
  await repository.save(note);
  seen.length = 0;
  assert.equal(repository.findByIdSync(note.uuid)?.title, "sync");
  assert.deepEqual(seen, []);
});

test("findByCriteria reads a field stored in the document JSON", async () => {
  DocumentRepository.reset();
  const repository = notes(new FakeDocumentDatabase());
  await repository.save(Note.make({ title: "Acme 3101" }));
  await repository.save(Note.make({ title: "Other" }));

  const found = await repository.findByCriteria(
    criteria<Note>().selection(["title", "like", "3101"]),
  );

  assert.deepEqual(
    found.toArray().map((note) => note.title),
    ["Acme 3101"],
  );
});

test("findByCriteria crosses a relation whose ids live in the JSON", async () => {
  DocumentRepository.reset();
  const database = new FakeDocumentDatabase();
  new DocumentRepository(Line, new FakeDocumentStore(database, "lines"));
  const orders = new DocumentRepository(Order, new FakeDocumentStore(database, "orders"));
  const large = Line.make({ amount: 12 });
  const small = Line.make({ amount: 1 });
  await orders.save(Order.make({ lines: [large] }));
  await orders.save(Order.make({ lines: [small] }));

  const found = await orders.findByCriteria(
    criteria<Order>().selection({
      through: "lines",
      selection: { field: "amount", operator: ">", value: 10 },
    }),
  );

  assert.equal(found.length, 1);
  assert.equal(found.toArray()[0].lines[0].amount, 12);
});

test("findByCriteria keeps a promoted column and a JSON field in one question", async () => {
  DocumentRepository.reset();
  const database = new FakeDocumentDatabase();
  const repository = new DocumentRepository(
    Note,
    new FakeDocumentStore(database, "notes", ["title"]),
    { columns: (note) => ({ title: note.title }) },
  );
  await repository.save(Note.make({ title: "Posted", name: "north" }));
  await repository.save(Note.make({ title: "Draft", name: "north" }));

  const found = await repository.findByCriteria(
    criteria<Note>().selection(
      ["title", "=", "Posted"],
      selection.any(["name", "like", "north"]),
    ),
  );

  assert.deepEqual(
    found.toArray().map((note) => note.title),
    ["Posted"],
  );
});

test("search pages any document store the same way: the keyset holds in memory too", async () => {
  DocumentRepository.reset();
  const database = new FakeDocumentDatabase();
  const repository = notes(database);
  const titles = ["b", "", "a", "b", "", "c", "a"];
  const made = titles.map((title) => Note.make({ title: title || undefined, name: title }));
  for (const note of made) {
    if (!note.name) delete (note as { title?: string }).title;
  }
  await repository.save(made);
  const expected = [...made]
    .sort((left, right) => {
      const a = left.title ?? null;
      const b = right.title ?? null;
      if (a !== b) return a === null ? -1 : b === null ? 1 : a < b ? -1 : 1;
      return left.uuid < right.uuid ? -1 : 1;
    })
    .map((note) => note.uuid);

  const seen: string[] = [];
  let page = await repository.search({
    order: [{ field: "title" }],
    pagination: { limit: 2 },
  });
  seen.push(...page.toArray().map((note) => note.uuid));
  while (page.cursor !== null) {
    page = await repository.search({
      order: [{ field: "title" }],
      pagination: { limit: 2, strategy: { token: page.cursor } },
    });
    seen.push(...page.toArray().map((note) => note.uuid));
  }

  assert.deepEqual(seen, expected);
  assert.deepEqual(page.total, { value: titles.length, exact: true });
});
