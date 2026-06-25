# Especificación Técnica: Integración de Observabilidad Mantenida (Faro + OpenTelemetry)

Este artefacto define la arquitectura para acoplar herramientas oficiales y mantenidas (`@grafana/faro-react-native` y `@opentelemetry/api`) dentro del ecosistema offline-first de `sincpro_mobile`, resolviendo el almacenamiento local a través de tu base de datos y crons existentes en Expo.

---

## 1. Arquitectura del Transporte Personalizado (Grafana Faro)

Para evitar que los logs y excepciones se pierdan en la memoria RAM cuando el dispositivo no tiene señal, se sobrescribe el comportamiento de red nativo de Faro utilizando un `Transport` personalizado que redirige la telemetría hacia SQLite.

### Implementación del Inicializador (`SincproLogger.ts`)

```typescript
import {
  initializeFaro,
  Transport,
  LogEvent,
  ExceptionEvent,
} from "@grafana/faro-react-native";

// Clase encargada de interceptar el flujo de datos de Grafana Faro
class SincproSQLiteTransport implements Transport {
  readonly name = "sincpro-sqlite-transport";
  readonly version = "1.0.0";

  // Este método es ejecutado por Faro de forma automática ante cada log o error
  send(events: Array<LogEvent | ExceptionEvent>): void {
    events.forEach((event) => {
      const telemetryRow = {
        id: Math.random().toString(36).substring(2, 15),
        type: "log",
        level: (event as LogEvent).level || "error",
        payload: JSON.stringify(event),
        timestamp: new Date().toISOString(),
        status: "pending",
      };

      // INSERCIÓN JSI: Aquí acoplas con el motor SQLite de tu framework
      // db.executeAsync(
      //   'INSERT INTO sincpro_telemetry_queue (id, type, level, message, timestamp, status) VALUES (?, ?, ?, ?, ?, ?)',
      //   [telemetryRow.id, telemetryRow.type, telemetryRow.level, telemetryRow.payload, telemetryRow.timestamp, telemetryRow.status]
      // );
    });
  }
}

// Inicialización global en el App.js / App.tsx de tu proyecto Expo
export const initSincproTelemetry = () => {
  initializeFaro({
    config: {
      app: {
        name: "sincpro-mobile-client",
        version: "1.0.0", // Reemplazar dinámicamente con Expo Constants
        environment: "production",
      },
      transports: [
        new SincproSQLiteTransport(), // Ignora el transporte HTTP oficial; delega a tu DB
      ],
    },
  });
};
```

---

## 2. Propagación de Trazas Asíncronas (OpenTelemetry API)

Dado que tus datos viajan asíncronamente a Odoo mediante colas de base de datos locales, necesitas romper el esquema síncrono HTTP usando propagación manual de contexto con el estándar W3C (`traceparent`).

### Implementación del Ciclo de Vida de la Traza (`SincproTracer.ts`)

```typescript
import { trace, propagation, ROOT_CONTEXT, Context } from "@opentelemetry/api";

const tracer = trace.getTracer("sincpro-mobile-tracer");

/**
 * 1. FASE OFFLINE: Se ejecuta en el hilo principal cuando el usuario realiza una acción.
 * Genera el Span y guarda el identificador de la traza junto con los datos de negocio.
 */
export function registrarAccionOffline(nombreOperacion: string, datosNegocio: any) {
  return tracer.startActiveSpan(nombreOperacion, (span) => {
    try {
      // Inyectar el contexto actual en un objeto plano
      const contextCarrier: Record<string, string> = {};
      propagation.inject(trace.context.active(), contextCarrier);

      // Guardar en tu base de datos local de negocio (Ej: Cola de Odoo)
      // db.execute(
      //   'INSERT INTO odoo_sync_queue (payload, trace_context) VALUES (?, ?)',
      //   [JSON.stringify(datosNegocio), JSON.stringify(contextCarrier)]
      // );
    } finally {
      span.end(); // Se cierra inmediatamente para no saturar la memoria RAM
    }
  });
}

/**
 * 2. FASE ONLINE (CRON): Se ejecuta en tu Background Task de Expo.
 * Lee el contexto de la traza guardado en SQLite y reanuda la cadena hacia el backend.
 */
export async function procesarColaSincronizacion(registroCola: {
  payload: string;
  trace_context: string;
}) {
  // Extraer el mapa de contexto guardado hace horas/días en el celular
  const savedContextMap = JSON.parse(registroCola.trace_context);
  const parentContext: Context = propagation.extract(ROOT_CONTEXT, savedContextMap);

  // Crear un Span hijo cuyo padre jerárquico es la acción offline original del usuario
  await tracer.startActiveSpan(
    "cron_flush_to_odoo",
    { parent: parentContext },
    async (span) => {
      try {
        const networkCarrier: Record<string, string> = {};
        propagation.inject(trace.context.active(), networkCarrier);

        // Petición HTTP que recibirá tu cluster de Kubernetes (odoo-v18-mitren-bolivia)
        const response = await fetch("https://odoo-api.sincpro.com/v1/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...networkCarrier, // Envía la cabecera HTTP estándar 'traceparent'
          },
          body: registroCola.payload,
        });

        if (!response.ok) throw new Error(`Server error: ${response.status}`);

        // db.execute('DELETE FROM odoo_sync_queue WHERE id = ?', [registroCola.id]);
      } catch (error: any) {
        span.recordException(error);
        throw error; // Reintento manejado por tu estrategia Backoff del cron
      } finally {
        span.end();
      }
    },
  );
}
```

---

## 3. Ventajas de este Enfoque Mantenido

1. **Garantía ante Cambios Rompedores (Breaking Changes):** Al actualizar las versiones del SDK de Expo, la captura de fallos de memoria nativos (iOS/Android) y excepciones JS queda delegada al equipo de Grafana, reduciendo drásticamente la deuda técnica de mantenimiento de `sincpro_mobile`.
2. **Cero Doble Escritura Ineficiente:** El SDK de Faro procesa los eventos en buffers óptimos antes de entregarlos al método `send()`, permitiendo transacciones limpias hacia tu base de datos de telemetría.
3. **Formato Nativo para Grafana Alloy:** Al usar la estructura oficial de Faro e OpenTelemetry, los payloads JSON son nativamente compatibles con los parsers y regex que ya tienes configurados en el ConfigMap de tu infraestructura Alloy corporativa.
