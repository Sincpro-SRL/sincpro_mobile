# PRD 06 — Logs y observabilidad

> 2026-11-08. Separa la consola de desarrollo de los logs de producción. Parte del
> diagnóstico de tickets con `@sincpro/mobile` 1.2.2 (ver `PLAN_FEATURES_TICKETS.md`, F3).

## Problema

- **Interruptores del perfil:**
  - Los interruptores por contexto del perfil se leen en cada log, pero sirven poco:
    `LOG_LEVEL` está fijo en INFO (`infrastructure/logger.ts`), así que todo `.debug()` se
    descarta.
  - Los contextos solo valen con "Modo Debug" activo.
  - Se hidratan después del arranque y nunca en las tareas de fondo.
- **"Repositorios":** loguea cada SQL con sus parámetros. Inunda el hilo JS y expone datos.
- **Telemetría:** ninguna app la activa (`defineAppShell` sin `telemetry`), así que en un
  teléfono real **no se ve nada**.
- **Si se activa:**
  - cada línea es un POST a Loki;
  - un 4xx o 5xx se descarta;
  - los logs offline esperan al cron de 15 min.
- **`IS_PRODUCTION`** está fijo en `false`.

## Qué es

Dos canales con dueños distintos.

|                 | Consola de desarrollo                | Logs de producción              |
| --------------- | ------------------------------------ | ------------------------------- |
| Para qué        | Depurar en el equipo                 | Diagnosticar en campo           |
| Quién lo decide | El desarrollador, desde la app       | La configuración del despliegue |
| Dónde se ve     | Metro, DevTools y el visor en la app | Loki y Grafana                  |
| Qué cambia      | Lo que se imprime                    | Lo que se envía                 |

Los interruptores de la UI **solo** cambian la consola. Nunca deciden qué llega a Loki.

### Consola de desarrollo

- Visible con `__DEV__` o con modo dev activo.
- Un selector de nivel (DEBUG, INFO, WARN o ERROR) y la máscara por contexto.
- **SQL:** se imprime solo la sentencia; los parámetros, solo en DEBUG y truncados.
- **Visor en la app:** las últimas 500 líneas en memoria, para ver un problema en un
  teléfono sin Metro.
- **Hidratación:** dentro de `startApp`, antes del bootstrap, y también en las tareas de
  fondo.

### Logs de producción

**Activación:**

- `defineAppShell({ telemetry })` en cada host.
- **Credenciales:** URL y credenciales de Loki por variables de entorno o secrets del
  pipeline. Nunca en el código.

**Qué se envía:**

| Nivel        | Regla                                                                          |
| ------------ | ------------------------------------------------------------------------------ |
| WARN y ERROR | Siempre, con stack y contexto                                                  |
| INFO         | Solo de una lista permitida (cola, impresión, sesión y arranque), con muestreo |
| DEBUG        | Nunca                                                                          |

**Etiquetas fijas:** `service`, `version`, `env`, `tenant`, `device`, `platform`.

**Entrega:**

1. Todo se escribe primero en SQLite (`telemetry_queue`).
2. Se envía por lotes con un disparo con debounce, también para los logs, no solo para los
   spans.
3. Con un 4xx o 5xx, el lote queda en la cola con backoff. Con un 4xx permanente se
   descarta y se cuenta.
4. **Límites:** como máximo N líneas por minuto y por contexto. Lo que sobra se resume en
   una línea "suprimidas X".

**Configuración remota** (segundo corte): nivel, muestreo y lista permitida por tenant,
leídos al iniciar sesión (por ejemplo, un parámetro de Odoo). Sin cambiar el binario.

**"Enviar diagnóstico":** un botón en Ajustes que manda las últimas líneas del visor y el
estado de las colas, con el consentimiento del usuario.

## Qué no es

- No es un APM: los traces siguen el PRD 01 y el envío OTLP ya existente.
- No reemplaza la DLQ: un evento fallido sigue en su cola. El log solo lo cuenta.
- No guarda datos personales: los parámetros SQL, los payloads y los tokens no salen del
  teléfono.

## Cómo se adopta

1. **Corte 1 (mobile):**
   - Nivel configurable.
   - Hidratar antes del bootstrap.
   - Ocultar los parámetros SQL.
   - Envío por lotes con status HTTP.
   - Leer `IS_PRODUCTION` del ambiente.
2. **Corte 2 (hosts):** tickets activa `telemetry` con las variables del pipeline. Revisar
   en Grafana el volumen de un día.
3. **Corte 3:** configuración remota, visor en la app y "Enviar diagnóstico".

## Criterios de aceptación

- **Consola:** con el modo dev apagado, la UI no cambia el volumen enviado a Loki.
- **Entrega:** un ERROR sin red llega a Loki minutos después de volver la conexión, no a
  los 15 min.
- **Hilo JS:** el contexto "Repositorios" activo no traba el hilo JS al listar 500 filas.
- **Privacidad:** ninguna línea enviada contiene la contraseña ni los parámetros de una
  consulta.
