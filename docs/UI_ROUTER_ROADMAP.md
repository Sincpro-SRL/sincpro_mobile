# Plan Maestro Progresivo — UI, Router, Layouts, System UI & Plataforma

> **Propósito.** Hoja de ruta para mejorar la UI, navegación, layouts, system-UI nativo y la plataforma
> (Expo) del ecosistema `sincpro_mobile*`, **sin romper lo que ya funciona** y de forma **progresiva y
> automatizable**. Escrito para que un agente de IA lo lea, elija una fase y la ejecute con verificación.
>
> Convención: cada tarea trae **[AUTO]** (un agente puede ejecutarla solo, con `make verify-format` como gate)
> o **[ASSIST]** (requiere decisión humana: device testing, release, credenciales). Estado: ⬜ pendiente · 🟡 en curso · ✅ hecho.
> Este archivo es **idéntico en todos los repos** (igual que `AGENTS.md`/`GOTCHAS.md`); editá el del core y propagá.

---

## Estado actual (baseline — 2026-06)

| Dimensión         | Hoy                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Expo / RN / React | `~54.0.35` / `0.81.5` / `19.1.0`                                                                                                                                                           |
| Router            | `react-router-native@^6.30.0` (`NativeRouter`, sin future flags v7)                                                                                                                        |
| Animación         | `reanimated@~4.1.1` + `react-native-worklets@0.5.1`                                                                                                                                        |
| Estilos           | NativeWind 4 + tailwind-variants; tokens por CSS vars + `createTheme`                                                                                                                      |
| Design system     | `@sincpro/mobile-ui` standalone (~120 archivos): primitives(5) Typography(3) Display(11) Form(20) Dialog(6) Feedback(8) Navigation(6) views(11) widgets(10) layouts(6) icons(25) theme(12) |
| Layouts router    | presentacionales en `mobile-ui/layouts`; router-aware en `mobile/ui/layouts/router_layouts` (inyectan `<Outlet/>`)                                                                         |
| System UI nativo  | `expo-system-ui` **NO instalado** → `userInterfaceStyle` no controlable (warning de prebuild); sin dark mode real                                                                          |
| Branding          | por props (`logoSource`/`source`); el `EDomain` del monolito ya no existe                                                                                                                  |

**Dolores conocidos** (ver `docs/GOTCHAS.md`): layouts sin `<Outlet/>`, branding por props olvidado, `const enum`, future-flags de router sin activar, doble splash (nativo + JS), sin dark mode.

---

## Áreas de mejora (separadas)

### A1 · Design System (componentes)

- **Inconsistencia de branding**: `Display.Logo`/`FormViewV2.Header`/`HomeHeader` devuelven vacío sin `source`. → introducir un **`LogoProvider`/contexto de branding** en `mobile-ui` para que el logo del app se configure una vez (en `createAppShell`) y los componentes lo tomen por contexto, en vez de prop-drilling en cada pantalla.
- **Cobertura/calidad**: auditar los ~120 componentes — props tipadas, estados (loading/empty/error/disabled), accesibilidad (a11y labels, hitSlop, contraste), RTL.
- **Componentes nuevos candidatos**: `Skeleton`/`Shimmer`, `EmptyState` genérico, `Toast` unificado, `BottomSheet` estandarizado, `Avatar`, `Chip/Tag`, `SegmentedControl`, `Stepper`, `Snackbar`, `Pull-to-refresh` consistente.
- **Storybook como contrato**: cada componente con story; stories = fuente de verdad visual + base para visual-regression.

### A2 · Router & navegación

- **Activar future flags v7** (`v7_startTransition`, `v7_relativeSplatPath`) para preparar el salto a router v7 y silenciar warnings.
- **Tipado de rutas**: hoy `AppScreen` es un enum de strings sueltos; falta tipado de params de navegación. → un helper `createRouter(screens)` tipado en el core que valide paths y params en compile-time.
- **Guard de auth centralizado**: cada app reimplementa el `useEffect`/`navigate(LOGIN)`. → mover a un `<AuthGuard>` / `<ProtectedRoutes>` reutilizable en el core (consume el orchestrator auth state).
- **Evaluar `react-navigation` vs `react-router-native`**: decidir si el framework se queda en router-native (web-like) o migra a react-navigation (estándar RN, deep-linking, gestos nativos). Decisión arquitectónica de alto impacto → documentar trade-offs antes.

