# GOTCHAS — Trampas conocidas (Sincpro Mobile)

> Cada entrada es **síntoma → causa → fix**. Son cosas que **ya nos pasaron** y que el typecheck
> muchas veces **no** detecta. Si ves un comportamiento raro, busca el síntoma acá antes de investigar de cero.
> Las marcadas 🔴 rompen en **runtime** (no en compilación).

---

## Runtime (no los atrapa `tsc`)

### 🔴 Pantalla en blanco / rutas que no matchean → `const enum`

- **Síntoma:** la app arranca, pasa el splash, pero queda en blanco; las rutas parecen no funcionar.
- **Causa:** un `const enum` (típicamente `AppScreen`) cuyos miembros se inicializan desde otro enum (`LOGIN = OdooScreen.LOGIN`). Babel/Metro **no inlinea `const enum` entre módulos** (con `isolatedModules`), así que en runtime los valores quedan `undefined` → `<Route path={undefined}>` no matchea → blanco.
- **Fix:** usar `enum` regular, nunca `const enum`. Convertí todos: `grep -rl "const enum" .` → cambiá `const enum`→`enum`. Aplica también a enums que un paquete **publica** y otro **consume** (el `.d.ts` declara `const enum` pero el `.js` lo inlineó/eliminó → el consumidor lo ve `undefined`).

### 🔴 "RepositoryFacade: Repository not found" al arrancar → `repos.get()` eager

- **Síntoma:** crash al iniciar, repos no encontrados.
- **Causa:** un service singleton resuelve repos en field-init (`private readonly x = repos.get(...)`), que corre al **importar** el módulo, **antes** de que `bootstrap()` registre los repos.
- **Fix:** getter lazy → `private get x() { return repos.get(...); }`. (En la migración de distribution fueron 28 sitios.)

### Eventos que "desaparecen" del barrel `@sincpro/mobile/domain`

- **Síntoma:** un evento existe pero no se puede importar desde el barrel raíz del dominio.
- **Causa:** se re-exporta el mismo símbolo por dos `export *` (su barrel de contexto **y** `domain/events.ts`). TypeScript lo elimina del barrel raíz en silencio.
- **Fix:** un evento se exporta por **una sola ruta**: `domain/events.ts`. Los barrels de contexto no re-exportan sus eventos.

---

## Dependencias / packaging

### 🔴 CI falla: `Package "" refers to a non-existing file '.../sincpro_mobile_ui'`

- **Síntoma:** `yarn install` rompe en CI (no local).
- **Causa:** una dependencia `@sincpro/...` declarada como `file:../sincpro_mobile_ui`. Funciona local (carpetas hermanas) pero en CI el repo se clona **solo** → la ruta no existe.
- **Fix:** las apps consumen del **registry** (versión publicada) en `dependencies` y en `resolutions`. Nada de `file:` en repos que corren CI.

### 🔴 `OdooModule is not assignable to DomainModule` (tipos idénticos que no matchean)

- **Síntoma:** error de tipos entre paquetes con tipos que deberían ser el mismo.
- **Causa:** **dos copias físicas** de `@sincpro/mobile` en el árbol (ej. yarn1 con `file:` copia el `node_modules` anidado de la dep). TypeScript trata cada copia como identidades distintas.
- **Fix:** una sola copia. Consumir del registry + `peerDependencies` (la app provee la única instancia). Si quedó una copia anidada: borrarla (`rm -rf node_modules/@sincpro/mobile-odoo/node_modules/@sincpro/mobile`).

### Deep import a un subpath de **directorio** no resuelve

- **Síntoma:** `Cannot find module '@sincpro/mobile/domain/entity'` en un consumidor, aunque el archivo existe.
- **Causa:** el `exports` con wildcard `"./*": "./dist/*.js"` cubre subpaths de **archivo**, no de **directorio-index**.
- **Fix:** agregá una entrada explícita por cada barrel de directorio: `"./domain/entity": "./dist/domain/entity/index.js"`.

### Falta un paquete transitivo en una app que usa `file:`

