import { Command } from "@sincpro/client-framework";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";
import { whyNotPrinted } from "@sincpro/mobile/services/print/notices";
import { PRINT_NOTICE_ACTIONS } from "@sincpro/mobile/services/printer.service";

export class CommandPrintTestPage extends Command<void> {}

/**
 * A short page that proves the printer works. It came out: the person is told. It did not: the
 * person reads why — no printer chosen, Bluetooth not granted, or the printer off — and the
 * failure keeps its kind.
 */
@commonBoundedContext.feature(CommandPrintTestPage)
export class PrintTestPage extends Feature<CommandPrintTestPage, void> {
  async execute(): Promise<void> {
    try {
      await this.printer.printTestPage();
    } catch (error) {
      this.notifier.notify({
        name: "printer.test_failed",
        title: "No se imprimió la página de prueba",
        message: whyNotPrinted(error, ""),
        variant: "danger",
        actions: [PRINT_NOTICE_ACTIONS.printer],
      });
      throw error;
    }
    this.notifier.notify({
      name: "printer.test_ok",
      title: "Impresión exitosa",
      message: "Página de prueba impresa",
      variant: "success",
    });
  }
}
