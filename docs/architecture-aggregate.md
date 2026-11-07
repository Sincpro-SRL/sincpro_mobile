# Agregado, evento y repositorio

El estado de un agregado es el documento SQLite. El evento es el hecho que ese documento registró. El repositorio es quien escribe el documento, corre las reglas y, si el evento es de integración, lo deja en la cola. No es event sourcing: no se reconstruye el estado leyendo el log. No es un broker: los suscriptores corren en el mismo proceso.

Un teléfono que ya tiene las tablas de eventos no las tira. El store crea la tabla del documento si no existe, y si ya existe agrega `version`, `data` o una columna declarada que falte. Las migraciones de infraestructura corren una vez, anotadas por nombre en `schema_migrations`. El SQL y el nombre se confirman en la misma transacción: si el paso se corta, no queda ninguno de los dos. Una base que ya tiene un nombre que esta app no conoce no se abre. Un wipe olvida solo los nombres de las tablas que borró y las vuelve a correr. El padre guarda los ids de cada `@relation`; la fila del hijo está en su tabla.

## Piezas

| Pieza                 | Dónde                                            | Qué decide                                                                          |
| --------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `Entity`              | `domain/entity/entity.ts`                        | Identidad (`uuid`), `version`, tiempos, `record`                                    |
| `RemoteEntity`        | el mismo archivo                                 | El `id` de Odoo (`remoteId`) y `remoteState`. No reemplaza el `uuid`                |
| `@check`              | `domain/entity/checks.ts`                        | Regla sobre campos del propio agregado                                              |
| `valueRule`           | `domain/entity/values.ts`                        | Predicado de un valor: `parse` / `holds`                                            |
| `@relation`           | `domain/entity/relations.ts`                     | Otra entidad que viaja con esta. El segundo argumento es `RelationCascade`          |
| `@mapped`             | `infrastructure/database/mapped.ts`              | Puntero por ids a una entidad que vive sola. Cada lectura reconsulta. No se escribe |
| `withChangeTracking`  | `domain/entity/change_tracking.ts`               | Diff contra la última lectura. Emite `entity.updated`                               |
| `DomainEvent`         | `domain/events/`                                 | El hecho. Se queda en el agregado                                                   |
| `IntegrationEvent`    | `domain/events/integration_event.ts`             | El mismo hecho, entregable. Va a la cola                                            |
| `Subscriber`          | `event_driven/subscriber.ts`                     | Quién escucha un hecho ya encolado                                                  |
| `Hook`                | `domain/repositories/hooks.ts`                   | Qué corre el repositorio alrededor de leer, guardar y borrar                        |
| `IRepository`         | `domain/repositories/repository.ts`              | El puerto: guardar, upsert, borrar, publicar, leer                                  |
| `DocumentRepository`  | `adapters/repositories/document.repository.ts`   | Ese puerto sobre un `DocumentStore`                                                 |
| `SqliteDocumentStore` | `adapters/repositories/sqlite_document_store.ts` | La fila real: `uuid`, `version`, `data`, columnas declaradas                        |
| `Outbox`              | `domain/repositories/document_store.ts`          | `save` del evento y `schedule` de la cola                                           |

`StoreMode.LOCAL` guarda el documento y no encola. `StoreMode.RELAY` guarda el documento y deja cada `IntegrationEvent` en el outbox, dentro de la misma transacción.

## Cómo se relacionan

```mermaid
flowchart TB
  subgraph agregado [Agregado]
    entity[Entity]
    checks["@check"]
    relation["@relation"]
    mapped["@mapped"]
    tracked[withChangeTracking]
    values[valueRule]
  end

  subgraph hechos [Hechos]
    domainEvent[DomainEvent]
    integrationEvent[IntegrationEvent]
  end

  subgraph puerto [Repositorio]
    hooks[Hooks]
    repo[DocumentRepository]
    store[DocumentStore]
    outbox[Outbox]
  end

  subgraph despues [Después del commit]
    bus[EventBus]
    subscriber[Subscriber]
  end

  entity --> checks
  entity --> relation
  entity --> mapped
  entity --> tracked
  entity --> values
  entity -->|record| domainEvent
  entity -->|record| integrationEvent
  repo --> hooks
  repo --> checks
  repo --> relation
  repo --> store
  integrationEvent -->|releaseDeliverable| outbox
  domainEvent -->|se queda en el agregado| entity
  outbox -->|schedule| bus
  bus --> subscriber
```

