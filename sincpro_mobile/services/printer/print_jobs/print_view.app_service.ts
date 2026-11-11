import { Command } from "@sincpro/client-framework";
import {
  ApplicationService,
  commonBoundedContext,
} from "@sincpro/mobile/infrastructure/framework";
import { CommandPrintImage } from "@sincpro/mobile/services/printer/print_jobs/print_image.feature";
import type { RefObject } from "react";
import type { View } from "react-native";

/**
 * A mounted view to print — a receipt on screen. It never leaves the process: the Command holds
 * the view, not its image, so it is executed, never queued.
 */
export class CommandPrintView extends Command<void> {
  constructor(
    readonly view: RefObject<View | null>,
    readonly title: string = "",
  ) {
    super();
  }
}

/**
 * A view on screen printed as an image:
 * 1. The view is captured; one that cannot be captured fails `internal` — a fault, reported.
 * Final: the image goes through the print use case (`CommandPrintImage`), a child of this run.
 */
@commonBoundedContext.appService(CommandPrintView)
export class PrintView extends ApplicationService<CommandPrintView, void> {
  async execute(command: CommandPrintView): Promise<void> {
    const image = await this.printer.captureView(command.view);
    await this.featureBus.execute(new CommandPrintImage(image, command.title));
  }
}
