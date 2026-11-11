# Migración a `@sincpro/mobile` 2.0

2.0 acompaña a `@sincpro/mobile-ui` 4.0. Corrige la lentitud y los congelamientos de 1.x:
overlays por fila, `Pressable` de RN con `className`, listas que se repintaban enteras,
trabajo en segundo plano innecesario y un log de eventos que crecía sin límite.

## Requisito

`@sincpro/mobile-ui` `^4`. El `AppShell` monta los hosts del DS: `OverlayHost`,
`KeyboardToolbarHost`, Toast y las variables de tema estables. Una app que usa `AppShell`
no tiene que agregar nada. Pendiente de publicar el DS 4: ver B8 en
`PLAN_EJECUCION_UI_CORE.md`.

## El host es dueño del router

`createAppShell(config)` devolvía un componente que montaba su propio `NavigationContainer` y un
stack por dominio (`ui` + `activeDomain`). En 2.0 el framework no monta navegadores ni depende de
react-navigation:

```tsx
// Módulo del root layout (scope global, nunca dentro de un componente)
export const shell = defineAppShell({
  domains: [odooModule, ticketsModule],
  theme: TICKETS_THEME,
  darkTheme: TICKETS_DARK_THEME,
  providers: [ConfirmationProvider, ProcessToastProvider],
});

// Expo Router — app/_layout.tsx
export default function RootLayout() {
  return (
    <AppShell shell={shell}>
      <Stack screenOptions={{ headerShown: false }} />
    </AppShell>
  );
}

// react-navigation directo (tickets hoy) — App.tsx
export default function App() {
  return (
    <AppShell shell={shell}>
      <NavigationContainer theme={navTheme}>
        <AppRoutes />
      </NavigationContainer>
    </AppShell>
  );
}
```

- `defineAppShell` aplica tema, branding y fuentes, retiene el splash nativo y define los crons de fondo. Por eso va en el scope del módulo.
- `<AppShell>` monta los children **después** de que la base está lista: pantallas y providers pueden usar repositorios desde su primer render.
- Si el arranque falla, muestra una pantalla con "Reintentar" en vez de quedarse en blanco o en el splash. Un error de render queda en un `ErrorBoundary` raíz.
- Si las fuentes de marca fallan, la app sigue con las del DS (antes el splash quedaba para siempre).
- El color de fondo del navegador (`navTheme`) pasa a ser del host.

## Cambios que rompen

| Antes (1.x)                                                                                         | 2.0                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `EventRow`, `DeadLetterQueueRow` y `EventTimelineItem` aceptaban `onRetry` y abrían su propia sheet | Exigen `onOpen(event)`. La pantalla monta **una** `EventActionSheet`                                                                                                           |
| `eventService.listAllEvents()` cargaba toda la tabla                                                | `eventService.listRecentEvents(limit = 500)`: `ORDER BY created_at DESC LIMIT ?`                                                                                               |
| El historial de eventos crecía sin límite                                                           | `createApp` poda los eventos `ACKNOWLEDGED` con más de `AppConfig.eventRetentionDays` días (7 por defecto), sin bloquear el arranque. Los pendientes y fallidos nunca se tocan |
| `setBranding` se importaba desde la raíz del DS                                                     | `@sincpro/mobile-ui/branding` (no carga todo el DS al arrancar)                                                                                                                |
| `EventsScreen`, `DeadLetterQueueList` y `DatabaseList` volvían con `useNavigation().goBack()`       | Reciben `onBack?: () => void`; el host decide cómo volver (`router.back`, `navigation.goBack`). Sin `onBack` no hay botón atrás                                                |
| `createAppShell({ ui, activeDomain, ... })` → componente                                            | `defineAppShell(config)` en el scope del módulo + `<AppShell shell>{router}</AppShell>`; sin `ui` ni navegador propio                                                          |
| `activeDomain`                                                                                      | `initialDomain` (por defecto, el primer dominio) y `onDomainChange(key)` para que el host navegue                                                                              |
| `useDomainSwitcher()` → `{ activeDomain, setActiveDomain, apps }`                                   | `{ activeDomain, domains, switchTo }`; `domains` = `{ key, name }[]`                                                                                                           |
| `ActiveDomainApp`, `DomainApp`                                                                      | Eliminados: el host decide qué rutas muestra cada dominio                                                                                                                      |
| Peers `@react-navigation/native`, `@react-navigation/native-stack`, `react-native-screens`          | Eliminados: el framework no navega                                                                                                                                             |
| Peer `react-native-toast-message`                                                                   | Eliminado: nada lo usa                                                                                                                                                         |

### Sobre `@sincpro/client-framework`

El proceso, los logs, los errores y los casos de uso son los de `@sincpro/client-framework`
(los mismos de web y del backend). Mobile solo pone sus destinos: OpenTelemetry con la cola
SQLite → OTLP, y la consola + Loki.

