import { safeJsonParse } from "@sincpro/mobile/tools/utils/serializer";

/** A message a page posted with `window.ReactNativeWebView.postMessage(JSON.stringify(...))`. */
export type WebViewMessage = { type: string } & Record<string, unknown>;
export type WebViewMessageHandler = (message: WebViewMessage) => void | Promise<void>;

const handlers = new Map<string, WebViewMessageHandler>();

/**
 * Handles one message type posted by a page. A later registration for the same type replaces
 * the earlier one: the core registers its defaults first, so an app's handler wins.
 */
export function registerWebViewHandler(
  type: string,
  handler: WebViewMessageHandler,
): () => void {
  handlers.set(type, handler);
  return () => {
    if (handlers.get(type) === handler) handlers.delete(type);
  };
}

/** Routes a raw message to the handler of its type. Resolves `false` when nobody handles it. */
export async function dispatchWebViewMessage(raw: string): Promise<boolean> {
  let message: WebViewMessage | null;
  try {
    message = safeJsonParse(raw) as WebViewMessage | null;
  } catch {
    // A page can post any string; only JSON with a `type` is a message for a handler.
    return false;
  }
  if (!message || typeof message.type !== "string") return false;
  const handler = handlers.get(message.type);
  if (!handler) return false;
  await handler(message);
  return true;
}

/** Removes every handler; for tests. */
export function clearWebViewHandlers(): void {
  handlers.clear();
}
