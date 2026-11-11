import { safeJsonParse } from "@sincpro/mobile/tools/utils/serializer";

import {
  EWebViewMessageType,
  type IInjectedScript,
  type IPrintImageMessage,
  type TWebViewMessage,
} from "./webview";

/**
 * A message a page posted, or `null`: any JSON with a string `type` passes; the handlers of its
 * type decide what it means.
 */
export function parseWebViewMessage(raw: string): TWebViewMessage | null {
  try {
    const parsed = safeJsonParse(raw) as TWebViewMessage | null;
    if (!parsed || typeof parsed.type !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isPrintImageMessage(message: TWebViewMessage): message is IPrintImageMessage {
  return message.type === EWebViewMessageType.PRINT_IMAGE;
}

/** The scripts a page runs before its content, then the screen's own, as one. */
export function combineScripts(
  scripts?: IInjectedScript[],
  additionalScript?: string,
): string {
  const parts = (scripts ?? []).map((script) => script.script);
  if (additionalScript) parts.push(additionalScript);
  return parts.join("\n\n");
}
