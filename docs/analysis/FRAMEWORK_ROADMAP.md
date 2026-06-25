# Plan de Mejoras — Framework Core (`@sincpro/mobile`)

> **Alcance: SOLO la plataforma** (infra, primitivas DDD, cola/eventos, repos/adapters base, composición
> module-driven, transversales). UI/router/layouts/system-UI van en [`UI_ROUTER_ROADMAP.md`](UI_ROUTER_ROADMAP.md).
> Cada item: severidad (🔴 bug real · 🟡 robustez/DX · 🟢 nice-to-have), **[AUTO]** (agente solo, gate `make verify-format` + `make doctor`) o **[ASSIST]** (decisión/diseño), y referencia `archivo:línea`.
> Hallazgos validados contra el código (2026-06). Mapea al backlog de tareas (#8–#16).

---

## Áreas de mejora

### A1 · Primitivas de dominio (`domain/entity/`, `domain/event_sourcing/`)

- 🟡 **`EntityCollection.equals` rota por UUID de instancia** — `entity_collection.ts:58` genera `uuid = generateUUID()` por instancia; `equals` (heredado de `ValueObject`) compara el JSON que incluye ese uuid → dos colecciones con el mismo contenido **no son iguales**. [AUTO] redefinir `equals` comparando contenido (uuids de las entidades), ignorando el uuid de la colección. (#8)
- 🟡 **`@mapped` no memoiza** — `infrastructure/database/mapped.ts:171-184` consulta DB en **cada** acceso (sin caché por instancia). Eventos/relaciones se re-resuelven una y otra vez. [AUTO] memoización por instancia con invalidación. (#11)
- 🟡 **Deduplicación de eventos solo local** — `entity.ts:136-164` deduplica por payload dentro de la misma entidad, no globalmente. [AUTO/ASSIST] check global en EventBus antes de persistir.

### A2 · Cola de eventos e infraestructura (`infrastructure/`)

- 🔴 **`saveMany()` sin transacción** — `adapters/repositories/domain_event.repository.ts:67-71` hace loop sin `BEGIN/COMMIT`; si falla a mitad, la BD queda inconsistente. [ASSIST] envolver en transacción SQLite + `publishMany` transaccional en la entidad. (#9)
- 🟡 **`MAX_ATTEMPTS = 1` desactiva el retry** — `infrastructure/workers/EventBus.ts:16`: todo error va a DLQ en el primer intento (el backoff existe pero nunca reintenta). [ASSIST] subir a 3 y/o hacerlo configurable por evento (`requiresNetwork`, criticidad).
- 🔴 **Fuga de listeners** — `EventBus.ts:25,231-282` y `UIEventBus.ts:56-65`: `on()` sin `off()` garantizado; `UIEventBus.off()` compara el handler envuelto ≠ original → nunca lo encuentra. Sin cleanup en logout/disableDomain. [AUTO] guardar `originalHandler` en el Map; `off()` automático en `orchestrator.disableDomain()`. (#10)
- 🟡 **`drainAll()` ignora dominios activos** — `EventBus.ts:320-339` procesa todos los eventos sin filtrar por dominio activo. [ASSIST] decidir si el filtro vive en QueueProcessor o en drainAll.
- 🟡 **`CronWorker` sin mutex** — `infrastructure/workers/CronWorker.ts:104-135`: si un job dura más que su intervalo, las ejecuciones se solapan. [AUTO] mutex en `runWithEvents()`.
- 🔴 **Migraciones sin versionar** — `entrypoints/db/migrations.ts` es una lista de funciones por índice; borrar una del medio corre las siguientes mal; no hay forma de saber el schema en prod. [ASSIST] tabla de versiones (nombre + timestamp + hash) + runner idempotente.

### A3 · Repositorios y adapters base (`adapters/`, `domain/database/`)

- 🟡 **Sin `BaseRemoteRepository<T>` genérico** — cada repo (`domain_event`, `dead_letter`, `settings`, `database_table`) repite CRUD + (de)serialización JSON. [ASSIST] base SQLite+JSON con CRUD + `findByRemoteState`/`findByRemoteId`. (#12)
- 🟡 **Falta helper `syncRemoteToLocal()`** — los services repiten el patrón fetch-remoto→upsert-local→emitir-evento. [AUTO] helper reutilizable. (#13)
- 🟡 **`RepositoriesContainer` sin type safety** — `entrypoints/db/repositories.ts:8-46`: `registry: Record<string, any>`; se puede registrar cualquier objeto que no implemente `IRepository`. [AUTO] type guard / firma tipada.
- 🟢 **`BaseOdooAdapter` + escape hatch `infra.http`** — vive en `mobile-odoo`, pero el puerto base (`IRemoteClient`) y el patrón conviene formalizarlos en core. [ASSIST] (#14)

### A4 · Composición / framework (`framework/`)

- 🟡 **`orchestrator` sin cleanup de AppState** — `framework/orchestrator.ts:66-75`: `bootstrap()` 2× registra el listener 2×. [AUTO] `stop()`/`cleanup()` que des-suscribe.
- 🟡 **`enableDomain` no valida módulo registrado** — `framework/orchestrator.ts:108-115` acepta una key inexistente sin error. [AUTO] validar contra `activeDomains`.
- 🟡 **`Kernel.bootstrap()` sin try-catch/rollback** — `framework/kernel.ts:57-68`: si una migración falla, el facade `@mapped` ya se inicializó (estado inconsistente). [AUTO] try-catch + rollback. `restartDatabase()` (kernel.ts:70-81) sin transacción.
- 🟡 **`DomainModule` sin contrato de hooks de ciclo** — no hay hook de `onLogout`/`onAuthChange` ni garantía de orden cuando dos módulos escuchan el mismo evento. [ASSIST] definir hooks + documentar orden.

### A5 · Transversal

- 🔴 **CERO tests en el core** — sin `.test.ts`/`.spec.ts`. Regresiones silenciosas en lo más delicado (Entity/Collection/eventos/orchestrator). [ASSIST] suite mínima (ver FF1).
- 🟡 **Observabilidad** — `infrastructure/logger.ts` tiene categorías pero sin timestamps consistentes, sin nivel configurable en runtime, sin contexto (`aggregateId`/`correlationId`) ni sink externo. [AUTO] enriquecer logs.
- 🟡 **Error handling parcial** — `errorHandler.ts:4-17` solo mapea `DomainException`→Alert; errores nativos/timeouts sin ruta clara. [AUTO] mapa tipo→handler + docs.
- 🟡 **Sin config central** — constantes dispersas (`INTERVAL_MS`, `DEBOUNCE_DELAY`, `MAX_ATTEMPTS`, `SESSION_TTL`). [ASSIST] `config.ts` central + overridable por app.
- 🟢 **Docs de API/patrones** — falta guía "cómo crear un módulo / agregar evento+subscriber". [AUTO] sobre `AGENTS.md`.

---

## Plan progresivo (fases)

> Orden por **severidad × riesgo de datos**. La confiabilidad de datos primero; la red de seguridad (tests) habilita el resto.

### FF0 · Confiabilidad de datos _(🔴 bloqueante de fiabilidad)_ ⬜

- [ASSIST] `saveMany()`/`publishMany` transaccional (SQLite `BEGIN/COMMIT/ROLLBACK`). (#9)
- [ASSIST] `MAX_ATTEMPTS` configurable (default 3) + retry real con backoff.
- [AUTO] Mutex en `CronWorker.runWithEvents()`.
- **Verificación:** un lote de eventos que falla a mitad no deja la BD inconsistente; un evento transitorio se reintenta antes de ir a DLQ; dos ticks de cron no se solapan.

### FF1 · Red de seguridad: tests _(🔴 habilita refactors sin miedo)_ ⬜

- [ASSIST] Suite mínima (jest/vitest + RN testing): `Entity`/`EntityCollection` (equals, eventos, dedup), `DomainEvent` (asJSON/fromJSON/from), `EventBus` (publish/retry/DLQ/leak), `orchestrator` (mutex, enable/disable), `Kernel` (bootstrap/migraciones).
- **Verificación:** `make test` corre verde en CI; cubre los caminos de FF0.

### FF2 · Fugas y limpieza de listeners _(🔴/🟡)_ ⬜

- [AUTO] `UIEventBus.off()` por `originalHandler`; auto-cleanup.
- [AUTO] `EventBus.off()` automático en `orchestrator.disableDomain()`; `orchestrator.stop()` des-suscribe AppState. (#10)
- **Verificación:** habilitar/deshabilitar un dominio N veces no acumula listeners; `doctor` o un test detecta fugas.

### FF3 · Correctitud de primitivas _(🟡)_ ⬜

- [AUTO] `EntityCollection.equals` por contenido. (#8)
- [AUTO] Memoización por instancia en `@mapped`. (#11)
- [AUTO/ASSIST] Dedup global de eventos en EventBus.
- **Verificación:** tests de FF1 cubren igualdad por valor y no-recomputo de `@mapped`.

### FF4 · Base reutilizable (menos boilerplate) _(🟡)_ ⬜

- [ASSIST] `BaseRemoteRepository<T>` (SQLite+JSON, CRUD + remote state). (#12)
- [AUTO] `syncRemoteToLocal()` helper. (#13)
- [AUTO] `RepositoriesContainer` tipado (type guard `IRepository`).
- [ASSIST] `BaseOdooAdapter` + `IRemoteClient` formalizado. (#14)
- **Verificación:** migrar 1-2 repos al base sin cambiar comportamiento (tests verdes).

### FF5 · Migraciones versionadas + bootstrap robusto _(🔴/🟡)_ ⬜

- [ASSIST] Tabla de versiones de migración (nombre+timestamp+hash) + runner idempotente.
- [AUTO] try-catch + rollback en `Kernel.bootstrap()` y `restartDatabase()`.
- **Verificación:** una migración a mitad fallida no deja schema inconsistente; se puede saber el schema actual.

### FF6 · DX / observabilidad / config _(🟡/🟢)_ ⬜

- [ASSIST] `config.ts` central (intervals, timeouts, MAX_ATTEMPTS, TTLs) overridable por app.
- [AUTO] Logs con timestamp + contexto (`aggregateId`/`correlationId`); nivel configurable; hook de sink externo (Sentry-like) opcional.
- [AUTO] Mapa error-type→handler + docs en `errorHandler`.
- [AUTO] Guía "crear módulo / agregar evento" en `AGENTS.md`.
- **Verificación:** una app puede ajustar intervals/timeouts sin tocar el core; logs llevan correlación.

---

## Mapa a backlog existente

| Tarea                                                | Fase                                        |
| ---------------------------------------------------- | ------------------------------------------- |
| #8 EntityCollection.equals                           | FF3                                         |
| #9 publishMany transaccional                         | FF0                                         |
| #10 Robustez cola: fuga listeners + background drain | FF0/FF2                                     |
| #11 Memoización `@mapped`                            | FF3                                         |
| #12 BaseRemoteRepository<T>                          | FF4                                         |
| #13 syncRemoteToLocal()                              | FF4                                         |
| #14 BaseOdooAdapter + infra.http                     | FF4                                         |
| #16 Addon printer (driver) + IPrinterDriver          | (hecho — puerto en core, driver en tickets) |

## Definición de "done" por fase

1. `make verify-format` + `make doctor` verdes en el core (y consumidores si cambia la API).
2. Cambios con test que cubra el caso (desde FF1 en adelante).
3. Sin regresión en las apps (login, `ORDER_CREATED`→cola→worker, offline/online, switch de dominio).
4. Si cambia API pública del core: versión bumpeada + publicada + consumidores recableados.
