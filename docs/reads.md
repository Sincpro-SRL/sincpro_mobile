# Leer datos

Cómo se lee en `@sincpro/mobile`: qué usar para cada lectura, cómo se escribe un criteria, cómo
se pagina y qué hacer cuando un criteria no alcanza. La gramática es la de `@sincpro/criteria`,
la misma del backend: lo que se escribe acá se lee igual contra un servidor.

## Qué usar

| Necesito                                                                  | Uso                                                               |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Una página de una entidad para una pantalla                               | `new CommandSearchEntities(Ticket, criteria)`                     |
| Uno por su clave, o varios                                                | `new CommandGetEntity(Ticket, id)`, `CommandGetManyEntities`      |
| Lo que un select muestra para un texto                                    | `new CommandFindEntities(Ticket, typed)`                          |
| Una lectura con regla propia: un alcance, un permiso                      | Un caso de uso declarado: `Search(Ticket)` + `EntityReads`        |
| Preguntas del dominio con nombre, dentro de un caso de uso                | Un repositorio propio: `class Tickets extends DocumentRepository` |
| Todo lo que coincide, sin página (no para una pantalla)                   | `repository.fetchAll(criteria)`                                   |
| Lo que un criteria no dice sobre una entidad: un join, un `EXISTS` a mano | `repository.searchSql(sql…, criteria)`                            |
| Un reporte: filas que no son una entidad                                  | `queryPage(sql…, criteria, { identity })`                         |
| Los mensajes de la cola (eventos, fallidos)                               | `new CommandSearchEvents(criteria)`                               |
| Las filas de una tabla (la pantalla de base de datos)                     | `new CommandReadTable(tabla, criteria, texto)`                    |

Lo que lee una pantalla pasa siempre por un Command: así tiene su span, su tipo de falla y su
reporte. Un repositorio se usa dentro de un caso de uso.

## Escribir un criteria

Con el builder, que tipa los campos con la entidad: un campo que no existe no compila.

```ts
import { criteria, dynamic, selection } from "@sincpro/criteria";

// Varias condiciones son AND.
criteria<Ticket>().selection(["state", "=", "open"], ["total", ">", 100]);

// OR, NOT y grupos anidados se escriben como se leen.
criteria<Ticket>().selection(
  ["state", "=", "open"],
  selection.any(selection.all(["priority", ">=", 2], ["total", "<", 50]), [
    "number",
    "in",
    [8, 9],
  ]),
  selection.negate(["customerId", "is null", true]),
);

// Texto, listas, rangos y fechas que se leen al compilar.
criteria<Ticket>().selection(
  ["title", "like", "factura"], // contiene, sin mayúsculas
  ["code", "starts with", "T-"],
  ["state", "in", ["open", "waiting"]],
  ["total", "between", [100, 500]],
  ["createdAt", "between", dynamic.period("this_month")], // >= inicio AND < fin, en la zona de la app
);

// Una relación (@relation) se cruza con EXISTS.
criteria<Order>().selection({
  through: "lines",
  selection: { field: "amount", operator: ">", value: 10 },
});

// Orden, página y conteo.
criteria<Ticket>().order("-total", "number").limit(20).counting("exact");
```

El objeto plano (`{ selection: { field, operator, value } }`) también se acepta en todos lados;
el builder es la forma que se lee mejor y la que tipa. Cada lectura acepta los dos
(`CriteriaFor<T>`).

## Páginas

Por defecto se pagina por **cursor** (keyset): estable aunque entren filas nuevas, y eficiente
en cualquier página. El offset existe para quien lo pida.

| Se pide                                    | Se obtiene                                                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Nada                                       | La primera página de 50, con `cursor` si hay más                                                               |
| `.limit(20)`                               | Páginas de 20                                                                                                  |
| `.cursor(page.cursor)` o `resumingFrom(…)` | La página siguiente. `Reading` / `useReading` lo hacen solos                                                   |
| `.offset(40)`                              | Salta 40 y no devuelve cursor: quien cuenta filas sabe cuál sigue                                              |
| Sin `counting`                             | Cuenta la primera página (hasta 10 000); la que sigue o salta filas no cuenta: el `Reading` conserva el conteo |
| `.counting("capped" \| "exact")`           | Cuenta **cada** página, hasta 10 000 o exacto                                                                  |
| `.counting("none")`                        | No cuenta nunca: la página más barata                                                                          |

