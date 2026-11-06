# PRD 04 — Comunicación y adapters

> SP-2026-1068. 2026-11-05. Contraste con el borde de `sincpro_framework`:
> el caso de uso habla con un puerto, el adapter es el único que conoce el
> sistema remoto. No se implementa hasta que se defina el corte.

## Qué es hoy

La red del dispositivo está en dos sitios.

`NetworkAdapter` pregunta a `expo-network` si hay enlace. `EventBus` usa eso
para no drenar un evento con `requiresNetwork` mientras no hay internet.

Odoo vive en `@sincpro/mobile-odoo`. `OdooClient` es un singleton axios que
habla JSON-RPC: `login`, `callModel`, `queryModel`. Traduce el fallo a
`DomainNetworkError` o `DomainBackendError` y avisa `InternetIsDown` /
`InternetIsUp` por `UIEventBus`.

Distribution no llama a axios. Cada archivo en `adapters/odoo/` pide
`getOdooClient()`, trae el DTO y lo convierte a entidad (`fromRemoteDTO`).
El repositorio local guarda esa entidad con `remoteId`, `remoteRef` y
`remoteState` (`SYNCED`, `PENDING`, `FAILED`). El service repite el recorrido:
pedir la página, upsert local, publicar el evento. Cada upsert es una
sentencia suelta (PRD 03).

## Qué ya cerró el framework de Python

El Feature no importa el cliente HTTP. Recibe un puerto. El adapter traduce
el contrato remoto al tipo del dominio y es el único archivo que conoce la
forma del otro sistema. Un fallo de red no se aplana con un fallo de negocio.
Lo que tiene que quedar hecho junto —escribir el estado y dejar el hecho para
después— entra en la misma transacción. El reintento de la entrega es otro
objeto (PRD 05), no un segundo cliente.

## Qué se queda en mobile

Odoo sigue siendo el remoto, y el cliente JSON-RPC sigue en
`@sincpro/mobile-odoo`. No se genera un cliente desde el metamodelo de Python,
ni un gateway, ni un broker. `remoteState` sigue siendo la marca de la fila
local: dice si ese documento ya coincidió con el servidor. No es una cola.

## Cortes, en este orden

1. El puerto del core nombra tres operaciones: entrar, llamar un método,
   consultar un modelo. `OdooClient` las implementa. El adapter de distribution
   depende del puerto, no de `getOdooClient()`.
2. El adapter devuelve entidades. El service no ve el DTO ni el id de sesión.
3. Bajar una página y marcar las filas es una unidad de trabajo (PRD 03).
   Si el lote se corta, ninguna fila queda a medias y el evento de “página
   aplicada” no se escribe.
4. Subir un documento pendiente escribe el estado local y el hecho de entrega
   en esa misma unidad. El subscriber que llama a Odoo corre después, como hoy.
   Un `DomainNetworkError` deja la fila en `PENDING`. Un error de negocio la
   deja en `FAILED` con el mensaje, y no la reintenta igual que la red.
