import { Command } from "@sincpro/client-framework";
import type { Notice } from "@sincpro/mobile/domain/notifier";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

/** Where the app's log lines and spans are sent: now, answering how many still wait. */
export type TelemetryDelivery = { deliverNow(): Promise<number | null> };

export class CommandSendErrorReport extends Command<number | null> {}

const SENT: Notice = {
  name: "report.sent",
  title: "Reporte enviado",
  message: "El equipo de soporte ya puede ver el error",
  variant: "success",
};

const WAITING: Notice = {
  name: "report.waiting",
  title: "Reporte guardado",
  message: "Se enviará cuando haya conexión",
  variant: "info",
};

const NOT_SENT: Notice = {
  name: "report.unavailable",
  title: "Reporte no disponible",
  message: "Esta versión de la app no envía registros",
  variant: "warning",
};

/**
 * Sends what the app logged — the error the person just saw among it — now, instead of with the
 * next batch; answers how many lines and spans still wait:
 * 1. A build that sends nothing: the person is told so.
 * 2. Everything left: the person is told it was sent; something still waiting (offline): that it
 *    leaves when there is a connection.
 */
@commonBoundedContext.feature(CommandSendErrorReport)
export class SendErrorReport extends Feature<CommandSendErrorReport, number | null> {
  async execute(): Promise<number | null> {
    const waiting = await this.telemetry.deliverNow();
    this.span.set({ "telemetry.waiting": waiting ?? -1 });
    this.notifier.notify(waiting === null ? NOT_SENT : waiting === 0 ? SENT : WAITING);
    return waiting;
  }
}