El orden es el del criteria, o el de la entidad (`DEFAULT_ORDER`), y siempre lo cierra su
identidad (`uuid`) en la dirección del primer orden: dos filas nunca empatan. Un cursor de otro
orden se rechaza (`InvalidCriteria`) y un `Reading` vuelve a la primera página.

```ts
const tickets = resource<Ticket>((asked) =>
  commonBoundedContext.execute(new CommandSearchEntities(Ticket, asked)),
);
const { rows, hasMore, more } = useReading(tickets, criteria<Ticket>().limit(20));
```

### Fechas y zona horaria

`today`, `now` y un `period` se calculan en la zona horaria que la app instaló en client-framework
(`installTimeZone("America/La_Paz")`: la de la empresa o la del usuario), y en la de la plataforma
si no instaló ninguna. Los días de los filtros de una pantalla empiezan a la medianoche de esa
misma zona. Una zona propia de cada ejecución (la de su contexto) llega con
Sincpro-SRL/sincpro_client_framework#46.

### Dos formas de combinar un criteria

| Se combina                                                       | Ley                                                                                                                                                                     |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lo que pide quien llama sobre lo que la entidad trae por defecto | `replacedBy(defaults, asked)`: lo que nombra quien llama **reemplaza** (orden, página, conteo, specification); su filtro se suma (AND). Es el `replaced_by` del backend |
| El alcance de un caso de uso con lo que pide quien llama         | `merge(scope, asked)`: el alcance **solo recorta**; quien llama no lo puede agrandar                                                                                    |

## La entidad dice cómo se lee

