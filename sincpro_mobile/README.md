# `sincpro_mobile` — Core del framework (sin UI)

Core standalone del framework móvil, en construcción por **duplicación** desde `apk/` (el `apk/`
actual sigue funcionando intacto; aquí se construye en paralelo y se cambia después).

## Estructura (capas que respetamos: domain · adapters · infrastructure · entrypoints)

```
sincpro_mobile/
├── domain/              # primitivas del core
│   ├── module.ts        # ✅ contratos de módulo (IModule{Migration,Subscriber,Cron,Repository})
│   └── (pendiente: entity, value_object, entity_collection, event, subscriber, repository, network, webview, print)
├── adapters/            # (pendiente) printer, bluetooth, webview, network, geo, receiptExporter, jsonSerializer
├── infrastructure/      # (pendiente) connector, EventBus, CronWorker, UIEventBus, logger, Orchestrator (module-driven), database/mapped
├── entrypoints/
│   ├── app/             # registro + init  ← PUNTO DE ENTRADA
│   │   ├── DomainModule.ts   # ✅ clase base de módulo
│   │   └── (pendiente: BaseModule, Kernel, createApp)
│   ├── db/              # (pendiente) runMigrations + repos container, alimentados por módulos
│   ├── queue/           # (pendiente) QueueProcessor, alimentado por módulos
│   └── cron/            # (pendiente) Cron, alimentado por módulos
├── tools/               # ✅ utils vivos (Initials, collections, date, maps, monetary, quantity, searchTools, serializer)
├── exceptions.ts        # ✅ excepciones del core
└── index.ts             # ✅ barrel público
```

## Reglas

1. **Nunca importar `@apk/*`** desde aquí. Imports internos = `@sincpro_mobile/*`.
2. **Sin UI** (se aborda en un hito posterior).
3. **Sin Odoo**: el core no conoce el backend. La limpieza de credenciales de Odoo en logout se
   resolverá con un hook de logout del módulo de Odoo (decisión en #15), no con un puerto en el core.
4. **Sin código muerto**: no se duplican `generate_client_code`, `mixins`, `immutableToMutable`.
5. **Comentarios:** el código **nuevo** del framework no lleva comentarios (regla `.github`); el
   código **duplicado conserva sus comentarios originales**.

## Acoplamientos a cortar al duplicar (recon sobre `apk/`)

El "core" actual NO es standalone hoy. Al duplicar cada pieza hay que cortar:

| Acoplamiento                                                            | Origen                                                 | Cómo se corta                                                                                                  |
| ----------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| → `distribution/domain/customer`                                        | `apk/tools/utils/generate_client_code.ts`              | **borrar** (util muerto, 0 refs)                                                                               |
| → `distribution/domain/settings` (`DEFAULT_LOCALE`, `DEFAULT_TIMEZONE`) | `apk/tools/utils/date.ts:1`                            | **inline** los defaults en el core                                                                             |
| → `@apk/entrypoints/*`, `@apk/domains` (EDomain), `OdooClient`          | `apk/infrastructure/InfrastructureOrchestrator.ts:1-8` | **reescribir** module-driven + claves `string`; limpieza de credenciales de Odoo vía hook de logout del módulo |
| → `RepositoriesContainer` (type)                                        | `apk/infrastructure/database/mapped.ts:1`              | **reapuntar** al `RepositoriesContainer` del core                                                              |

> `CronWorker` hace `await import("@apk/infrastructure/InfrastructureOrchestrator")` para el
> chequeo de auth — al duplicar, reapuntar al orquestador del core (o inyectar `isAuthenticated`).

## Estado del incremento actual

- ✅ Alias `@sincpro_mobile` (tsconfig + babel module-resolver + override de decorators).
- ✅ `domain/module.ts`, `entrypoints/app/domain_module.ts`, `index.ts`.
- ✅ `tools/` (sin los 3 muertos) + `date.ts` con fallback local; `exceptions.ts`.
- ✅ `infrastructure/` (connector, mapped reapuntado, utils, EventBus, CronWorker sin orquestador,
  UIEventBus, logger) — **sin OdooClient ni Orchestrator**.
- ✅ `domain/` completo (entity, value_object, entity_collection, event, subscriber, repository,
  network, webview, print, bluetooth, geo, server, settings, database, icon, receipt).
- ✅ `adapters/` (6 adapters + repos base: domain_event, dead_letter, settings, server, database_table).
- ✅ `entrypoints/db/` (migrations base + `RepositoriesContainer` module-driven).
- ✅ 56 archivos, **cero imports `@apk`**, typecheck verde.
- ✅ Los archivos duplicados conservan sus comentarios originales (`mapped.ts` restaurado).
- ✅ `entrypoints/app/`: `BaseModule` (migraciones + repos + subscribers + crons base), `Kernel`
  (shared primero, `bootstrap()` registra repos + corre migraciones), `createApp({ domains })`.
- ✅ `services/` (bluetooth, network, printer, webview) + `entrypoints/queue/`
  (processWebViewMessage, printImage, **newAppSettings cortado a `SettingsRepository`**) +
  `entrypoints/cron/checkNetworkStatus`.
- Decisiones de clasificación: **settings/NewAppSettings = CORE** (cortado el import a distribution);
  **server.service = Odoo** (fuera del core).
- ✅ **#15 cerrado** — runtime module-driven:
  - `entrypoints/queue/QueueProcessor.ts` y `entrypoints/cron/Cron.ts` (sync diff-based,
    alimentados por `subscribersByKey`/`cronsByKey` del Kernel, claves `string`).
  - `entrypoints/app/orchestrator.ts` (singleton `orchestrator`): bootstrap, sesión
    (authenticate/restore/unauthenticate), `enableDomain`/`disableDomain` (mutex, protege shared),
    AppState watcher con `restoreConsistency`. **Sin Odoo** (la limpieza de credenciales será hook
    del módulo Odoo); `unauthenticate` usa `Kernel.restartDatabase()`.
  - `entrypoints/queue/activateDomain.subscriber.ts` (usa el `orchestrator` del core; claves `string`).
  - `Kernel`: `subscribersByKey()`, `cronsByKey()`, `restartDatabase()`, `runMigrations()`.
  - `createApp({ domains })` configura el orquestador y hace `bootstrap()`.
  - Contratos `DomainModule` con tipos reales (`Subscriber`, `CronWorker`, `IMigration`); se
    eliminó `domain/module.ts` (contratos sueltos).
- 70 archivos, **cero `@apk`**, typecheck verde.
- ⏭️ Siguiente: flip (que `apk/` consuma `@sincpro_mobile` y borrar duplicados) + Addon de
  impresión (#16) + puerto `IPrinterDriver`.
