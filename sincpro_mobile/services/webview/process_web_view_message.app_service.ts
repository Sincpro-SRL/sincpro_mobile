import { Command } from "@sincpro/client-framework";
import {
  EWebViewMessageType,
  type IPrintImageMessage,
  type TWebViewMessage,
} from "@sincpro/mobile/domain/webview";
import {
  ApplicationService,
  commonBoundedContext,
} from "@sincpro/mobile/infrastructure/framework";
import { CommandQueuePrint } from "@sincpro/mobile/services/printer/print_jobs/queue_print.feature";
import { safeJsonParse } from "@sincpro/mobile/tools/utils/serializer";

export class CommandProcessWebViewMessage extends Command<void> {
  constructor(readonly raw: string) {
    super();
  }
}

/**
 * A message a page posted:
 * 1. It is read; anything that is not JSON with a string `type` is ignored.
 * 2. Anything that is not a print image is ignored.
 * Final: the image is queued to print (`CommandQueuePrint`, a child of this run).
 */
@commonBoundedContext.appService(CommandProcessWebViewMessage)
export class ProcessWebViewMessage extends ApplicationService<
  CommandProcessWebViewMessage,
  void
> {
  async execute(command: CommandProcessWebViewMessage): Promise<void> {
    const message = this.read(command.raw);
    this.span.set({ "webview.message": message?.type ?? "unreadable" });
    if (!message || !this.isPrintImage(message)) return;
    await this.featureBus.execute(
      new CommandQueuePrint(
        message.image,
        message.width,
        message.height,
        message.metadata.title,
        message.jobId ?? "",
      ),
    );
  }

  private read(raw: string): TWebViewMessage | null {
    try {
      const parsed = safeJsonParse(raw) as TWebViewMessage | null;
      return parsed && typeof parsed.type === "string" ? parsed : null;
    } catch {
      return null;
    }
  }

  private isPrintImage(message: TWebViewMessage): message is IPrintImageMessage {
    return message.type === EWebViewMessageType.PRINT_IMAGE;
  }
}
