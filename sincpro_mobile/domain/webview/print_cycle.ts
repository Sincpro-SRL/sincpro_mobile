import { EWebViewMessageType, type TWebViewMessage } from "./webview";

export interface PrintCycleHandlers {
  started(title: string): void;
  failed(title: string, reason: string): void;
  image(input: {
    imageBase64: string;
    width: number;
    height: number;
    title: string;
  }): Promise<void>;
}

/**
 * Routes one message of the print interceptor:
 * 1. PRINT_STARTED: the capture is running.
 * 2. PRINT_IMAGE with an image: it goes to the printer.
 * 3. PRINT_FAILED: the capture failed before reaching the printer.
 * Final: resolves `false` for anything that is not part of the print cycle.
 */
export async function routePrintMessage(
  msg: TWebViewMessage | null,
  handlers: PrintCycleHandlers,
): Promise<boolean> {
  if (!msg) return false;
  if (msg.type === EWebViewMessageType.PRINT_STARTED) {
    handlers.started(msg.title ?? "");
    return true;
  }
  if (msg.type === EWebViewMessageType.PRINT_FAILED) {
    handlers.failed(msg.title ?? "", msg.reason ?? "");
    return true;
  }
  if (msg.type !== EWebViewMessageType.PRINT_IMAGE || !msg.image) return false;
  await handlers.image({
    imageBase64: msg.image,
    width: msg.width,
    height: msg.height,
    title: msg.metadata?.title ?? "",
  });
  return true;
}
