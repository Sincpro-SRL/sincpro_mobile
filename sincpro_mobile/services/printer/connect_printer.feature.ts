import { Command } from "@sincpro/client-framework";
import { BluetoothPermissionDenied } from "@sincpro/mobile/exceptions";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";
import {
  BLUETOOTH_REQUIRED,
  PRINT_NOTICE_ACTIONS,
} from "@sincpro/mobile/services/printer/common";

export class CommandConnectPrinter extends Command<void> {
  constructor(
    readonly address: string,
    readonly name: string,
  ) {
    super();
  }
}

/**
 * Connects to a printer the person picked and keeps it as the chosen one:
 * 1. Without the Bluetooth permission: the person is told, and it fails `permission_denied`.
 * 2. A printer that does not answer: the person is told, with a way to the printer's settings,
 *    and it fails `unavailable`.
 * Final: connected — the person is told.
 */
@commonBoundedContext.feature(CommandConnectPrinter)
export class ConnectPrinter extends Feature<CommandConnectPrinter, void> {
  async execute(command: CommandConnectPrinter): Promise<void> {
    this.span.set({ "printer.name": command.name });
    try {
      await this.printer.connect(command.address, command.name);
    } catch (error) {
      this.notifyNotConnected(command.name, error);
      throw error;
    }
    this.notifier.notify({
      name: "printer.connected",
      title: "Impresora conectada",
      message: `Conectado a ${command.name}`,
      variant: "success",
    });
  }

  private notifyNotConnected(name: string, error: unknown): void {
    if (error instanceof BluetoothPermissionDenied) {
      this.notifier.notify(BLUETOOTH_REQUIRED);
      return;
    }
    this.notifier.notify({
      name: "printer.connect_failed",
      title: "Error de conexión",
      message: `No se pudo conectar a ${name}`,
      variant: "danger",
      actions: [PRINT_NOTICE_ACTIONS.printer],
    });
  }
}