### A3 · Layouts

- **Unificar el split presentacional/router**: hoy hay dos `PlainLayout`/`TabNavigatorLayout` (ui presentacional vs core router-aware) — fuente de bugs (el blanco de distribution). → que el core sea el **único** punto de import de layouts de ruta, y `mobile-ui` exponga solo las piezas visuales (TabBar, Header) sin pretender ser route elements.
- **Layouts faltantes**: `StackLayout` (push/pop con header back automático), `ModalLayout`, `DrawerLayout`, `SafeAreaLayout` consistente (edge-to-edge Android 15).
- **Header como sistema**: `ScreenHeader`/`FormViewV2.Header` con variantes claras y branding por contexto (ver A1).

### A4 · System UI nativo

- **Instalar `expo-system-ui`** en las apps → habilita `userInterfaceStyle`, color de barra de navegación, background root.
- **Dark mode real**: tema oscuro en tokens (`createTheme` ya es multi-tema); `useColorScheme` + variante dark de CSS vars; NativeWind `dark:`.
- **Status bar / edge-to-edge**: `expo-status-bar` consistente por pantalla; Android 15 edge-to-edge obligatorio en SDK nuevos.
- **Splash unificado**: hoy hay doble splash (nativo Expo + `DomainSplashScreen` JS). → decidir uno; si se mantiene el JS, que el nativo sea solo color sólido + logo y el JS tome el relevo sin parpadeo.

### A5 · Plataforma / Expo upgrade

- **Subir a la última SDK de Expo** (proceso gestionado, no bump manual): `npx expo install expo@latest && npx expo install --fix`, seguir el upgrade guide, regenerar `expo prebuild --clean`. Validar reanimated/worklets/nativewind alineados a la SDK.
- **Orden de upgrade**: primero las **libs** (`mobile`, `mobile-ui`, `mobile-odoo` — alinear peerDeps a la nueva RN/React), luego las **apps**. Publicar libs (minor bump) y recablear apps.
- **New Architecture**: ya `newArchEnabled: true`; verificar que todas las deps nativas la soporten en la SDK nueva.

### A6 · Arquitectura & compartición entre repos

- **Config compartida**: hoy `eslint.config.js`, `tsconfig`, `babel`, `metro`, `Makefile`, `app.json` se copian a mano entre repos y divergen (ej. ui aún tiene `check`/`verify`). → extraer a un paquete `@sincpro/mobile-config` (presets de eslint/tsconfig/babel/tailwind) que cada repo extienda. Una sola fuente de verdad.
- **Docs compartidas**: `AGENTS.md`/`GOTCHAS.md`/este roadmap se copian manualmente. → script `make sync-docs` (o un paquete) que los propague desde el core.
- **Scaffolding**: `make create-app` y `make create-domain` con plantillas (incluyendo el cableado correcto de layouts router-aware + branding + assets) para que una app nueva nazca sin los gotchas.
- **Versionado coordinado**: las apps fijan versiones exactas en `dependencies`+`resolutions`; definir política (rangos `^` vs pin) y un `make bump-framework VERSION=x.y.z` que actualice los 3 paquetes en todos los consumidores.

### A7 · Automatización & CI/CD

- **CI por repo**: `make verify-format` en cada push (ya es el gate); agregar build de Expo (EAS) en PRs.
- **Visual regression** sobre Storybook (Chromatic/Loki) para que cambios de UI no rompan pantallas.
- **Dependabot/renovate** para deps; un `make doctor` que detecte los gotchas (const enum, layouts mal importados, `repos.get` eager, branding sin source) de forma estática → corre en CI.
- **Codegen**: generar el barrel de iconos, el mapa de rutas tipado y los tokens de tema desde una fuente única.

---

## Plan maestro progresivo (fases)

> Orden por **ratio valor/riesgo** y dependencias. Cada fase deja el ecosistema verde (`make verify-format`) y es
> independientemente releasable. Las **[AUTO]** se pueden encadenar por un agente; las **[ASSIST]** abren con una decisión.