## Guardar

`save` es el camino completo. `upsert` reconcilia una fila que vino de afuera: no compara versión, no corre checks y no emite `entity.updated`. Sí corre `before_save`, `after_save` y la misma `RelationCascade`, llamando `upsert` en el hijo.

Un `save`, `upsert` o `remove` abre una sola transacción para todos los documentos de esa llamada, padre e hijos. Si el segundo falla, no queda el primero. Cada llamada tiene su propia sesión: lo que se revierte, lo que se entrega y lo que ya se está guardando no se mezclan con otra llamada. Dos guardados del mismo proceso se esperan en el store. Un hook no puede volver a escribir por el repositorio que lo está corriendo, ni abrir otra escritura mientras esa transacción sigue adentro de un hook.

```mermaid
sequenceDiagram
  participant App
  participant Repo as DocumentRepository
  participant Hook as Hooks
  participant Child as Repositorio del hijo
  participant DB as DocumentStore
  participant Box as Outbox

  App->>Repo: save(entity)
  Repo->>Hook: before_save
  Repo->>Hook: before_create o before_update
  Repo->>Repo: checks del agregado y de cada @relation
  Repo->>Child: según RelationCascade, guarda, actualiza o borra
  Repo->>Repo: recordChanges, si hay snapshot
  Repo->>DB: UPDATE ... WHERE version = esperada, si no upsert
  alt la fila cambió
    Repo-->>App: StaleAggregate
  else sigue
    Repo->>DB: version + 1 y el JSON, relaciones como ids
    Repo->>Box: IntegrationEvent, si hay outbox
    Repo->>Hook: after_create o after_update
    Repo->>Hook: after_save
    Repo->>Box: schedule, después del commit, si deliver
  end
```

Si `after_save` lanza, la transacción deshace la fila del padre y la de los hijos, y el repositorio devuelve a cada objeto su `version`, sus tiempos, sus eventos y sus `eventIds`. Un reintento no queda viejo ni pierde el hecho.

## Leer

`findById` hidrata y corre `after_read`. `findByIds`, `findAll` y `findByCriteria` hidratan cada fila (`after_read`) y después corren `after_search` una vez con la página. `findByCriteria` traduce el criteria a SQL en ese momento: una columna declarada se compara por su nombre, y cualquier otro campo con `json_extract` sobre `data`. `today` es la fecha del reloj en su zona y `now` el mismo instante en UTC; los dos se leen una vez al compilar. Un `period` con `between` es `>= inicio AND < fin`. Una relación cruza con `EXISTS`. La colección que ya está en memoria sigue filtrando con el motor de `@sincpro/criteria`. `remoteId`, `remoteState` y `ackedVersion` salen por columna cuando el store las tiene: `sqliteDocuments` las declara si la entidad es `RemoteEntity`.

La hidratación de una `@relation` lee los ids del documento y carga esas filas en el repositorio del hijo. Un JSON viejo que todavía trae el hijo embebido también se acepta. Después anota los ids que el padre tenía y, si el agregado sigue cambios, toma el snapshot. Un `after_read` que rellena un campo entra en ese snapshot: no sale como `entity.updated` en el próximo guardado.

`findByIdSync` y `findByIdsSync` existen para `@mapped`. No corren hooks: un getter no puede esperar.

La versión que manda es la columna. Una fila vieja sin `version` se lee como versión 1.

## Conciliar con Odoo

