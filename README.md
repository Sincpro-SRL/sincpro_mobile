# @sincpro/mobile

Core del framework móvil Sincpro (React Native / Expo): infraestructura offline-first (DB, cola/eventos, cron), patrones DDD, adapters base, composición module-driven y el `AppShell`. Consume el design system `@sincpro/mobile-ui`.

## Instalación

```bash
npx expo install @sincpro/mobile @sincpro/mobile-ui
```

`@sincpro/mobile-ui` es peer dependency (lo provee la app). Para integrar Odoo: `@sincpro/mobile-odoo` (opcional).

## Instanciar una app

Una app define sus dominios como **clases que extienden `DomainModule`** y las compone con `createAppShell`:

```tsx
import { createAppShell, createTheme, DomainModule } from "@sincpro/mobile";
import type { Subscriber } from "@sincpro/mobile/domain/subscriber";

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
import { DomainModule } from "@sincpro/mobile/entrypoints/app/domain_module";
import type { Subscriber } from "@sincpro/mobile/domain/subscriber";
import { setPrinterDriver } from "@sincpro/mobile/domain/print";
```

## Impresora (opcional)

El core es agnóstico del hardware: define el puerto `IPrinterDriver` (`@sincpro/mobile/domain/print`). La app registra un driver concreto al bootstrap:

```ts
import { setPrinterDriver } from "@sincpro/mobile/domain/print";
setPrinterDriver(miDriver);
```

## Desarrollo

Todo vía Makefile: `make build` (tsc → `lib/`), `make check` (lint + typecheck), `make format`, `make publish`.
