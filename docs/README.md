# Documentation

Engineering documentation for `@sincpro/mobile`. The root [`README.md`](../README.md) is
the product overview and summary; these documents go deep on specific subsystems, with
component + sequence diagrams and the rationale behind each decision.

## Architecture

- [**architecture-core.md**](architecture-core.md) — the core: almost-ORM (`DBCursor`,
  `@mapped`), event-sourced entities, default repositories, `EventBus` + `QueueProcessor`,
  cron, and the AppShell → Orchestrator → Kernel boot.
- [**architecture-telemetry.md**](architecture-telemetry.md) — telemetry (OpenTelemetry +
  Loki): the component pipeline, event-driven delivery, and bounded offline retention.
- [**architecture-consumer.md**](architecture-consumer.md) — recommended structure for a
  consumer app: adapters, services (use cases / workflows), ui, and subscribers.

## Reference

- [**GOTCHAS.md**](GOTCHAS.md) — runtime/dependency/UI traps (symptom → cause → fix). Read
  this when something behaves strangely.

## Historical (analysis, not living docs)

- [**analysis/FRAMEWORK_ROADMAP.md**](analysis/FRAMEWORK_ROADMAP.md) — the original phased
  plan for the core platform. Kept for context; not the current state of the code.
