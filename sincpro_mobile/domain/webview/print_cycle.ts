import { EWebViewMessageType, type TWebViewMessage } from "./webview";

export interface PrintCycleHandlers {
  started(title: string, jobId?: string): void | Promise<void>;
  failed(title: string, reason: string, jobId?: string): void | Promise<void>;
  image(input: {
    imageBase64: string;
    width: number;
    height: number;
    title: string;
    jobId?: string;
  }): Promise<void>;
}

/**
 * Routes one message of the print interceptor:
 * 1. PRINT_STARTED: the capture is running.
 * 2. PRINT_IMAGE with an image: it goes to the printer.
 * 3. PRINT_FAILED: the capture failed before reaching the printer.
 * Final: resolves `false` for anything that is not part of the print cycle. Every step carries
 * the page's `jobId`, so the three of them update the same notice.
 */
export async function routePrintMessage(
  msg: TWebViewMessage | null,
  handlers: PrintCycleHandlers,
): Promise<boolean> {
  if (!msg) return false;
  if (msg.type === EWebViewMessageType.PRINT_STARTED) {
    await handlers.started(msg.title ?? "", msg.jobId);
    return true;
  }
  if (msg.type === EWebViewMessageType.PRINT_FAILED) {
    await handlers.failed(msg.title ?? "", msg.reason ?? "", msg.jobId);
    return true;
  }
  if (msg.type !== EWebViewMessageType.PRINT_IMAGE || !msg.image) return false;
  await handlers.image({
    imageBase64: msg.image,
    width: msg.width,
    height: msg.height,
    title: msg.metadata?.title ?? "",
    jobId: msg.jobId,
  });
  return true;
}

/** The notice of one print job: preparing, printing and the result share it. */
export function printNoticeKey(jobId: string): string {
  return `print:${jobId}`;
}
