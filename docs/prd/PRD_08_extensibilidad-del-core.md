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
4. **Promoción al core por issue.** Si algo de una app se repite en N proyectos, alguien abre un
   issue. Se evalúa y, si reduce complejidad repetida, se sube al core como componente de
   propósito general.

## Por qué hacía falta

Cada cambio de comportamiento de una app terminó en un release de `@sincpro/mobile`:

- servicios creados con `new` e importados directo, sin forma de reemplazarlos;
- ninguna forma de envolver lo que hace un subscriber del core;
- la reconexión de la impresora sin forma de apagarla ni ajustarla.

## Mecanismos de extensión

| Necesidad de la app                                                        | Mecanismo                                                                                                                                                                              | Equivalente en `sincpro_framework` |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Ajustar una política del componente                                        | API rica: `printerService.configure({ autoReconnect, reconnectDelays })`                                                                                                               | Settings                           |
| Hacer algo que el componente no envuelve                                   | Bajo nivel: `printerService.driver` (driver nativo: comandos crudos, otros formatos)                                                                                                   | `deps`                             |
| Cambiar un método del componente                                           | Herencia: `class MiImpresora extends PrinterService` + `setPrinterService(new MiImpresora())`. Llega a todo el core, porque `printerService` siempre apunta a la implementación actual | `replaces=` sobre un handler       |
| Envolver lo que pasa al procesar un evento (avisar, auditar, vetar, medir) | `DomainModule.interceptors()`: `{ [nombreDelEvento \| "*"]: (event, next, { subscriber }) => … }`                                                                                      | `@bus.interceptor`                 |
| Responder un evento en lugar del core                                      | Un subscriber propio con `static replaces = SubscriberDelCore`: el del core deja de correr                                                                                             | `replaces=`                        |
| Llevar al usuario a una pantalla propia desde un aviso del core            | `AppShellConfig.onNoticeAction(intent)`                                                                                                                                                | —                                  |

### Ejemplos

```ts
// Política: otra espera entre reintentos, sin release del core.
printerService.configure({ reconnectDelays: [500, 1_000, 3_000] });

// Herencia: otra forma de imprimir, para toda la app y el core.
class TicketsPrinter extends PrinterService {
  override async printImageBase64(image: string) {
    // ESC/POS propio con this.driver…
    return super.printImageBase64(image);
  }
}
setPrinterService(new TicketsPrinter());

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

| Mecanismo                                | Dónde                                                                            | Uso desde la app                                                                                                                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Interceptores de eventos                 | `infrastructure/workers/interceptors.ts`; el `EventBus` envuelve cada subscriber | `DomainModule.interceptors()`                                                                                                                                                                    |
| Reemplazo de subscribers                 | `framework/replaces.ts`; `kernel.subscribersByKey()`                             | `static replaces = SubscriberDelCore`                                                                                                                                                            |
| Componentes reemplazables por herencia   | `framework/replaceable.ts`                                                       | `setPrinterService`, `setWebViewService`, `setEventService`, `setNetworkUseCases`, `setDeadLetterQueueUseCases`, `setBluetoothService`, `setDatabaseTablesUseCase` (todas las clases exportadas) |
| Hooks de ciclo de vida                   | `framework/lifecycle.ts`; el orquestador los corre                               | `onStart`, `onForeground`, `onLogin`, `onLogout` en `DomainModule`                                                                                                                               |
| Mensajes del WebView por tipo            | `infrastructure/webview/message_handlers.ts`; `webViewService.handleMessage`     | `DomainModule.webViewHandlers()`: el de la app gana sobre el del core                                                                                                                            |
| API rica y de bajo nivel de la impresora | `PrinterService`                                                                 | `configure()`, `driver`                                                                                                                                                                          |

**La impresión usa los mismos mecanismos que una app:**

- la reconexión es el `onStart` de `baseModule`;
- el ciclo de impresión del WebView son sus `webViewHandlers`;
- el `AppShell` ya no sabe nada de impresoras.

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
