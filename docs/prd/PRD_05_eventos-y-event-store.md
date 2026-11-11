# PRD 05 — Eventos y event store

> SP-2026-1065. 2026-11-05. Contraste con `sincpro_framework.ddd.events`:
> el hecho, la entrega y el event sourcing son tres cosas. El detalle de la
> cadena está en el PRD 02. No se implementa hasta que se defina el corte.

## Qué es hoy

Hay una tabla viva, `domain_events`, y dos tablas que el arranque crea y nadie
escribe: `event_queue` y `dead_letter_queue`. La cola y el histórico que pinta
la ficha (orden, cliente, ruta) son la misma fila.

`DomainEvent` guarda el hecho (`name`, `label`, `data`) y el trabajo
(`status`, `attempts`, `errorMessage`, `acknowledgedAt`, `failedAt`).
`EventBus` drena `PENDING` cada 800 ms. `MAX_ATTEMPTS` es 1: el primer fallo
va a `domain_events_dead_letter`. El backoff existe y no reintenta.
`saveMany` llama `save` en un bucle, fuera de una transacción (PRD 03).

`correlationId` es el UUID de la tanda de `addDomainEvent`.
`hasPendingDuplicate` descarta otro `PENDING` con el mismo `name` y ese id.
No hay `causationId` ni `entity_type`. El `label` es un string y se persiste,
así que una fila vieja conserva el texto viejo. Los nombres de cable de
distribution ya siguen el estilo de Python
(`distribution.invoice.v2.created_from_sale_order`).

`publish()` guarda y vuelve. El subscriber corre en el tick siguiente, con la
pila del Feature vacía. `publishSync` corre en esa pila.

## Qué ya cerró el framework de Python

El evento es un hecho: id, tipo de entidad, id, versión, correlación del
pedido, causa directa. El agregado lo registra. `save` escribe el estado y los
hechos mapeados en la misma transacción, y no los drena. El Feature publica
después del commit. Reintentos, dead letter y `delivered_at` viven en
`DeliverableEventMixin` y no salen en el JSON del hecho. Event sourcing —la
historia es el estado— es otro mixin, y solo cuando no hay fila de agregado.
Una base alcanza con una cola en proceso. Un broker aparece cuando hay otro
proceso.

## Qué se queda en mobile

La orden, la factura y el pago siguen teniendo fila. El evento avisa que la
fila cambió. La UI sigue leyendo los hechos de esa entidad para la línea de
tiempo. No hay Kafka ni relay entre procesos: quien escucha es un caso de uso
del mismo dispositivo, registrado para el evento en su bounded context. Esos
casos de uso no se reescriben para este corte.

## Cortes, en este orden

1. La cadena del PRD 02. El UUID de tanda sigue siendo la clave de
   deduplicación. `correlationId` pasa a ser el request. `causationId` es el
   hecho anterior. Se sellan en `addDomainEvent`, con el span abierto.
   `traceparent` va en el JSON, no en una columna. `drainAll` restaura ese
   carrier alrededor de `process`. `publishSync` no restaura.
2. El hecho y la entrega se separan en el tipo. La tabla puede seguir teniendo
   las columnas de la cola. El JSON del hecho no las incluye. `event_queue` y
   `dead_letter_queue` se dejan de crear cuando un dispositivo nuevo ya no las
   necesita; no se borran en un teléfono que ya las tiene.
3. Guardar el agregado y sus hechos es una unidad de trabajo (PRD 03). El
   drenado sigue siendo después. Un fallo a mitad no deja el documento escrito
   y el hecho afuera, ni al revés.
4. El reintento es de la entrega. Un fallo de red vuelve a `PENDING` con
   espera. Un fallo de negocio va al dead letter al primer intento. El límite
   deja de ser la constante 1 para todos.

`sequence` es el orden dentro de la tanda, no la `version` de la entidad. El
`label` como diccionario congelado puede esperar: hoy es el texto que la
pantalla muestra.
