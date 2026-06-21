# @sincpro/mobile

Core del **framework móvil Sincpro** (React Native / Expo): infraestructura offline-first (DB, cola/eventos, cron), patrones DDD, adapters base, composición **module-driven** y el `AppShell`. Consume el design system `@sincpro/mobile-ui`.

> 🤖 **¿Sos un agente de IA?** Leé primero [`AGENTS.md`](AGENTS.md) — orientación rápida del ecosistema, patrones y trampas. Si algo se comporta raro, [`docs/GOTCHAS.md`](docs/GOTCHAS.md).

## Filosofía

El objetivo es **generar apps móviles de negocio muy rápido** componiendo piezas estables, no escribir cada app desde cero. Principios:

- **Framework, no monolito.** Un ecosistema de paquetes publicables; cada app es delgada y declara solo sus dominios.
- **Module-driven + inversión de dependencia.** El core no conoce los negocios. Cada dominio es un `DomainModule` que la app registra; el `orchestrator` alimenta cola, repos, migraciones, cron y temas desde los módulos registrados. Agregar/mover un dominio no toca el core.
- **Offline-first.** SQLite + cola de eventos persistente (con DLQ y reintentos) + sincronización; la app funciona sin red y reconcilia al volver.
- **Hexagonal.** El dominio define puertos (`IPrinterDriver`, `IRepository`, `IRemoteClient`); los adapters concretos viven afuera y se inyectan. El core es agnóstico de hardware y de backend.
- **Frontera real verificable.** Capas con dirección estricta `apps → mobile-odoo → mobile → mobile-ui`; el design system no sabe de negocio; los enums/eventos tienen un punto único de export.

## Ecosistema

| Paquete                | Rol                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `@sincpro/mobile`      | Core: infra, patrones DDD, `framework/` (DomainModule, createApp, orchestrator), `AppShell` |
| `@sincpro/mobile-ui`   | Design system standalone (sin router, sin dominios)                                         |
| `@sincpro/mobile-odoo` | Integración Odoo **opcional** (OdooClient, auth, server, partner)                           |
| `sincpro-mobile-<app>` | Apps de negocio (tickets, distribution) que componen lo anterior                            |

## Instalación

```bash
npx expo install @sincpro/mobile @sincpro/mobile-ui
```

`@sincpro/mobile-ui` es peer dependency (lo provee la app). Para integrar Odoo: `@sincpro/mobile-odoo` (opcional).

## Instanciar una app

Una app define sus dominios como **clases que extienden `DomainModule`** y las compone con `createAppShell`:

```tsx
import { createAppShell, createTheme } from "@sincpro/mobile";
import { DomainModule } from "@sincpro/mobile/framework/domain_module";
import type { Subscriber } from "@sincpro/mobile/domain/event_sourcing";

class VentasModule extends DomainModule {
  readonly key = "VENTAS";
  readonly name = "Ventas";

  override subscribers(): Subscriber[] {
    return [];
  }
}

const ventasModule = new VentasModule();

export default createAppShell({
  theme: createTheme({ primary: "#0EA5E9" }),
  domains: [ventasModule],
  ui: { [ventasModule.key]: VentasScreen },
  activeDomain: ventasModule.key,
});
```

`createAppShell` arranca la infraestructura (migraciones, EventBus, cron, orchestrator), carga fuentes, aplica el tema (a `className` y `style`) y monta el `DomainSwitcher`.

## API pública

- `createAppShell(config)` — composition root de la app (theme, domains, ui, activeDomain, providers).
- `DomainModule` — clase base abstracta de un dominio (`key`, `name`, `shared?`, `repositories()`, `migrations()`, `subscribers()`, `crons()`, `persistOnReset()`).
- `createTheme(overrides?)` — theme tipado (defaults del framework + overrides parciales).
- `createApp(config)` / `Kernel` / `orchestrator` — capa baja de composición (bootstrap sin UI).
- `BaseModule` / `baseModule` — módulo común (COMMON) que el framework registra por defecto.
- `CommonProvider` / `useCommon` — estado común (debug, geo, timezone, actividad de cola/cron).
- `PlainLayout` / `TabNavigatorLayout` — layouts conectados a react-router.
- `installGlobalErrorHandler()` — handler global (errores de dominio → Alert).

## Subpaths

Las primitivas y capas se importan por subpath, p. ej.:

```ts
import { DomainModule } from "@sincpro/mobile/framework/domain_module";
import type { Subscriber } from "@sincpro/mobile/domain/event_sourcing";
import { setPrinterDriver } from "@sincpro/mobile/domain/print";
```

## Impresora (opcional)

El core es agnóstico del hardware: define el puerto `IPrinterDriver` (`@sincpro/mobile/domain/print`). La app registra un driver concreto al bootstrap (vía `printerService.setDriver(...)`); si no registra ninguno, el driver Noop degrada con un warning.

## Desarrollo

Todo vía Makefile. Dos comandos de calidad: `make format` (auto-fix: eslint --fix + prettier + typecheck) y `make verify-format` (gate de CI: corre `format` y falla si quedó algo sin formatear/commitear — cubre lint + formato + tipos). Además `make build` (tsc + tsc-alias → `dist/`) y `make publish`. Detalle del workflow y guardrails en [`AGENTS.md`](AGENTS.md).
