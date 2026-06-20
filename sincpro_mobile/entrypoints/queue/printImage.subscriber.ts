import { PrintImageRequestedEvent } from "../../domain/print";
import { Subscriber } from "../../domain/subscriber";
import { DomainValidationError } from "../../exceptions";
import { printerService } from "../../services/printer.service";

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
