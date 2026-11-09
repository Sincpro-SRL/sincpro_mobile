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
import { replaceable } from "@sincpro/mobile/framework/replaceable";
import { dispatchWebViewMessage } from "@sincpro/mobile/infrastructure/webview/message_handlers";
import { safeJsonParse } from "@sincpro/mobile/tools/utils/serializer";

export class WebViewService {
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

  /**
   * Routes a message posted by the page to the handler of its `type`: the core's (the print
   * cycle) or any an app registered with `DomainModule.webViewHandlers()`.
   */
  handleMessage(rawData: string): Promise<boolean> {
    return dispatchWebViewMessage(rawData);
  }

  /** @deprecated Use `handleMessage`: printing is one more message handler. */
  handlePrintMessage(rawData: string): Promise<boolean> {
    return this.handleMessage(rawData);
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

const webViewServiceSlot = replaceable(new WebViewService());

/** Swaps the implementation for a subclass, for the whole app and the core. */
export function setWebViewService(service: WebViewService): void {
  webViewServiceSlot.set(service);
}

export const webViewService: WebViewService = webViewServiceSlot.instance;
