import assert from "node:assert/strict";
import test from "node:test";

import { DocumentRepository } from "../../sincpro_mobile/adapters/repositories/document.repository.ts";
import { withChangeTracking } from "../../sincpro_mobile/domain/entity/change_tracking.ts";
import { check } from "../../sincpro_mobile/domain/entity/checks.ts";
import { Entity } from "../../sincpro_mobile/domain/entity/entity.ts";
import { relation, RelationCascade } from "../../sincpro_mobile/domain/entity/relations.ts";
import { valueRule } from "../../sincpro_mobile/domain/entity/values.ts";
import { IntegrationEvent } from "../../sincpro_mobile/domain/events/integration_event.ts";
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

class Placed extends IntegrationEvent {
  public readonly name = "NotePlaced";
  public readonly label = "Placed";
  public title = "";
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

  async save(event: IntegrationEvent): Promise<void> {
    await new FakeDocumentStore(this.database, "events").write({
      uuid: event.uuid,
      data: event.asJSON(),
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
  await repository.save(note, { deliver: false });
  assert.equal(outbox.scheduled, 0);
  assert.equal(note.recordedEvents().length, 0);
  assert.equal((await new FakeDocumentStore(database, "events").list()).length, 1);

  repository.kick();
  assert.equal(outbox.scheduled, 1);
});

test("local save leaves a deliverable event on the aggregate when there is no outbox", async () => {
  DocumentRepository.reset();
  const repository = notes(new FakeDocumentDatabase(), { mode: StoreMode.LOCAL });
  const note = Note.make();
  note.record(Placed, { title: "stay" });
  await repository.save(note);
  assert.equal(note.recordedEvents().length, 1);
});

test("publish is the explicit door", async () => {
  DocumentRepository.reset();
  const database = new FakeDocumentDatabase();
  const outbox = new FakeOutbox(database);
  const repository = notes(database, { outbox });
  const note = Note.make();
  note.record(Placed, { title: "hand" });
  const events = note.pullEvents();
  await repository.publish(events as Placed[]);
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
  const [event] = loaded!.pullEvents();
  assert.equal(event.name, "entity.updated");
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
