import { PrintImageRequestedEvent } from "@sincpro/mobile/domain/print";
import { Subscriber } from "@sincpro/mobile/domain/subscriber";
import { DomainValidationError } from "@sincpro/mobile/exceptions";
import { printerService } from "@sincpro/mobile/services/printer.service";

export class PrintImageSubscriber extends Subscriber {
  public readonly requiresAuth = false;
  listen = [PrintImageRequestedEvent];

  async process(event: PrintImageRequestedEvent): Promise<void> {
    if (!(await printerService.isConnected())) {
      throw new DomainValidationError("No printer connected");
    }
    await printerService.printImageBase64(event.imageBase64);
  }
}
