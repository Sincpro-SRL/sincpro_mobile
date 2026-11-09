# PRD 07 — Modos de conectividad: online, diferido y offline

> 2026-11-08. Define los tres patrones de red de `@sincpro/mobile`, cuándo usar cada uno
> y los componentes de UI que los acompañan.

## Los tres modos

| Modo                               | Fuente de verdad          | Sin red                                         | Conciliación                    | Ejemplo                                       |
| ---------------------------------- | ------------------------- | ----------------------------------------------- | ------------------------------- | --------------------------------------------- |
| **Online**                         | El backend                | La acción falla y se avisa                      | Ninguna                         | Login, buscar un cliente en Odoo              |
| **Diferido** (_store-and-forward_) | El backend                | La acción se guarda y se envía al volver la red | Ninguna: el backend decide      | Registrar un pago, cerrar un ticket, imprimir |
| **Offline**                        | El teléfono, sincronizado | Se trabaja completo sobre datos locales         | Sí: hay que resolver conflictos | Inventario en ruta sin señal                  |

**El modo diferido es el que describís "como un mensaje de WhatsApp".**

- La acción queda guardada en el teléfono y se envía sola cuando hay red.
- El teléfono **no decide nada**. Si el backend la rechaza (por ejemplo, el ticket ya estaba
  cerrado), la acción queda fallida y el usuario lo ve. No se fusiona ningún estado.

**El modo offline es otra cosa:**

- el teléfono tiene su propia copia de los datos;
- hay que bajar, subir y resolver conflictos.

Es mucho más caro y se elige solo cuando el negocio no puede esperar a la red.

## Qué tenemos hoy

La cola de eventos ya es la base del modo diferido:

- **Persistencia:** el evento se guarda en `domain_events` antes de procesarse.
- **Reintentos:** `RepeatableFailure` y `DomainNetworkError` lo dejan para otro intento.
- **Red:** `InternetIsDown` e `InternetIsUp` cambian el estado de conexión. El polling de
  respaldo se pausa con la app en segundo plano y drena al volver.
- **Fallidos:** lo que falla de forma definitiva va a la DLQ, con "Reintentar".
- **UI:** `ActivityStrip` y `DeviceNotices` muestran actividad global.

**Lo que falta para que sea un modo de verdad:**

1. **Contrato de acción:** la cola procesa eventos de dominio. No hay "acción del usuario
   pendiente" con identidad, dueño ni vencimiento.
2. **Idempotencia:** un reintento puede duplicar la operación en el backend si la primera
   llegó pero la respuesta se perdió.
3. **Estado por acción:** el usuario no ve en la fila del ticket si su cierre está pendiente,
   enviado o fallido. Solo ve la actividad global.
4. **Reintentos:** `MAX_ATTEMPTS = 1` y la DLQ nunca se poda. No hay backoff por acción ni
   vencimiento.
5. **Orden:** dos acciones sobre el mismo registro no tienen un orden garantizado.

## Diseño del modo diferido

### Contrato

```ts
outbox.enqueue({
  type: "ticket.close", // la acción, con su Feature de envío registrada
  payload: { ticketId: 42 },
  aggregateId: "ticket:42", // ordena las acciones del mismo registro
  idempotencyKey: uuid(), // viaja al backend: un reintento no duplica
  expiresAt: inHours(24), // si vence sin enviarse, queda fallida
  label: "Cerrar ticket #42", // lo que ve el usuario
});
```

### Estados

`pendiente → enviando → enviada`, o `fallida`, o `vencida`, y `cancelada` si el usuario la
descarta antes del envío.

- **Errores de red:** pendiente con backoff (1 s, 5 s, 30 s, 2 min, 10 min), y se reanuda al
  volver la red.
- **Rechazo del backend** (un 4xx o una validación): fallida, con el mensaje del backend.
  No se reintenta sola.
- **Un 5xx:** reintento con backoff y un tope de intentos. Después, fallida.

### Reglas

- El envío pasa por un `Feature` (PRD 01), así queda trazado.
- Las acciones del mismo `aggregateId` salen en orden. Otras salen en paralelo, con un
  límite.
- La UI aplica el resultado esperado al instante, marcado como pendiente. Si el backend lo
  rechaza, vuelve al estado anterior y lo explica.
- Las acciones fallidas y vencidas se conservan 7 días y después se podan.

## Componentes de UI (mobile-ui)

| Componente             | Dónde                                | Qué muestra                                                                         |
| ---------------------- | ------------------------------------ | ----------------------------------------------------------------------------------- |
| `SyncStatus`           | En la fila o el detalle del registro | Reloj (pendiente), check (enviada), alerta (fallida). El mismo lenguaje que un chat |
| `ConnectivityBanner`   | Bajo el header, una sola vez por app | "Sin conexión: tus cambios se enviarán al volver la red"                            |
| `PendingActions`       | Pantalla en Actividad                | Lista de acciones con su estado, "Reintentar" y "Descartar"                         |
| Insignia en la pestaña | Actividad                            | Cantidad de pendientes y fallidas                                                   |
| Toast                  | Al cambiar de estado                 | Solo para fallidas, nunca uno por cada envío exitoso                                |

## Qué no es

- No es el modo offline: no hay sincronización ni copia local de los datos del backend.
- No reemplaza la cola de eventos de dominio: la usa por debajo.
- No sirve para lecturas: buscar o listar siguen siendo online, con caché si hace falta.

## Cómo elegir el modo

1. ¿La acción tiene sentido minutos u horas después? **Diferido.** Si no (por ejemplo,
   cobrar con tarjeta), **online**.
2. ¿El usuario necesita ver y editar datos sin red durante horas? Solo entonces
   **offline**, con un PRD propio de sincronización.

## Cómo se adopta

1. **Corte 1 (mobile):**
   - `outbox` sobre la cola actual: tabla `outbox`, estados, backoff, `idempotencyKey`,
     orden por agregado y poda.
   - Hook `useOutbox(filter)`.
2. **Corte 2 (mobile-ui):** `SyncStatus`, `ConnectivityBanner` y `PendingActions`, con
   stories y paridad Android e iOS.
3. **Corte 3 (odoo y tickets):**
   - La impresión desde el portal pasa a diferida, con la imagen guardada hasta imprimirse.
   - Una acción de Odoo (por ejemplo, cerrar un ticket) también, con la idempotencia
     respetada por el backend.

## Criterios de aceptación

- **Envío diferido:** en modo avión, cerrar un ticket lo muestra pendiente. Al volver la red
  se envía solo y pasa a enviado sin tocar nada.
- **Sin duplicados:** cortar la red justo después de enviar no duplica el cierre en Odoo.
- **Rechazo visible:** un rechazo del backend deja la acción fallida, con el motivo y
  "Reintentar".
- **Supervivencia:** reiniciar la app con acciones pendientes no las pierde.