| Antes (1.x)                                                                                            | 2.0                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@sincpro/client-framework` era una dependencia (`^0.6`)                                               | Es `peerDependency` `^1.2.0`: el host la instala, una sola copia en la app                                                                                                                                                                          |
| `loggerUseCases`, `loggerQueueProcessor`, `loggerCronJobs`, `logger` (default) de mobile               | `logger` de `@sincpro/client-framework` (infraestructura); dentro de un caso de uso, `this.logger`                                                                                                                                                  |
| `loggerRepositories`, `loggerOdooClient`, `loggerAdapter` de mobile                                    | `loggerAdapter` de `@sincpro/client-framework`                                                                                                                                                                                                      |
| `logger.info(msg, ...cualquier cosa)`                                                                  | `logger.info(message, attributes?)`; un error con `errorAttributes(error)`                                                                                                                                                                          |
| `configureLogger({ production, level: "DEBUG" })`                                                      | `configureLogger({ mode: __DEV__ ? "development" : "production", level: "debug", layers })`                                                                                                                                                         |
| `EApplicationLogger` (GLOBAL, ODOO_CLIENT, ADAPTER, REPOSITORIES, USE_CASES, EVENT_BUS, CRON_JOBS)     | Capas `LOG_LAYERS`: `infrastructure`, `adapter`, `entrypoint`, `bounded_context`, `application_service`, `feature`. `DEFAULT_ENABLED_LOGS` → `DEFAULT_ENABLED_LAYERS` (adapters apagados)                                                           |
| `getEnabledLoggers`, `isLoggerEnabled`, `setLoggerEnabled`, `setEnabledLoggers`, `resetEnabledLoggers` | `getEnabledLayers`, `isLayerEnabled`, `setLayerEnabled`, `setEnabledLayers`, `resetEnabledLayers`                                                                                                                                                   |
| `Debug.loggers.*`, `Debug.hydrate()` → `{ enabled, loggers }`                                          | `Debug.layers.*` (`contexts` → `all`), `Debug.hydrate()` → `{ enabled, layers }`. La preferencia se guarda en `app.debug_log_layers`; la de `app.debug_loggers` se ignora y las capas parten de sus defaults                                        |
| `useCommon()`: `loggerContexts`, `setLoggerContextEnabled`, `resetLoggerContexts`                      | `logLayers`, `setLogLayerEnabled`, `resetLogLayers`                                                                                                                                                                                                 |
| `loggingHooks(logger)` con el tipo `Logger` de mobile                                                  | `loggingHooks(logger)` recibe un `LayerLogger` del framework; el tipo `Logger` ya no se exporta                                                                                                                                                     |
| `Feature` y `ApplicationService` de mobile (un proxy con un span por método)                           | Eliminados: los de `@sincpro/client-framework`, registrados en un `BoundedContext` y ejecutados con `boundedContext.execute(new Command(...))`                                                                                                      |
| Errores sin tipo de falla                                                                              | Cada error declara `failureKind`: `UserError`/`RejectedFailure` → `domain`, `ValidationError`/`ChecksFailed` → `invalid`, `StaleAggregate` → `conflict`, `NetworkError`/`RepeatableFailure` → `unavailable`, `BackendError`/`AppError` → `internal` |

Una línea en Loki ahora dice su capa y su caso de uso: `[feature] [ventas.Cotizar] cotizado
cantidad=3 trace_id=… span_id=…`. Un panel que filtraba por `[USE_CASES]` filtra por la capa.

### Eventos: la cola guardada de `@sincpro/client-framework`

El bus de eventos de mobile se fue entero. Los eventos son `DomainEvent` del framework, se
guardan en SQLite (`stored_events`) y los entrega su `storedQueue`, en orden, a los bounded
contexts y las `Subscriptions` de los módulos activos. Mobile pone solo lo suyo: la tabla, cuándo
puede ir un evento (red, sesión) y qué se avisa al terminar.

| Antes (1.x)                                                                                                                                                    | 2.0                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DomainEvent`, `IntegrationEvent`, `EEventStatus`, `chain.ts` de mobile                                                                                        | Eliminados: un evento es `class X extends DomainEvent` de `@sincpro/client-framework`                                                                                                                                                                              |
| `static readonly name = "x"` + `readonly name = X.name`, `readonly label`, `readonly requiresNetwork`                                                          | `static readonly eventName = "x"`, `static readonly label`, `static readonly requiresNetwork`, `static readonly requiresSession` (por defecto `true`; `false` para lo que va sin sesión: login, logout, imprimir). `event.name` lee `eventName` y es reservado     |
| `X.create(data)`, `X.from(event)`, `fromJSON` de mobile                                                                                                        | `newEvent(X, values)`; la cola lo reconstruye sola (`static fromJSON` solo si lleva `Money`, `Decimal` o fechas)                                                                                                                                                   |
| `uuid`, `createdAt`, `correlationId`, `causationId`, `aggregateId`, `entityType`, `sequence`, `traceparent`, `status`, `attempts`, `errorMessage` en el evento | El evento lleva solo lo que pasó. Id y flujo van en el `Envelope` (`id`, `correlationId`, `causationId`, `publishedAt`); la entrega en el registro guardado (`state`, `attempts`, `failures`). `aggregateId`, `entityType` y `sequence` ya no se guardan           |
| `applyChain`, `causedBy`, `withCorrelationId`, `runWithChain`, `currentChain`, `infrastructure/event_chain`                                                    | Eliminados: el flujo es el del framework. Un repositorio inyectado en un bounded context (`BIND`) guarda sus eventos en el flujo de esa ejecución                                                                                                                  |
| `EventBus.publish`, `publishSync`, `schedule`, `on/off`, `start/stop`, `clearQueue`                                                                            | `eventDelivery.publisher.publish(event)` y `eventDelivery.drain()`. Quien necesita la respuesta ejecuta el caso de uso: `xBoundedContext.execute(new Command(...))`, que responde o lanza                                                                          |
| `QueueProcessor`, `subscriber_filter`                                                                                                                          | `eventDelivery.use(kernel.partiesFor(dominiosActivos))`, que hace el orquestador                                                                                                                                                                                   |
| `Subscriber` de `@sincpro/mobile/event_driven` (`listen`, `process`, `getEvent`, `requiresAuth`)                                                               | `EventSubscriber<E>` del framework: `static subscriberName`, `handle(event)` ejecuta un Command. Se registra en las `Subscriptions` del módulo (`entrypoints/queue/index.ts`), uno por evento                                                                      |
| `requiresAuth` en el suscriptor                                                                                                                                | `requiresSession` en la clase del evento                                                                                                                                                                                                                           |
| `static replaces = SuscriptorDelCore`                                                                                                                          | `commonSubscriptions.subscribe(Evento, { replaces: SuscriptorDelCore })(ElDeLaApp)`                                                                                                                                                                                |
| `DomainModule.subscribers(): Subscriber[]`, `interceptors()`                                                                                                   | `boundedContexts()` (sus casos de uso, también los de un evento) y `subscribers(): Subscriptions[]`. Los interceptores por nombre de evento se fueron: `boundedContext.interceptor(Command)(fn)`                                                                   |
| `interceptEvent`, `ANY_EVENT`, `runIntercepted`                                                                                                                | Eliminados                                                                                                                                                                                                                                                         |
| `entity.recordedEvents()` / `pullEvents()` → eventos; `releaseDeliverable()`                                                                                   | Responden `Recorded[]` (`{ id, event, sequence, correlationId }`); `releaseRecorded()`. Todo evento registrado va al outbox: ya no hay eventos "solo de dominio" que se quedan en el agregado                                                                      |
| `entity.events` → eventos rehidratados                                                                                                                         | `EventRecord[]` leídos de `stored_events`                                                                                                                                                                                                                          |
| `Outbox.save(event)`, `IRepository.publish(IntegrationEvent[])`                                                                                                | `Outbox.save(stored: StoredEvent)` dentro de la transacción del repositorio; `publish(DomainEvent[])`                                                                                                                                                              |
| `DomainEventRepository`, `DomainEventDeadLetterRepository`, `ECommonRepository.DOMAIN_EVENT*`                                                                  | `eventStore` (`SqliteEventStore`, el `EventStore`), `ECommonRepository.STORED_EVENTS`                                                                                                                                                                              |
| Tablas `domain_events`, `domain_events_dead_letter`, `event_queue`, `dead_letter_queue`                                                                        | `stored_events`. La migración mueve las filas: PENDING y PROCESSING → `pending`; ACKNOWLEDGED → `delivered`; FAILED, CANCELLED y la DLQ → `set_aside` con su error. Ids, flujo, intentos y valores se conservan                                                    |
| `deadLetterQueueUseCases` (`getFailedEvents`, `retryFailedEvent`, `deleteFailedEvent`, …)                                                                      | `eventService.listFailedEvents()`, `retryEvents(records)` (cuántos volvieron, una vez por falla), `deleteEvents(records)`                                                                                                                                          |
| `eventService.republishSync(event)`, `listRecentEvents()` → `IntegrationEvent[]`, `pruneHistory` de ACKNOWLEDGED                                               | `resendEvent(record)` (uno fallido vuelve a la cola, otro se publica de nuevo), `listRecentEvents()` → `EventRecord[]`, `pruneHistory` de `delivered`                                                                                                              |
| `EventRow`, `DeadLetterQueueRow`, `EventTimelineItem`, `EventActionSheet`, `DeadLetterQueueList` con `IntegrationEvent`                                        | Reciben `EventRecord`: `id`, `state`, `publishedAt`, `error`, `payload` en lugar de `uuid`, `status`, `createdAt`, `errorMessage`, `asJSON()`                                                                                                                      |
| `EventStatusFilter` `PENDING`/`PROCESSING`/`FAILED`/`ACKNOWLEDGED`/`CANCELLED`; `EventListItem.status/createdAt`                                               | `pending`/`delivered`/`set_aside`; `state`/`publishedAt`                                                                                                                                                                                                           |
| `UIEventBus.emit(event.name, event)` al procesar                                                                                                               | `UIEventBus.emit(nombre, stored)` al asentarse (entregado, apartado o esperando reintento)                                                                                                                                                                         |
| `InternetIsDownEvent.name`, `InternetIsUpEvent.name`                                                                                                           | `.eventName`                                                                                                                                                                                                                                                       |
| Suscriptores del core `ActivateDomainSubscriber`, `NewAppSettingsSubscriber`, `PrintImageSubscriber`, `ProcessWebViewMessageSubscriber`                        | `commonSubscriptions` (`DomainActivated`, `DomainDeactivated`, `NewAppSettings`, `PrintImage`, `WebViewMessage`) que ejecutan Commands en `commonBoundedContext` (`ActivateDomain`, `DeactivateDomain`, `ApplyAppSettings`, `PrintImage`, `ProcessWebViewMessage`) |
| `declaresUi(event)`                                                                                                                                            | `showsDelivery(ClaseDelEvento)` (`static ui = true`)                                                                                                                                                                                                               |
| Un intento y a la DLQ (`MAX_ATTEMPTS = 1`)                                                                                                                     | Lo que un reintento puede arreglar espera y se reintenta en orden; lo que nunca (`invalid`, `domain`, `not_found`) se aparta al instante; tras 10 intentos, se aparta                                                                                              |

