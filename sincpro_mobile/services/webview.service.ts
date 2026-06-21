import {
  EWebViewMessageType,
  type IAjaxInterceptedMessage,
  type IContentReadyMessage,
  type IInjectedScript,
  type IInjectionReadyMessage,
  type IPrintImageMessage,
  type IPrintRequestMessage,
  type TWebViewMessage,
} from "@sincpro/mobile/domain/webview";
import { safeJsonParse } from "@sincpro/mobile/tools/utils/serializer";

class WebViewService {
  private interceptors: Map<string, IInjectedScript> = new Map();

  registerInterceptor(interceptor: IInjectedScript): void {
    this.interceptors.set(interceptor.name, interceptor);
  }

  unregisterInterceptor(name: string): void {
    this.interceptors.delete(name);
  }

  getInterceptor(name: string): IInjectedScript | undefined {
    return this.interceptors.get(name);
  }

  getAllInterceptors(): IInjectedScript[] {
    return Array.from(this.interceptors.values());
  }

  combineScripts(scripts?: IInjectedScript[], additionalScript?: string): string {
    const parts: string[] = [];

    if (scripts) {
      for (const script of scripts) {
        parts.push(script.script);
      }
    }

    if (additionalScript) {
      parts.push(additionalScript);
    }

    return parts.join("\n\n");
  }

  parseMessage(rawData: string): TWebViewMessage | null {
    try {
      const parsed = safeJsonParse(rawData) as TWebViewMessage;
      if (!parsed || !parsed.type) return null;

      const validTypes = Object.values(EWebViewMessageType);
      if (!validTypes.includes(parsed.type as EWebViewMessageType)) return null;

      return parsed;
    } catch {
      return null;
    }
  }

  isPrintRequest(msg: TWebViewMessage): msg is IPrintRequestMessage {
    return msg.type === EWebViewMessageType.PRINT_REQUEST;
  }

  isPrintImage(msg: TWebViewMessage): msg is IPrintImageMessage {
    return msg.type === EWebViewMessageType.PRINT_IMAGE;
  }

  isContentReady(msg: TWebViewMessage): msg is IContentReadyMessage {
    return msg.type === EWebViewMessageType.CONTENT_READY;
  }

  isInjectionReady(msg: TWebViewMessage): msg is IInjectionReadyMessage {
    return msg.type === EWebViewMessageType.INJECTION_READY;
  }

  isAjaxIntercepted(msg: TWebViewMessage): msg is IAjaxInterceptedMessage {
    return msg.type === EWebViewMessageType.AJAX_INTERCEPTED;
  }
}

export const webViewService = new WebViewService();
