import { Command, newEntityId } from "@sincpro/client-framework";
import { printNoticeKey } from "@sincpro/mobile/domain/webview/print_cycle";
import {
  ApplicationService,
  commonBoundedContext,
  Feature,
} from "@sincpro/mobile/infrastructure/framework";
import { printFollowed } from "@sincpro/mobile/services/print/notices";
import { CommandPrintImage } from "@sincpro/mobile/services/print/print_image.feature";
import type { RefObject } from "react";
import type { View } from "react-native";

export class CommandPrintHtml extends Command<void> {
  constructor(
    readonly html: string,
    readonly title: string = "",
  ) {
    super();
  }
}

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

/** HTML rendered at the thermal width and printed, followed in its own notice. */
@commonBoundedContext.feature(CommandPrintHtml)
export class PrintHtml extends Feature<CommandPrintHtml, void> {
  async execute(command: CommandPrintHtml): Promise<void> {
    this.span.set({ "print.title": command.title });
    await printFollowed(
      this.notifier,
      { key: printNoticeKey(newEntityId()), title: command.title },
      () => this.printer.printHtml(command.html),
    );
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
