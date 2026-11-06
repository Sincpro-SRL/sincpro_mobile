# PRD 02 — La cadena del evento

> 2026-11-05. Primer corte de SP-2026-1065. El mapa de la capa está en el
> PRD 05. No se implementa hasta que se defina.

## Qué ya está alineado

Distribution ya nombra los hechos como el framework de Python:
`distribution.invoice.v2.created_from_sale_order`. Cada clase trae un `label` en
español, y ese texto se guarda en la fila. Los handlers no hay que reescribirlos
para que la cadena exista.

El estado de una orden, una factura o un pago sigue siendo la fila. El evento avisa
que la fila cambió. No es event sourcing.

## Qué no coincide

En Python el evento es un hecho. Lleva `id`, `entity_type`, `entity_id`,
`correlation_id` (el pedido original) y `causation_id` (el hecho que lo causó).
El agregado solo registra. El Feature publica después de guardar. Reintentos y
dead letter viven aparte del hecho.

En mobile el mismo objeto es el hecho y el trabajo de la cola. `status`,
`attempts` y `errorMessage` van dentro de `DomainEvent`. `correlationId` no es el
pedido: `Entity.addDomainEvent` genera un UUID de tanda (`_correlationIdV2`) y
`DomainEventRepository.hasPendingDuplicate` lo usa para no guardar dos veces el
mismo nombre en `PENDING`. Si ese campo pasa a significar el request, el segundo
evento del mismo nombre en un flujo se descarta.

`publish()` guarda y vuelve. El subscriber corre en el tick siguiente, con la pila
del Feature ya vacía. `publishSync` sí corre en la pila viva.

## Orden

1. Dos identificadores. El UUID de tanda se queda como clave de deduplicación.
   `correlationId` pasa a ser el request que abrió el Feature. `causationId` es el
   evento anterior. Se sellan en `addDomainEvent`, con el span todavía abierto.
   `traceparent` va en el JSON del evento, no en una columna nueva.
2. `drainAll` vuelve a empujar ese carrier, ejecuta `process` y lo suelta en el
   `finally`. `publishSync` no restaura.
3. El tipo separa el hecho de la entrega. Las columnas de la cola se quedan. La
   UI de distribution lee el hecho; la cola lee la entrega.

Distribution hereda el corte. Un pedido que confirma, factura y concilia queda en
una sola cadena. Convertir los handlers en `Feature`, o publicar desde el
agregado, queda para cuando un segundo contexto tenga que oír el mismo hecho.