`version` sube en cada `save`. `ackedVersion` es la versión que Odoo ya aceptó. El documento está sucio cuando los dos números no coinciden, y también cuando todavía no se guardó (`version` 0). `findDirty` busca esa diferencia en las filas guardadas. `acknowledge` iguala `ackedVersion` a `version` sin subirla: es la respuesta de un push. No emite otro `entity.updated`.

Un pull pasa por `reconcile`. Si el teléfono no tiene ese `remoteId`, el `save` siguiente deja las dos versiones iguales. Si el local está sucio, devuelve `keep` y la fila no se escribe. Si está limpio, `mergeWithRemote` cambia el cuerpo y el `save` vuelve a dejar las versiones iguales. `mergeWithRemote` conserva el `uuid`, los eventos, la `version`, `ackedVersion` y el `createdAt`.

Una fila vieja que ya decía `remoteState` `SYNCED` y no tiene `ackedVersion` se lee como limpia. Una que decía `PENDING` se lee sucia.

En Distribution, `mergeRemoteCustomers` hoy pisa el JSON y `pushCustomersToBackend` busca `PENDING`. Con este repositorio el servicio llama `repository.pull(local, incoming)`: guarda solo cuando el local no está sucio. El push busca `findDirty()` y, cuando Odoo devuelve el id, `repository.acknowledge(customer, remoteId)`. La pantalla sigue leyendo `remoteState`: el `save` lo deja en `PENDING` si el documento está sucio y en `SYNCED` si no. Las columnas del store son `remoteId`, `remoteState` y `ackedVersion`. La app adapta su tabla a esos nombres cuando pasa a este repositorio.

## Eventos

`record` nombra la clase una vez y deduplica por el mismo payload de negocio. El hecho queda en el agregado con `entityType`, `aggregateId`, `sequence` y la cadena de correlación.

En el guardado, `releaseDeliverable` saca los `IntegrationEvent` y deja los `DomainEvent`. Los ids que salieron también salen de `eventIds`, así el documento no acumula cada hecho ya entregado. En `LOCAL` sin outbox esos hechos vuelven al agregado y sus ids también.

| Modo                               | Qué pasa con el IntegrationEvent                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `RELAY` con outbox                 | Se escribe en la cola dentro de la transacción. `schedule` corre después, si `deliver` no es `false` |
| `LOCAL` sin outbox                 | Vuelve al agregado. No hay cola                                                                      |
| `publish(events)`                  | Puerta explícita. Los escribe y llama `schedule`                                                     |
| `save(entity, { deliver: false })` | Los persiste y no arranca el drenado. `kick()` lo arranca después                                    |

`entity.updated` extiende `DomainEvent`. No entra a la cola. El primer guardado de un agregado nuevo no lo emite: no había snapshot.

## Versión

`version === 0` significa que esa instancia nunca se persistió (`isNew`). El guardado compara contra la columna `version`: si no hay fila, espera 0 e inserta; si hay fila, hace `UPDATE ... WHERE uuid = ? AND version = ?`. Si no cambia ninguna fila, `StaleAggregate`. El número nuevo es el de la fila más uno. `INSERT OR REPLACE` no se usa: reemplazar la fila borra y vuelve a crear, y dos lectores pueden ganar los dos.

El padre se escribe después de los hijos. Un cambio en una línea mueve la versión del pedido, así que dos lectores del mismo pedido no pueden guardar los dos.

`upsert` no hace esa comparación. La versión pasa a ser la de la fila más uno, o 1 si no había fila.

`entityVersion` del evento queda vacío. La versión de concurrencia es la del documento, no la de un log.

## Relaciones

Hay dos. No hacen el mismo trabajo.

```mermaid
flowchart LR
  order[Pedido]
  line[Línea]
  customer[Cliente]

  order -->|"@relation lines<br/>viaja con el pedido"| line
  order -->|"@mapped customer<br/>solo guarda customerId"| customer
```

