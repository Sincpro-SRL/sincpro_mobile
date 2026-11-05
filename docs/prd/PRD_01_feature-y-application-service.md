# PRD 01 — Feature y ApplicationService

> 2026-11-05. Primer corte del runtime de casos de uso de `@sincpro/mobile`. El bus de
> eventos, el `correlationId` de la entidad y el ORM no entran aquí.

## Qué es

`Feature` es una operación. Lo que el contexto le inyecta está en `deps`, tipado
por la subclase. `ApplicationService` recibe el mapa de `Feature`s de ese mismo
contexto (`features`): el tipo no incluye los de otro módulo. Su método es el span
padre; cada `this.features.*` en ese turno es un hijo del mismo trace.

`new` devuelve un proxy. Un método público corre dentro de un span `Clase.metodo`.
Un nombre que empieza con `_` no abre span. Quien escribe el caso de uso no decora.
Si no hay tracer, o el exportador tira, el método corre igual: la traza no puede
romper el caso de uso. El envío a un colector sigue siendo opt-in
(`createApp({ telemetry })`).

## Qué no es

- No es un bus. Nadie registra el comando. La pantalla, el cron o el subscriber llaman
  al método, como hoy.
- No une al subscriber que corre en el tick siguiente de `EventBus`. El span muere
  cuando el método retorna. Llevar `correlation_id`, `causation_id` y `traceparent` en
  el evento, y restaurarlos en `drainAll`, es el corte de event-driven.
- No cambia `Entity.addDomainEvent`. El UUID de tanda que hoy se llama `correlationId`
  no es el flujo ni el trace.

## Cómo se adopta

Una clase pasa a extender `Feature` o `ApplicationService` cuando se la va a observar.
El primer `ApplicationService` de distribution es `DistributionWorkflowsImp`. Los
archivos `*.feature.ts` que son un service de varias operaciones no se renombran por
este corte: el nombre `Feature` queda reservado a la base.
