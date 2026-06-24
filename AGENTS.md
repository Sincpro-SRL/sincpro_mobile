# AGENTS.md — Guía para agentes de IA (Sincpro Mobile)

> **Lee esto primero.** Este archivo es **idéntico en todos los repos `sincpro_mobile*`**.
> Está escrito para que un agente entienda el ecosistema, los patrones y las trampas en **una sola lectura**.
> Si vas a editar código, sigue [Patrones](#patrones) y [Convenciones](#convenciones), y verifica con `make verify-format`.

## Orientación en 30 segundos

- Es un **framework móvil** (React Native / Expo) repartido en un **ecosistema de paquetes npm**, no un monolito.
- Arquitectura: **DDD + Hexagonal + Event-Driven + offline-first** (SQLite). Composición **module-driven**: cada negocio es un `DomainModule`; la app los compone con `createAppShell`.
- Cada repo es **independiente** (su propio git, su propio `package.json`). Las apps consumen los paquetes del framework **desde el registry de npm**, no por links locales.
- El código fuente vive en un subfolder con el nombre del repo (ej. `sincpro_mobile/`, `sincpro_mobile_distribution/`); el `package.json` y configs están en la **raíz**.
- Imports siempre por **alias de paquete** (`@sincpro/mobile/...`), nunca rutas relativas largas al cruzar capas.

## Mapa del ecosistema

| Paquete (npm)                 | Alias import                     | Rol                                                                                                                                                                                                  | Publicado |
| ----------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `@sincpro/mobile`             | `@sincpro/mobile/*`              | **Core**: infra (DB, cola/eventos, cron), patrones DDD, adapters base, `framework/` (DomainModule, createApp, orchestrator, kernel), `AppShell`, y un `ui/` propio (screens/components de framework) | `0.1.1`   |
| `@sincpro/mobile-ui`          | `@sincpro/mobile-ui/*`           | **Design system** standalone (Typography, Display, Form, Dialog, Feedback, views, widgets, icons, theme, layouts). Sin router, sin dominios.                                                         | `0.2.1`   |
| `@sincpro/mobile-odoo`        | `@sincpro/mobile-odoo/*`         | Integración **Odoo opcional**: `OdooClient`, auth, server, res.partner, pantallas de login/perfil/portal.                                                                                            | `0.1.0`   |
| `sincpro-mobile-tickets`      | `@sincpro/mobile-tickets/*`      | **App** de negocio (host). Tiene impresora.                                                                                                                                                          | privado   |
| `sincpro-mobile-distribution` | `@sincpro/mobile-distribution/*` | **App** de negocio (host): ventas, facturación, rutas. **Sin impresora**.                                                                                                                            | privado   |

**Dirección de dependencias (estricta):** `apps → (mobile-odoo) → mobile → mobile-ui`.
El core **no** conoce las apps ni Odoo; el design system **no** conoce nada de negocio.

## Capas del core (`@sincpro/mobile`)

```
domain/         primitivas DDD puras (sin React, sin IO)
  entity/         Entity, RemoteEntity, ValueObject, EntityCollection
  event_sourcing/ DomainEvent (base), EEventStatus, Subscriber, eventos de cola
  events.ts       PUNTO ÚNICO de re-export de TODOS los eventos del dominio
  database/       IRepository, IRemoteRepository, IDatabase, IMigration
  repositories.ts ECommonRepository (enum catálogo de repos)
  connectivity/   network, bluetooth, geo + sus eventos (InternetIsUp/Down)
  print/ webview/ puertos + eventos de cada contexto
adapters/       implementaciones de puertos (Network, Geo, Bluetooth, Receipt, JsonSerializer, repos)
infrastructure/ DB connector, EventBus (cola persistente + DLQ + retry), CronWorker, UIEventBus, logger
framework/      DomainModule, createApp, kernel, orchestrator (composición module-driven)
services/       casos de uso del framework
ui/             screens/components del framework (events, database, dead-letter) + ProcessToast
entrypoints/    db (RepositoriesContainer, repos), queue, ui (AppShell, CommonProvider)
```

Regla de capas: `domain` no importa de `infrastructure`/`ui`; `ui` no importa de dominios de negocio. **Adapters ≠ infrastructure.**

## Patrones

### 1. Composición de app (composition root)

Cada app tiene `entrypoints/main.tsx` que define su `DomainModule` y llama a `createAppShell`:

```tsx
export class XModule extends DomainModule {
  readonly key = "X";
  readonly name = "X";
  override repositories(): Record<string, object> {
    return XRepositoryRegistry;
  }
  override migrations(): IMigration[] {
    return XMigrations;
  }
  override subscribers(): Subscriber[] {
    return XSubscribers;
  }
  override crons(): CronWorker[] {
    return XCronJobs;
  }
}
export function createXApp(): ComponentType {
  return createAppShell({
    theme: createTheme(X_THEME),
    domains: [odooModule, xModule], // Odoo es opcional: no lo pases si no lo usás
    ui: { [xModule.key]: XApp },
    activeDomain: xModule.key,
    providers: [ConfirmationProvider, ProcessToastProvider],
  });
}
```

### 2. Repos: registro en runtime → **getters lazy, NUNCA field-init** 🔴

Los repositorios se registran en `bootstrap()` (runtime), DESPUÉS de que los módulos se importan. Por eso un service singleton **no puede** resolver repos en la inicialización de campos:

```ts
// ❌ ROMPE al arrancar ("Repository not found"): corre en import, antes de bootstrap()
private readonly repository = repos.get(EXRepository.PRODUCT);

// ✅ getter lazy: resuelve en el primer uso, después de bootstrap()
private get repository() { return repos.get(EXRepository.PRODUCT); }
```

Esto **no lo detecta el typecheck** — solo se ve al arrancar la app. Ver [GOTCHAS](docs/GOTCHAS.md).

### 3. Eventos: `domain/events.ts` es el punto único de export

Un evento **vive** en su contexto (`connectivity/events.ts`, `print/events.ts`…) pero se **exporta** solo vía `domain/events.ts`. Los barrels de contexto **no** re-exportan sus eventos (colisión de `export *` → TypeScript los elimina del barrel raíz en silencio). Evento nuevo → archivo en su contexto + `export *` en `domain/events.ts` + NO exportarlo desde el barrel del contexto.

### 4. Build & distribución

`tsc → dist/` + `tsc-alias` (reescribe alias `@/...` a relativo). El `package.json` usa el campo **`exports`** para mapear subpaths a `./dist/*`. Los paquetes del framework son **`peerDependencies`** en libs (una sola copia en la app, evita duplicar identidad de tipos) + `devDependencies` para build local.

### 5. Las apps consumen del **registry**, no `file:`

Apps host declaran `@sincpro/mobile*` con su versión publicada en `dependencies` **y** `resolutions` (yarn). Nada de `file:../...` (rompe CI y duplica copias). Ver [GOTCHAS](docs/GOTCHAS.md).

### 6. Enums: usa `enum` regular, **no `const enum`** 🔴

`const enum` no sobrevive a Babel/Metro entre módulos → valores `undefined` en runtime (rutas en blanco, etc.). Siempre `enum` regular. Aplica también a los enums que el core publica.

## Guardrails (workflow obligatorio)

Todo pasa por el **Makefile**. A propósito hay **solo dos comandos de calidad** (no `check`/`lint`/`format-check` sueltos — el CI/CD está atado a estos dos):

| Comando                       | Qué hace                                                                                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `make format`                 | **Dev (mutante)**: `eslint --fix` (incluye orden de imports) + `prettier --write` + `typecheck`. Auto-arregla todo. Corré esto mientras trabajás.                |
| `make verify-format`          | **Gate de CI**: corre `format` y **falla si quedó algo sin formatear/commitear**. En un solo comando cubre lint + formato + tipos. Es lo que valida el pipeline. |
| `make build`                  | `tsc -p tsconfig.build.json` + `tsc-alias` → `dist/` (solo libs)                                                                                                 |
| `make android` / `make start` | correr la app (solo apps)                                                                                                                                        |

`lint` y `typecheck` están **plegados dentro de `format`** — no hay targets sueltos para ellos. Antes de dar algo por terminado: `make verify-format`. **`tsc 0 errores` NO garantiza que arranque** — ver patrón #2 y #6.

## Enfoque basado en agentes (dev + CI/CD)

Para cambios grandes (migraciones, refactors masivos, auditorías) se usa **orquestación multi-agente** (estilo "fork"): el agente principal hace el setup secuencial (scaffold, copia, remapeo mecánico) **inline**, y luego **fan-out** de un sub-agente por unidad de trabajo (archivo/subdominio) en paralelo, seguido de un `make verify-format`. Ejemplo real: la migración de `distribution` (287 archivos) bajó de 385→0 errores combinando remapeo mecánico inline + 11 agentes en paralelo arreglando tipos por archivo. El mismo patrón aplica en CI/CD para validar/arreglar a escala.

## Convenciones

- **Sin comentarios ni docstrings** en el código (salvo que el archivo ya tenga ese estilo). Sin código muerto.
- Imitá el estilo del código circundante (naming, densidad, idioms).
- `prettier` printWidth 94; orden de imports por `simple-import-sort` (lo aplica `make format`).
- No hardcodees tokens/secrets: los repos son **públicos**; usá `$NPM_TOKEN` / `secrets.NPM_TOKEN`.

## Para profundizar

- [`docs/GOTCHAS.md`](docs/GOTCHAS.md) — trampas de dependencias, UI y runtime (síntoma → causa → fix). **Léelo si algo "raro" pasa.**
- [`docs/UI_ROUTER_ROADMAP.md`](docs/UI_ROUTER_ROADMAP.md) — plan progresivo de UI, router, layouts, system-UI, Expo.
- [`docs/FRAMEWORK_ROADMAP.md`](docs/FRAMEWORK_ROADMAP.md) — plan progresivo de la **plataforma core** (infra, primitivas DDD, cola/eventos, repos base, composición, tests). Si vas a mejorar el framework, elegí una fase (FF0-FF6) de acá.
- `README.md` — visión de producto y filosofía.
