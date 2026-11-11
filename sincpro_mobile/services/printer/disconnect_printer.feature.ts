import { Command } from "@sincpro/client-framework";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

export class CommandDisconnectPrinter extends Command<void> {}

/** Disconnects the printer on purpose: nothing reconnects it until the person connects again. */
@commonBoundedContext.feature(CommandDisconnectPrinter)
export class DisconnectPrinter extends Feature<CommandDisconnectPrinter, void> {
  async execute(): Promise<void> {
    await this.printer.disconnect();
    this.notifier.notify({
      name: "printer.disconnected",
      title: "Desconectado",
      message: "Impresora desconectada",
      variant: "info",
    });
  }
}