Un evento que necesita sesión espera durante el logout en lugar de darse por recibido sin que
nadie lo escuche. Un `EntityUpdated` de un repositorio relay ahora se guarda como historia.

## Comportamiento nuevo, sin cambio de API

- **EventBus:**
  - El polling de respaldo (800 ms) se pausa con la app en segundo plano y drena al volver. `publish()` sigue drenando al instante.
  - Un `InternetIsUp` ya no reinicia el polling de un bus detenido.
  - El payload del log de debug solo se serializa con el debug activo.
- **Providers raíz:**
  - Al volver a primer plano, `CommonProvider` relee el permiso de ubicación sin re-renderizar a todos los consumidores.
  - `DomainSwitcherProvider` y `DatabaseProvider` memoizan su valor.
- **Crons de fondo (15 min o más):**
  - `defineAppShell` define su tarea del SO mientras carga el bundle, así que corren también con la app cerrada; antes se definían en `start()` y el SO no las encontraba.
  - Cada ejecución en segundo plano prepara la base (`kernel.bootstrap()`, una vez por contexto JS).
  - El flush de telemetría de fondo (`TELEMETRY_FLUSH`, 15 min por defecto) también se define al cargar: con la app cerrada prepara la base, arranca la telemetría sin volver a registrarse y vacía las colas.
  - Nuevas APIs: `createKernel(config)` (sin IO), `startApp(kernel, options)`, `defineBackgroundCrons(kernel, { telemetry })`, `runBackgroundTelemetryFlush(config)` y la opción `initTelemetry(config, { scheduleBackground })`. `createApp(config)` sigue igual y las usa.
  - `Kernel.cronsByKey()` lee los crons de cada módulo una sola vez, así que `crons` de `AppConfig` configura las mismas instancias que arranca el orquestador.
- **Impresión:** la imagen viaja en memoria y no en `domain_events`. Se guardan como máximo 5 pendientes.
- **Componentes:** los 9 que usaban el `Pressable` de RN con `className` pasan al primitivo del DS.
- **Build:** la capa React (`ui/**`, `entrypoints/ui/**`) se publica compilada con React Compiler.
- **Proceso:** `createKernel` configura el proceso del framework (`configureObservability`): cada caso de uso es un span del tracer global de OpenTelemetry — el provider que registra `initTelemetry`, sin nada que registrar si la telemetría está apagada — y cada línea pasa por `mobileLogger` (consola + Loki).

## Para quien escribe pantallas

Las reglas de rendimiento del DS aplican igual (ver `@sincpro/mobile-ui/docs/MIGRATION-V4.md`, §8):

- filas puras con `memo`;
- renderer con `useCallback`;
- una sheet por pantalla;
- nada de `Modal` para overlays;
- nada de `Pressable` de RN con `className`;
- no leer getters `@mapped` dentro del render de una lista: hacen una consulta síncrona a SQLite en cada acceso.
