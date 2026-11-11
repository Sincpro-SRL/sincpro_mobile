# AGENTS.md — Sincpro Mobile

Este archivo es idéntico en los cuatro repos del stack. Define la dirección del
próximo major: Expo SDK 58, sin implementaciones ni aliases de compatibilidad.

## Ecosistema y capas

Cada repo tiene su propio git y package.json; la fuente vive en el subfolder con
el nombre del repo. Los hosts consumen paquetes publicados en npm, nunca
`file:`, `link:`, tarballs o links locales.

| Paquete                  | Responsabilidad                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `@sincpro/mobile-ui`     | Design system presentacional, sin router ni dominios.                               |
| `@sincpro/mobile`        | DDD, infraestructura offline-first, bootstrap, providers y pantallas del framework. |
| `@sincpro/mobile-odoo`   | Integración Odoo opcional; servicios, sesión y pantallas reutilizables.             |
| `sincpro-mobile-tickets` | Host: rutas, navegación, identidad y composición del negocio.                       |

Dependencias: **apps → mobile-odoo opcional → mobile → mobile-ui**.
El core no conoce Odoo ni las apps. Imports entre capas por alias del paquete.

```text
domain/          entidades, puertos y eventos (DomainEvent de client-framework), sin React ni IO
adapters/        implementaciones de puertos: repositorios, el EventStore SQLite
infrastructure/ dependencies.ts + framework.ts del bounded context; DB, la cola guardada
                 (storedQueue), cron, logger y telemetría
services/       casos de uso por agregado: Features y ApplicationServices con decorador;
                 services/index.ts los importa y exporta el bounded context listo
framework/      DomainModule, createApp, kernel y composición
ui/             pantallas/componentes del framework
entrypoints/    cron/, db/, ui/: puertas que construyen Commands; la cola no tiene puertas propias
```

## Bounded contexts, casos de uso y la cola

Como sincpro_framework, con @sincpro/client-framework:

- Un bounded context se arma en `infrastructure/dependencies.ts` (`<X>Dependencies` y
  `registerDependencies`) y `infrastructure/framework.ts` (`servicesWith<…>()` y
  `<x>BoundedContext`). Se llama `<nombre>BoundedContext`, nunca `ctx` ni `bc`.
- Un Feature o ApplicationService hereda todas las dependencias: nunca `declare readonly`
  ni `serviceName`; su nombre es el de su clase. El host conserva los nombres de clase en
  producción (`keep_classnames: true` en `metro.config.js`).
- Registro con decorador, para uno o N DTO: `@xBoundedContext.feature([CommandX, EventoX])`.
  `services/index.ts` importa cada servicio y una librería lo declara en `sideEffects`.
- Registrar un caso de uso para un evento es la suscripción: no hay un suscriptor por evento.
  La cola tiene un solo `Subscriber`, armado con los bounded contexts de los módulos activos;
  un Command se toma de la cola solo si un módulo lo declara (`consumes()`).
- Un evento: `static eventName` con puntos (`<contexto>.<agregado>.vN.<hecho>`), `fromJSON`
  si lleva `Money`, `Decimal` o fechas, y `requiresNetwork`/`requiresSession` en su clase. Se
  entrega al menos una vez: el efecto se identifica por `this.execution.causationId` o por la
  entidad.
- Un caso de uso no importa UI ni loggers: avisa por un puerto (`Notifier`), escribe con
  `this.logger` y nunca atrapa una falla para esconderla. Cada error declara su tipo
  (`failureKind`): reintentar, apartar, reportar y lo que muestra una pantalla salen de ahí.
- Un cron ejecuta un Command; un workflow es un ApplicationService. La actividad
  ("procesando…") se escucha con `processListeners`, no desde la cola.

## Una sola dirección de UI

| Tema               | Contrato                                                                                |
| ------------------ | --------------------------------------------------------------------------------------- |
| Navegación         | Expo Router, rutas por archivos, Stack.Protected y NativeTabs.                          |
| Safe area          | react-native-safe-area-context; un dueño por borde.                                     |
| Teclado            | keyboard-controller: KeyboardAwareScrollView y KeyboardToolbar.                         |
| Barras del sistema | Un controlador en el host/AppShell: expo-status-bar + expo-system-ui.                   |
| Sheets y selección | Una sola Sheet sobre @expo/ui/community/bottom-sheet; controles Expo actuales.          |
| Iconos             | IconName semántico + ICON_MAP; SF Symbols en iOS y Material en Android/web.             |
| Listas crecientes  | FlashList v2; entidades originales y metadatos separados.                               |
| Medidas            | useWindowDimensions, nunca Dimensions.get.                                              |
| Rendimiento        | React Compiler y reglas actuales de eslint-plugin-react-hooks.                          |
| Estilos            | NativeWind estable compatible con el SDK probado; no migrar a RC sin verificar soporte. |

