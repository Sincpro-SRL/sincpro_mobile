import { EWebViewMessageType, type IInjectedScript } from "@sincpro/mobile/domain/webview";

const HTML2CANVAS_CDN =
  "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";

const CANVAS_SCALE = 2.0;

function createPrintInterceptor(): IInjectedScript {
  return {
    name: "print_interceptor",
    script: `
    (function() {
      if (window.__printInterceptorLoaded) return;
      window.__printInterceptorLoaded = true;

      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'DEBUG_PRINT',
          debug: { message: 'Script started', ts: Date.now() }
        }));
      } catch(e) {}

      var CANVAS_SCALE = ${CANVAS_SCALE};

      function loadHtml2Canvas() {
        return new Promise(function(resolve, reject) {
          if (window.html2canvas) {
            resolve(window.html2canvas);
            return;
          }
          var script = document.createElement('script');
          script.src = '${HTML2CANVAS_CDN}';
          script.onload = function() { resolve(window.html2canvas); };
          script.onerror = function() { reject(new Error('Failed to load html2canvas')); };
          document.head.appendChild(script);
        });
      }

      function captureElement(element) {
        return loadHtml2Canvas().then(function(html2canvas) {
          return html2canvas(element, {
            backgroundColor: '#ffffff',
            scale: CANVAS_SCALE,
            useCORS: true,
            allowTaint: true,
            logging: false
          });
        });
      }

      function findPrintableElement() {
        var selectors = ['.sp-printable-roll', '.pos-receipt', '.o_report_layout_standard', '.page', '.sheet'];
        for (var i = 0; i < selectors.length; i++) {
          var el = document.querySelector(selectors[i]);
          if (el) return el;
        }
        return document.body;
      }

      var originalPrint = window.print;
      window.print = function() {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'DEBUG_PRINT',
            debug: { message: 'print() called', ts: Date.now() }
          }));
        } catch(e) {}
        
        var element = findPrintableElement();
        
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'DEBUG_PRINT',
            debug: { 
              message: 'Element: ' + element.tagName + '.' + (element.className || 'no-class'),
              w: element.offsetWidth,
              h: element.offsetHeight
            }
          }));
        } catch(e) {}
        
        captureElement(element).then(function(canvas) {
          var base64 = canvas.toDataURL('image/png').replace('data:image/png;base64,', '');
          
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: '${EWebViewMessageType.PRINT_IMAGE}',
            image: base64,
            width: canvas.width,
            height: canvas.height,
            metadata: {
              url: window.location.href,
              title: document.title,
              capturedAt: new Date().toISOString()
            }
          }));
        }).catch(function(error) {
          try {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'DEBUG_PRINT',
              debug: { message: 'ERROR: ' + error.message }
            }));
          } catch(e) {}
          originalPrint.call(window);
        });
      };

      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: '${EWebViewMessageType.INJECTION_READY}',
          injector: 'PrintInterceptor'
        }));
      } catch(e) {}

      true;
    })();
  `,
  };
}

function createContentHeightReporter(): IInjectedScript {
  return {
    name: "content_height_reporter",
    script: `
    (function() {
      function reportHeight() {
        var height = document.body.scrollHeight || document.documentElement.scrollHeight;
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: '${EWebViewMessageType.CONTENT_READY}',
          height: height
        }));
      }

      setTimeout(reportHeight, 200);
      true;
    })();
  `,
  };
}

function createAjaxInterceptor(): IInjectedScript {
  return {
    name: "ajax_interceptor",
    script: `
    (function() {
      var originalFetch = window.fetch;
      window.fetch = function(url, options) {
        return originalFetch.apply(this, arguments).then(function(response) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: '${EWebViewMessageType.AJAX_INTERCEPTED}',
            url: typeof url === 'string' ? url : url.url,
            method: options?.method || 'GET'
          }));
          return response;
        });
      };
      true;
    })();
  `,
  };
}

class WebViewAdapterImpl {
  readonly printInterceptor = createPrintInterceptor();
  readonly contentHeightReporter = createContentHeightReporter();
  readonly ajaxInterceptor = createAjaxInterceptor();

  getDefaultInterceptors(): IInjectedScript[] {
    return [this.printInterceptor];
  }

  getAllInterceptors(): IInjectedScript[] {
    return [this.printInterceptor, this.ajaxInterceptor];
  }
}

export const WebViewAdapter = new WebViewAdapterImpl();