- **Síntoma:** `Cannot find module 'clsx'` (u otro) en runtime, aunque el lib lo tiene.
- **Causa:** un link `file:` no instala las deps transitivas del lib.
- **Fix:** declarar la dep faltante en la app, o (mejor) consumir del registry.

---

## UI / Expo / build nativo

### NativeWind: estilos `className` no se aplican (render sin estilos)

- **Síntoma:** la UI renderiza pero sin estilos de Tailwind.
- **Causa:** falta `jsxImportSource: "nativewind"` → se usa `react/jsx-runtime` en vez de `nativewind/jsx-runtime`.
- **Fix:** en `tsconfig` `"jsxImportSource": "nativewind"`; en `babel.config.js` `["babel-preset-expo", { jsxImportSource: "nativewind" }]` + `"nativewind/babel"`. El lib debe compilarse con `jsxImportSource: nativewind` en `tsconfig.build.json`.

### Icono/splash nativos no cambian aunque `app.json` esté bien

- **Síntoma:** la app muestra el icono/splash por defecto de Expo.
- **Causa:** existe un `android/` (o `ios/`) **prebuildeado stale**; los recursos nativos se hornean en `prebuild` y no se actualizan al editar `app.json`.
- **Fix:** `npx expo prebuild --clean -p android` (regenera). Verificá `android/app/src/main/res/values/colors.xml` (splash bg) y los mipmaps.

### Icono adaptativo Android se ve "raro" (doble círculo / recortado / diminuto)

- **Síntoma:** el icono se ve mal enmascarado.
- **Causa:** `adaptiveIcon.foregroundImage` apunta a un icono full-bleed (con su propio fondo). Android le agrega su `backgroundColor` + máscara → doble fondo / recorte.
- **Fix:** el foreground debe ser **transparente** con el glifo centrado dentro de la safe-zone (~58–66%). Generar con Pillow/sips un PNG 1024 transparente con el logo centrado; `backgroundColor` sólido aparte.

### Pantalla en blanco tras el splash (fonts / layouts)

- **Síntoma:** blanco después del splash.
- **Causas posibles:** (a) fuentes no cargadas → usar `useAppFonts()` + `SplashScreen` en el AppShell; (b) layouts de router sin `<Outlet/>` al volverlos standalone. (Ver también el `const enum` arriba, que es la causa más común tras una migración.)

---

## Lint / tooling

### ESLint marca `import/export` falso en barrels solo-tipos (rojo en VSCode)

- **Síntoma:** `No named exports found in module '@sincpro/mobile/domain/connectivity'` sobre barrels que solo re-exportan `interface`/`type`. `tsc` está verde.
- **Causa:** `eslint-plugin-import` con el resolver de Node por defecto no entiende `paths` ni re-exports de tipo.
- **Fix:** configurar el resolver TypeScript en `eslint.config.js`:
  ```js
  settings: { "import/resolver": { typescript: { project: "./tsconfig.json" } } }
  ```

### `make format` / pre-commit crashea: "ESLint couldn't find an eslint.config file"

- **Síntoma:** `make verify-format`/`format` falla con error de config de ESLint.
- **Causa:** el repo (típicamente una app) no tiene `eslint.config.js` ni los plugins instalados, pero el Makefile corre `eslint .`.
- **Fix:** agregar `eslint.config.js` (igual que las libs: `eslint-config-expo/flat` + prettier + simple-import-sort + resolver TS) y las devDeps de eslint.

### `@mapped` u otros decoradores: TS1241

- **Síntoma:** "Unable to resolve signature of method decorator".
- **Causa:** falta `experimentalDecorators`.
- **Fix:** en `tsconfig.json` → `"experimentalDecorators": true, "emitDecoratorMetadata": true`.

---

## Drift de API entre paquetes

### Props que ya no existen (ej. `EventTimelineItem` ya no acepta `formatDate`)

- **Síntoma:** TS2322 al pasar una prop a un componente del core/ui.
- **Causa:** el componente cambió su API en una versión nueva del paquete; el código consumidor quedó atrás.
- **Fix:** alinear con el `.d.ts` instalado (`node_modules/@sincpro/mobile*/dist/**/*.d.ts`); quitar/renombrar la prop. Al migrar código viejo, esperar varios de estos.