No importar `@react-navigation/*` directamente, montar NavigationContainer ni
mantener AppRoutes/navegadores propios. Si un navegador custom es necesario,
usar `integrateWithRouter`, nunca `withLayoutContext`.

Solo el host define rutas/hrefs y traduce callbacks a navegación. Las librerías
exportan pantallas con `onBack`/acciones, no conocen los nombres de ruta del host.
`app/` contiene únicamente archivos de ruta/layout; componentes, servicios,
contexts y tipos viven fuera.

## AppShell y sesión

AppShell recibe configuración de módulos, tema, fuentes y providers, y renderiza
`children` desde el layout raíz del host. No decide qué UI de dominio mostrar,
no monta un navegador y no aplica SafeAreaView global.

DomainModule conserva registros de repositorios, migraciones, bounded contexts
(`boundedContexts()`), los Commands que toma de la cola (`consumes()`) y crons. Un selector
de dominio emite callbacks; el mapa dominio → ruta es del host.

Separar restauración inicial de sesión de la carga de login/logout. Mantener
el Stack montado con rutas protegidas y una carga visible. Un fallo debe
registrarse y ofrecer recuperación, no producir una pantalla blanca.

Los providers/efectos que usan DB esperan al bootstrap. Un singleton nunca
resuelve repos en field-init; usar getters lazy:

```ts
private get repository() {
  return repos.get(EXRepository.PRODUCT);
}
```

## Bordes, teclado y overlays

- Con header propio, ese header reserva top; el Stack nativo no muestra otro.
- NativeTabs reserva bottom; no sumar otro inset inferior en el contenedor.
- En standalone/auth, reservar explícitamente los bordes sin otro dueño.
- Container/ScrollContainer usan laterales por defecto; AuthContainer coordina
  sus cuatro bordes, header y contenido.
- Respetar el ajuste nativo del primer ScrollView en NativeTabs iOS.
- Expo Router ya provee los insets web: no añadir otro SafeAreaProvider allí.
- Un solo scroll consciente del teclado por formulario. Toolbar para varios
  campos; input enfocado y CTA permanecen visibles.
- No usar KeyboardAvoidingView ni StatusBar de RN en componentes de UI.
- Modal de RN solo para contenido de pantalla completa, con atrás/insets
  verificados. Selección y edición van en controles Expo o la Sheet única.
- Guardar comunica éxito y cierra solo después de completar la operación.

## Tipos, eventos y dependencias

- Enums regulares, nunca const enum: Babel/Metro debe conservarlos en runtime.
- Eventos definidos en su contexto y exportados solo desde
  `domain/events/index.ts`; no duplicar sus exports en barrels de contexto.
- No clonar entidades para añadir metadatos de UI. Un clon por prototype/
  Object.assign pierde campos privados `#`; pasar siempre la instancia original.
- Refs nativos con TextInputInstance/ViewInstance/ScrollViewInstance. Sin opt-out
  react-native-legacy-deep-imports ni APIs/deep imports eliminados.
- Usar solo APIs Expo UI no deprecadas; RNHostView Android usa modifiers.
- Peers nativos acotados a lo probado y devDependencies alineadas. Expo UI,
  expo-symbols y FlashList son obligatorios cuando el catálogo los importa.
- Instalar paquetes nativos con `npx expo install`; la fuente de versiones es
  `node_modules/expo/bundledNativeModules.json`.
- Mantener NativeWind v4 con `^4.2.7` mientras v5 no tenga soporte SDK 58 probado.
- No ignorar warnings para presentar una migración como resuelta.

## Calidad y releases

Todo pasa por el Makefile: `make format` durante desarrollo, `make verify-format`
como gate, `make test` y `make build` en librerías. UI incluye types/stories y
prueba visual con `make storybook-android`. No modificar workflows de release.

Una modernización incompatible sale como major, sin shims ni exports viejos.
La versión la define el release; no editar version manualmente.
Integrar en orden UI → core → Odoo → host, verificando cada publicación con
`npm view <paquete> version` antes de actualizar el consumidor.

Tickets usa tema automático, expo-system-ui, React Compiler, typedRoutes,
web.output estático y scheme explícito. Probar deep links sin doble decoding
y Android release con R8 activo; nunca desactivar R8 para ocultar un fallo.

No declarar validada una pantalla, credencial, hardware o plataforma sin probarla.
Mantener documentación relacionada, tests y evidencia visual de cambios de UX.
Sin comentarios redundantes/código muerto; imitar estilos existentes.
No hardcodear tokens ni secretos. Usar variables de entorno/secrets del pipeline.
