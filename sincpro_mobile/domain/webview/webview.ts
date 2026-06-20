export enum EWebViewMessageType {
  PRINT_REQUEST = "PRINT_REQUEST",
  PRINT_IMAGE = "PRINT_IMAGE",
  CONTENT_READY = "CONTENT_READY",
  INJECTION_READY = "INJECTION_READY",
  AJAX_INTERCEPTED = "AJAX_INTERCEPTED",
  DEBUG_PRINT = "DEBUG_PRINT",
}

export type TPrintSource = "pos-receipt" | "report" | "document" | "unknown";

export interface IWebViewMetadata {
  url: string;
  title: string;
  capturedAt: string;
}

export interface IPrintRequestMessage {
  type: EWebViewMessageType.PRINT_REQUEST;
  source: TPrintSource;
  content: string;
  metadata: IWebViewMetadata;
}

export interface IPrintImageMessage {
  type: EWebViewMessageType.PRINT_IMAGE;
  image: string;
  width: number;
  height: number;
  metadata: IWebViewMetadata;
}

export interface IContentReadyMessage {
  type: EWebViewMessageType.CONTENT_READY;
  height: number;
}

export interface IInjectionReadyMessage {
  type: EWebViewMessageType.INJECTION_READY;
  injector: string;
}

export interface IAjaxInterceptedMessage {
  type: EWebViewMessageType.AJAX_INTERCEPTED;
  url: string;
  method: string;
  response?: unknown;
}

export interface IDebugPrintMessage {
  type: EWebViewMessageType.DEBUG_PRINT;
  debug: {
    tagName: string;
    className: string;
    id: string;
    width: number;
    height: number;
    isBody: boolean;
  };
}

export type TWebViewMessage =
  | IPrintRequestMessage
  | IPrintImageMessage
  | IContentReadyMessage
  | IInjectionReadyMessage
  | IAjaxInterceptedMessage
  | IDebugPrintMessage;

export interface IInjectedScript {
  name: string;
  script: string;
}
