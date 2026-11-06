# Documentation

Engineering documentation for `@sincpro/mobile`. The root [`README.md`](../README.md) is
the product overview and summary; these documents go deep on specific subsystems, with
component + sequence diagrams and the rationale behind each decision.

## Architecture

- [**architecture-core.md**](architecture-core.md) — the core, and which part of the
  client already comes from `@sincpro/client-framework`. Almost-ORM (`DBCursor`,
  `@mapped`), event-sourced entities, default repositories, `EventBus` + `QueueProcessor`,
  cron, and the AppShell → Orchestrator → Kernel boot.
- [**architecture-telemetry.md**](architecture-telemetry.md) — telemetry (OpenTelemetry +
  Loki): the component pipeline, event-driven delivery, and bounded offline retention.
- [**architecture-consumer.md**](architecture-consumer.md) — recommended structure for a
  consumer app: adapters, services (use cases / workflows), ui, and subscribers.
- [**prd/PRD_01_feature-y-application-service.md**](prd/PRD_01_feature-y-application-service.md)
  — `Feature` and `ApplicationService`: a public method is a span, with no decorator.
- [**prd/PRD_02_cadena-del-evento.md**](prd/PRD_02_cadena-del-evento.md)
  — correlation, causation and the queue: the first cut of SP-2026-1065.
- [**prd/PRD_03_orm-y-base-de-datos.md**](prd/PRD_03_orm-y-base-de-datos.md)
  — SP-2026-1072. The document store: one unit of work, named migrations,
  criteria on promoted columns.
- [**prd/PRD_04_comunicacion-y-adapters.md**](prd/PRD_04_comunicacion-y-adapters.md)
  — SP-2026-1068. The Odoo port, and a page download that commits with its fact.
- [**prd/PRD_05_eventos-y-event-store.md**](prd/PRD_05_eventos-y-event-store.md)
  — SP-2026-1065. The fact, the delivery and the chain, against the Python
  framework.

## Reference

- [**GOTCHAS.md**](GOTCHAS.md) — runtime/dependency/UI traps (symptom → cause → fix). Read
  this when something behaves strangely.

## Historical (analysis, not living docs)

- [**analysis/FRAMEWORK_ROADMAP.md**](analysis/FRAMEWORK_ROADMAP.md) — the original phased
  plan for the core platform. Kept for context; not the current state of the code.