### F0 · Higiene y red de seguridad _(habilita todo lo demás)_ ✅

- [AUTO] ✅ `make doctor` (`scripts/doctor.sh`): detecta los 4 gotchas (const enum, layout presentacional como route element, `repos.get` en field-init, logo/header con variante de logo sin `source`). Propagado a los 5 repos y cableado en `verify-format` (corre en el gate de CI). Probado: limpio en los 5, caza un gotcha sembrado (exit 1).
- [AUTO] ✅ Future flags de router v7 (`v7_startTransition`, `v7_relativeSplatPath`) en el `NativeRouter` del core (`AppShell.tsx`). _(Llega a las apps al republicar el core.)_
- [AUTO] 🟡 Makefile de `mobile-ui`: el usuario ya quitó `check`/`verify`/`format-check`; queda solo un `lint` standalone cosmético.
- **Verificación:** ✅ `make doctor` falla ante un gotcha sembrado; los 5 repos verdes con doctor.

### F1 · System UI + Dark mode _(alto impacto visible, bajo riesgo)_ 🟡

- [AUTO] ✅ `DEFAULT_DARK_THEME` en `mobile-ui` (`theme/dark.ts`, exportado): variante oscura sensata (slate-900/800/700 + acentos de marca), punto de partida ajustable por app vía `createTheme`. ui verde + built.
- [ASSIST] ⬜ Instalar `expo-system-ui` en las apps (`npx expo install expo-system-ui`), set `userInterfaceStyle`.
- [AUTO] ⬜ `useColorScheme` en el AppShell para alternar `DEFAULT_THEME`/`DEFAULT_DARK_THEME` + CSS vars `:root.dark`; `expo-status-bar` consistente; edge-to-edge SafeAreaLayout. _(Se hace tras instalar system-ui + para verificar en device.)_
- **Verificación:** toggle light/dark cambia toda la UI; prebuild sin el warning de `userInterfaceStyle`.

### F2 · Branding por contexto _(elimina una clase entera de bugs)_ 🟡

- [AUTO] ✅ Branding singleton en `mobile-ui` (`branding.ts`: `setBranding({logo})`/`getBrandingLogo()`), patrón igual al theme (`setActiveTheme`). Exportado del índice.
- [AUTO] ✅ `Display.Logo` usa `source ?? getBrandingLogo()` como fallback. Como `ScreenHeader`→`Navigation.Header`→`Display.Logo` y `HomeHeader`→`Display.Logo` funnelean por ese primitivo, **todos los headers/login/home heredan el branding** con un solo punto de cambio. Aditivo: la prop explícita sigue ganando (backward-compatible).
- [AUTO] ✅ `createAppShell({ branding: { logo } })` llama `setBranding` (junto a `setActiveTheme`). ui+core verdes, built, doctor OK.
- [ASSIST] ⬜ **Pendiente republish**: publicar `mobile-ui` (0.2.2) + `mobile` (0.1.2); luego en cada app `createAppShell({ branding: { logo: require(".../logo.png") } })` y **quitar** los `logoSource=`/`require` repetidos de las pantallas.
- **Verificación:** tras adoptar, quitar todos los `logoSource=` y el logo sigue en login/perfil/ruta/caja/home.

### F3 · Layouts unificados _(arregla la raíz del blanco)_ ⬜

- [AUTO] El core es el único origin de layouts de ruta; `mobile-ui` expone solo piezas visuales (TabBar/Header) no-route. Deprecate los `mobile-ui/layouts/PlainLayout|TabNavigatorLayout` como route elements.
- [AUTO] Agregar `StackLayout`/`ModalLayout`/`SafeAreaLayout` router-aware en el core.
- **Verificación:** `make doctor` prohíbe importar layout presentacional como route element; apps verdes y navegando.

### F4 · Router tipado + AuthGuard _(DX + menos boilerplate)_ ⬜

- [AUTO] `createRouter(screens)` tipado en el core (paths + params en compile-time).
- [AUTO] `<ProtectedRoutes>`/`<AuthGuard>` reutilizable que consume el orchestrator auth; las apps borran su `useEffect` de redirect.
- **Verificación:** navegar con param mal tipado falla en `tsc`; login/redirect funciona sin código por-app.