`@relation` está en `domain/entity/relations.ts`. La otra entidad es parte de esta y tiene fila propia. El documento del padre guarda solo sus ids. Al leer el padre, esos ids se cargan de la tabla del hijo: la fila del hijo es la copia que manda. El hijo necesita su `DocumentRepository` registrado. El diff de `entity.updated` incluye los campos del hijo, no solo el id.

El segundo argumento es `RelationCascade`. Si no se pasa, es `SAVE_AND_REMOVE`: guarda y borra. El editor autocompleta el resto.

| `RelationCascade`   | Al guardar el padre                                           | Al quitarla del arreglo | Al borrar el padre  |
| ------------------- | ------------------------------------------------------------- | ----------------------- | ------------------- |
| `SAVE_AND_REMOVE`   | Crea la nueva y actualiza la que ya existe                    | Borra la fila           | Borra las que tiene |
| `SAVE`              | Crea y actualiza                                              | La deja                 | La deja             |
| `UPDATE`            | Actualiza solo la que ya fue guardada. La nueva no se inserta | La deja                 | La deja             |
| `REMOVE`            | No escribe la fila                                            | Borra la fila           | Borra las que tiene |
| `UPDATE_AND_REMOVE` | Actualiza la que ya existe. La nueva no se inserta            | Borra la fila           | Borra las que tiene |

```ts
class Order extends Entity {
  @relation(Line)
  lines: Line[] = [];
}

class CatalogItem extends Entity {
  @relation(Price, RelationCascade.UPDATE)
  price: Price | null = null;
}
```

`@mapped` está en `infrastructure/database/mapped.ts`. El campo guarda el id. El getter consulta el otro repositorio cada vez que se lee. Guardar el pedido no crea ni borra al cliente. Es la relación con una entidad que tiene vida propia: cliente, producto, pago.

```ts
class SaleOrder extends Entity {
  customerId = "";

  @mapped(EDistributionRepository.CUSTOMER, "customerId")
  get customer(): Customer {
    return undefined as unknown as Customer;
  }
}
```

`entity.events` es un `@mapped`: `eventIds` guarda los ids y el getter los resuelve contra el repositorio de eventos.

Un valor anidado sin `@relation` ni `@mapped` es JSON del documento. No tiene fila propia.

No hay archivar. Borrar es `remove`.

## Checks y valores

`@check` marca el método y la función que nombra los campos que mira. En un guardado corren todas las reglas del agregado y las de cada `@relation` después de `before_save` y de `before_create` o `before_update`, y antes de escribir. Un hook puede llenar el campo que la regla exige. El fallo es `ChecksFailed`, con la ruta (`lines.0`) cuando la regla es del hijo. Una regla que lee otro agregado no es un check: es un `before_save`, que puede leer otro repositorio.

`checkWarnings(entity, touched)` corre solo las reglas cuyos campos se tocaron. Sirve mientras se edita, antes de guardar.

`valueRule(name, holds)` acepta o rechaza un valor. No sustituye a `ValueObject`, que sigue siendo el documento JSON.

## Hooks

| Momento                           | Cuándo                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `after_read`                      | Cada fila hidratada                                                                                   |
| `after_search`                    | Una vez, con la página de `findByIds`, `findAll` o `findByCriteria`                                   |
| `before_save`                     | Antes de escribir, también en `upsert`                                                                |
| `before_create` / `before_update` | Solo en `save`, según `isNew`                                                                         |
| `after_create` / `after_update`   | Solo en `save`, después de la fila                                                                    |
| `after_save`                      | Después de la fila, también en `upsert`                                                               |
| `before_remove` / `after_remove`  | Alrededor del borrado. `SAVE_AND_REMOVE`, `UPDATE_AND_REMOVE` y `REMOVE` borran las suyas en el medio |

## Qué no es esta capa

No hay borradores ni `refuse_stale`. No hay `DocumentStore` HTTP. Las apps que todavía llaman `addDomainEvent` tienen que pasar a `record` y a este repositorio. Eso es adaptación de la app, no un hueco de esta capa.
