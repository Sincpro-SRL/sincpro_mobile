# PRD 08 — Un core que se extiende sin modificarlo

> 2026-11-08. Regla del framework: `@sincpro/mobile` es una **navaja suiza**. Trae componentes
> concretos de propósito general (cola de eventos, base, sesión, impresora, WebView, avisos) con
> una **API rica**, y expone **APIs de bajo nivel** para que una app haga lo suyo **sin modificar
> el core**.

## La regla

1. **Concreto sí, si es de propósito general.** Un framework que solo trae interfaces no sirve.
   La impresora, el WebView o la cola son componentes completos que funcionan sin configurar nada.
2. **Nada de ports por todos lados.** No se abstrae lo que no tiene una segunda implementación
   real. Se extiende con los mecanismos de abajo.
3. **Una app nunca modifica el core para su caso.** Usa la API rica, la de bajo nivel, la herencia
   o un interceptor.
4. **Sin filtros en el core.** Los datos pasan crudos: nada de listas blancas de tipos ni
   descartes silenciosos. Los valores por defecto (nivel de log, retención, props de un
   componente) se pueden configurar desde la app. Filtrar es decisión de la app.
5. **Promoción al core por issue.** Si algo de una app se repite en N proyectos, alguien abre un
   issue. Se evalúa y, si reduce complejidad repetida, se sube al core como componente de
   propósito general.

## Por qué hacía falta

Cada cambio de comportamiento de una app terminó en un release de `@sincpro/mobile`:

- servicios creados con `new` e importados directo, sin forma de reemplazarlos;
- ninguna forma de envolver lo que hace un subscriber del core;
- la reconexión de la impresora sin forma de apagarla ni ajustarla.

## Mecanismos de extensión

| Necesidad de la app                                                        | Mecanismo                                                                                                                                                                                                                         | Equivalente en `sincpro_framework` |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Ajustar una política del componente                                        | API rica: `printerAdapter.configure({ autoReconnect, reconnectDelays })`                                                                                                                                                          | Settings                           |
| Hacer algo que el componente no envuelve                                   | Bajo nivel: `printerAdapter.driver` (driver nativo: comandos crudos, otros formatos)                                                                                                                                              | `deps`                             |
| Cambiar un método del componente                                           | Herencia: `class MiImpresora extends PrinterAdapter` + `commonBoundedContext.addDependency("printer", new MiImpresora(), { replaces: printerAdapter })`. Llega a todo el core, porque cada caso de uso lo lee del bounded context | `replaces=` sobre un handler       |
| Envolver lo que pasa al procesar un evento (avisar, auditar, vetar, medir) | `DomainModule.interceptors()`: `{ [nombreDelEvento \| "*"]: (event, next, { subscriber }) => … }`                                                                                                                                 | `@bus.interceptor`                 |
| Responder un evento en lugar del core                                      | Un subscriber propio con `static replaces = SubscriberDelCore`: el del core deja de correr                                                                                                                                        | `replaces=`                        |
| Llevar al usuario a una pantalla propia desde un aviso del core            | `AppShellConfig.onNoticeAction(intent)`                                                                                                                                                                                           | —                                  |
| Cambiar o envolver un caso de uso del core (2.2: toda operación lo es)     | `commonBoundedContext.feature(CommandPrintImage, { replaces: PrintImage })(MiImpresion)`; `commonBoundedContext.interceptor(CommandPrintImage)(…)`                                                                                | `replaces=`, `@bus.interceptor`    |

### Ejemplos

```ts
// Política: otra espera entre reintentos, sin release del core.
printerAdapter.configure({ reconnectDelays: [500, 1_000, 3_000] });

// Herencia: otra forma de imprimir, para toda la app y el core.
class TicketsPrinter extends PrinterAdapter {
  override async printImage(image: string) {
    // ESC/POS propio con this.driver…
    await super.printImage(image);
  }
}
commonBoundedContext.addDependency("printer", new TicketsPrinter(), {
  replaces: printerAdapter,
});

// Interceptor: auditar cada impresión sin tocar el subscriber del core.
class TicketsModule extends DomainModule {
  override interceptors() {
    return {
      [PrintImageRequestedEvent.name]: async (event, next) => {
        await next();
        audit("print", event.uuid);
      },
    };
  }
}
```

## Hecho

> Registro de 1.x. Desde 2.2 los componentes son adaptadores del bounded context y se
> reemplazan con `addDependency(..., { replaces })`; los casos de uso, con
> `feature(..., { replaces })`. Ver `docs/MIGRATION-V2.md`, «De 2.1 a 2.2».

| Mecanismo                                | Dónde                                                                            | Uso desde la app                                                                                                                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Interceptores de eventos                 | `infrastructure/workers/interceptors.ts`; el `EventBus` envuelve cada subscriber | `DomainModule.interceptors()`                                                                                                                                                                    |
| Reemplazo de subscribers                 | `framework/replaces.ts`; `kernel.subscribersByKey()`                             | `static replaces = SubscriberDelCore`                                                                                                                                                            |
| Componentes reemplazables por herencia   | `framework/replaceable.ts`                                                       | `setPrinterService`, `setWebViewService`, `setEventService`, `setNetworkUseCases`, `setDeadLetterQueueUseCases`, `setBluetoothService`, `setDatabaseTablesUseCase` (todas las clases exportadas) |
| Hooks de ciclo de vida                   | `framework/lifecycle.ts`; el orquestador los corre                               | `onStart`, `onForeground`, `onLogin`, `onLogout` en `DomainModule`                                                                                                                               |
| Mensajes del WebView por tipo            | `infrastructure/webview/message_handlers.ts`; `webViewService.handleMessage`     | `DomainModule.webViewHandlers()`: el de la app gana sobre el del core                                                                                                                            |
| API rica y de bajo nivel de la impresora | `PrinterService`                                                                 | `configure()`, `driver`                                                                                                                                                                          |
| Pantalla de eventos fallidos de la app   | `ui/screens/dead_letter_queue`; `EventActionSheet`                               | `DeadLetterQueueList` con `select`, `eventTitle`, `renderDetail`, `showTechnical`, `name`, `description`                                                                                         |

**La impresión usa los mismos mecanismos que una app:**

- la reconexión es el `onStart` de `baseModule`;
- el ciclo de impresión del WebView son sus `webViewHandlers`;
- el `AppShell` ya no sabe nada de impresoras.

**Un reintento por falla:** `retryFailedEvent` saca el evento de la cola de fallidos antes de
reenviarlo y devuelve `false` si ya no estaba. Dos toques seguidos o una lista sin refrescar no
repiten el efecto (una impresión sale una vez). Si vuelve a fallar, el bus lo devuelve a la cola y
se puede reintentar de nuevo.

**Compatible con lo publicado:**

- los nombres exportados (`printerService`, `webViewService`…) siguen iguales;
- `handlePrintMessage` queda como alias de `handleMessage`.

**Tests:**

- orden, veto y falla de los interceptores;
- reemplazo de subscribers;
- herencia de un componente que llega a quien ya tenía la instancia;
- hooks aislados ante fallas;
- despacho de mensajes por tipo, con texto que no es JSON;
- contrato del cableado.

## Cómo se promueve algo al core

1. Una app lo resuelve con estos mecanismos, sin tocar el core.
2. Si aparece en otra app, se abre un issue en `sincpro_mobile`: qué se repite, en qué proyectos
   y qué complejidad ahorra.
3. Si se aprueba, entra como componente de propósito general, con su API rica, su salida de bajo
   nivel y sus mecanismos de extensión.