### F5 · Config compartida + scaffolding _(escala el ecosistema)_ ⬜

- [AUTO] `@sincpro/mobile-config` (presets eslint/tsconfig/babel/tailwind); cada repo extiende. Elimina la divergencia.
- [AUTO] `make sync-docs` propaga AGENTS/GOTCHAS/este roadmap desde el core.
- [ASSIST] `make create-app`/`create-domain` con plantillas que ya traen layouts/branding/assets correctos.
- **Verificación:** una app nueva scaffoldeada arranca y pasa `make verify-format` sin tocar gotchas.

### F6 · Expo SDK latest _(plataforma al día — hacer al final, es disruptivo)_ ⬜

- [ASSIST] Upgrade gestionado: libs primero (alinear peerDeps), publicar, luego apps; `expo install --fix` + `prebuild --clean`.
- [AUTO] Ajustar breaking changes detectados por `tsc`/runtime; alinear reanimated/worklets/nativewind.
- **Verificación:** las 2 apps arrancan en device, flujos críticos OK (login, cola→worker, navegación, dark mode).

### F7 · Calidad continua _(blindaje)_ ⬜

- [ASSIST] CI con EAS build en PRs; visual-regression sobre Storybook.
- [AUTO] Renovate + `make doctor` en CI; cobertura de stories por componente.

---

## Componentes: mejorar actuales + nuevos

**Mejorar actuales:** `Display.Logo` (contexto), `FormViewV2.Header`/`ScreenHeader` (variantes + branding contexto), `TabNavigatorLayout` (consolidar router-aware), `DomainSplashScreen` (coordinar con splash nativo, evitar doble), `Feedback` (Toast/Snackbar unificado), `Form.*` (a11y + estados).

**Nuevos que ayudan:** `Skeleton`, `EmptyState`, `Avatar`, `Chip`, `SegmentedControl`, `Stepper`, `BottomSheet` estándar, `StackLayout`/`ModalLayout`/`DrawerLayout`, `BrandingProvider`, `ThemeToggle`, `createRouter` tipado, `AuthGuard`.

## Handoff — qué necesita al usuario para desbloquear lo que sigue

Lo hecho autónomamente (F0 + F2 source + F1 dark tokens) es **aditivo y backward-compatible**: los 5 repos quedan verdes (`tsc` + `make doctor`) y las apps siguen funcionando con su código actual. Para que el branding y el dark mode lleguen a las apps falta **acción del usuario** (token de npm + device):

1. **Republicar libs** (con tu `NPM_TOKEN`): `mobile-ui` → `0.2.2` (trae `branding` + `DEFAULT_DARK_THEME`), `mobile` → `0.1.2` (trae `createAppShell({ branding })` + future-flags router). `make update-version VERSION=… && make publish` en cada una.
2. **Recablear las apps** a las versiones nuevas (deps + `resolutions`), `yarn install`.
3. **Adoptar branding (F2)**: en cada `entrypoints/main.tsx` → `createAppShell({ branding: { logo: require("../../../assets/<APP>/logo.png") }, … })`, y **borrar** los `logoSource=`/`require(...logo.png)` repetidos de las pantallas (login, perfil, ruta, caja, recibo, HomeHeader). `make doctor` confirma que no quede ninguno mal.
4. **System UI (F1)**: `npx expo install expo-system-ui` en las apps; luego cableo `useColorScheme` + dark vars en el AppShell (verificable en device).
5. **Expo upgrade (F6)** y **config package (F5)**: decisiones arquitectónicas — mejor en sesión interactiva.

> Las fases [AUTO] restantes (F1 useColorScheme, F3 deprecación de layouts, F4 router tipado) dependen de los pasos 1-2 (republish) o de verificación en device; conviene hacerlas tras el republish.

## Definición de "done" por fase

1. `make verify-format` verde en los repos afectados.
2. Sin nuevas entradas de `docs/GOTCHAS.md` introducidas (y si se descubre una, se documenta).
3. Flujos críticos no regresan (login, cola/eventos, navegación, impresión en tickets).
4. Si toca libs: versión bumpeada + publicada + consumidores recableados.