Se sobrescribe solo lo que cambia (`DEFAULT_GET_ID`, `DEFAULT_ORDER`, `DEFAULT_DISPLAY`,
`DEFAULT_LITERAL_SEARCH` con `TEXT`); ver [architecture-aggregate.md](architecture-aggregate.md#cómo-se-lee-una-entidad).
Con eso, cada página trae el modelo de la entidad (`page.meta`, de `metaOf(Ticket)`): sus campos
con su tipo y sus operadores, su identidad, su display y su búsqueda. Una pantalla arma con él
sus filtros y las etiquetas de un select, como lo haría con la definición de un servidor.

## Un repositorio propio

`sqliteDocuments` devuelve el repositorio genérico de la entidad. Cuando el dominio tiene
preguntas con nombre, se escriben en una clase propia que lo extiende: hereda todo (leer,
guardar, hooks, outbox) y agrega solo lo suyo.

```ts
export class Tickets extends DocumentRepository<Ticket> {
  open(asked: CriteriaFor<Ticket> = {}) {
    return this.search(criteria<Ticket>().selection(["state", "=", "open"]).merge(asked));
  }
}

export const tickets = sqliteDocuments(Ticket, "tickets", { repository: Tickets }); // tipado como Tickets
```

| Lectura                     | Responde                                                           |
| --------------------------- | ------------------------------------------------------------------ |
| `get(uuid)`                 | La entidad o `null`                                                |
| `browse(uuids)`             | Las de esos ids, en el orden pedido                                |
| `search(criteria)`          | Una página (`EntityCollection` con `cursor` y `total`)             |
| `fetchAll(criteria)`        | Todas las que coinciden: un tamaño sin límite, dicho por su nombre |
| `first(criteria)`           | La primera en su orden, o `null`                                   |
| `exists(criteria)`          | Si alguna coincide                                                 |
| `count(criteria)`           | Cuántas (`Count`)                                                  |
| `searchSql(sql…, criteria)` | Una página de lo que responde un SQL propio                        |

## Cuando un criteria no alcanza: SQL, seguro y paginado

Un join, una subconsulta o un reporte se escriben en SQL con el tag `sql`. **Ningún valor se
pega al texto**: cada valor es un parámetro, una lista es un parámetro por elemento, una
sentencia dentro de otra trae sus parámetros, y un nombre de tabla o columna pasa por
`identifier()`, que lo valida.

```ts
import { identifier, sql } from "@sincpro/mobile/domain/database";

sql`SELECT * FROM tickets WHERE json_extract(data, '$.customerId') = ${customerId}`;
sql`… WHERE state IN (${["open", "waiting"]})`;
sql`SELECT * FROM ${identifier(table)} ${where}`;
```

Y se lee **igual que cualquier página**: el criteria filtra, ordena y pagina sobre lo que el
SQL responde, con cursor u offset, y cuenta.

```ts
// Entidades: el SQL responde filas de la tabla de la entidad (uuid, version, data, columnas).
const page = await tickets.searchSql(
  sql`SELECT t.* FROM tickets t
      JOIN customers c ON c.uuid = json_extract(t.data, '$.customerId')
      WHERE json_extract(c.data, '$.city') = ${city}`,
  criteria<Ticket>().selection(["state", "=", "open"]).order("-total").limit(20),
);

// Un reporte: filas que no son una entidad. `identity` es la columna que distingue dos filas.
type Sale = { uuid: string; vat: string; total: number };
const sales = await queryPage<Sale>(
  sql`SELECT o.uuid, json_extract(c.data, '$.vat') AS vat, json_extract(o.data, '$.total') AS total
      FROM orders o JOIN customers c ON c.uuid = json_extract(o.data, '$.customerId')`,
  criteria<Sale>().selection(["total", ">", 100]).order("-total").limit(20),
  { identity: "uuid" },
);
```

## Qué cambió y cómo se migra

Dentro de este paquete lo viejo se reemplaza de una vez, sin capa de compatibilidad: lo que lo
usa se cambia en el mismo paso.

| Antes                                            | Ahora                                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `repository.findById(id)`                        | `get(id)`                                                                                              |
| `repository.findByIds(ids)`                      | `browse(ids)`                                                                                          |
| `repository.findAll()` / `findByCriteria(c)`     | `fetchAll(c)`, o `search(c)` para una pantalla                                                         |
| `CommandListRecentEvents`, `RECENT_EVENTS_LIMIT` | `CommandSearchEvents(criteria)`                                                                        |
| `CommandListFailedEvents`                        | `CommandSearchEvents(criteria<EventRecord>().selection(["state", "=", "set_aside"]))`, leyendo `.rows` |
| `<DeadLetterQueueList select={…} />`             | `<DeadLetterQueueList scope={criteria…} />`: se lee en SQL                                             |
| `CommandReadTable(tabla)` → filas                | `CommandReadTable(tabla, criteria, texto)` → una página                                                |
| Un caso de uso de lectura por entidad, vacío     | `CommandSearchEntities(Ticket, …)` y compañía                                                          |

Lo que rompe a **otro** repositorio que todavía no migró se marca `@deprecated` y convive hasta
que migra: hoy, el puerto `IRepository` / `IRemoteRepository` de los repositorios escritos a
mano (distribution, Sincpro-SRL/sincpro_mobile_distribution#2).

## Lo que esto le propone a criteria y al backend

Lo que se resolvió acá y conviene que la gramática o el motor tengan, para que web, mobile y el
backend lo escriban igual:

1. **Una página sobre SQL propio.** `searchSql` y `queryPage` aplican un criteria (filtro, orden,
   cursor, conteo) sobre lo que responde una sentencia. El backend podría ofrecer lo mismo
   (`search_sql`), y el contrato describir sus columnas como un modelo.
2. **Buscar sin acentos.** `like` en el motor ignora mayúsculas, no acentos. Acá se guarda una
   clave normalizada (`label_key`) para buscar "impresion" y encontrar "Impresión". Un operador o
   una opción del motor (`like` normalizado) lo haría igual en todos lados.
3. **El modelo de algo que no publica contrato.** `metaOf(Entity)` describe una entidad local con
   `describeRows` sobre una instancia en blanco más sus `DEFAULT_*`. Un `describeEntity` en
   `@sincpro/criteria` con esa forma evitaría que cada plataforma lo invente.
4. **Un solo evaluador.** El motor de `@sincpro/criteria` en memoria, y en SQLite el SQL que
   compila el core: nada más. Divergen menos cuantos menos evaluadores haya.
5. **Un solo modelo de filtros en la UI.** El `FilterBuilder` de mobile-ui tiene su propio árbol
   (`CriteriaGroup`, `"contains"`, `"greater"`) y hoy se traduce a mano (`eventCriteria`). Si
   hablara `Expression` + `Meta`, cualquier pantalla tendría filtros sin escribirlos.
