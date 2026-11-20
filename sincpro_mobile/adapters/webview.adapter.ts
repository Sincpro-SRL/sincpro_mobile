import { EWebViewMessageType, type IInjectedScript } from "@sincpro/mobile/domain/webview";

const HTML2CANVAS_CDN =
  "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";

const CANVAS_SCALE = 2.0;

/** Where a page keeps what it prints when it says so: `<div data-print-root>`. */
export const DEFAULT_PRINT_ROOTS: readonly string[] = ["[data-print-root]"];

/**
 * The containers `printInterceptor` looked for before a page could be told where it prints:
 * Odoo's. Kept only for `printInterceptor` until mobile-odoo passes its own roots.
 */
const LEGACY_PRINT_ROOTS: readonly string[] = [
  ".sp-printable-roll",
  ".pos-receipt",
  ".o_report_layout_standard",
  ".page",
  ".sheet",
];

export interface PrintInterceptorOptions {
  /**
   * Selectors of the element that holds what the page prints, tried in order; the first found
   * is captured, else the whole body. An app passes its pages' own (Odoo's, in mobile-odoo).
   */
  roots?: readonly string[];
}

/**
 * The script that takes the place of `window.print()` in a WebView: it captures what the page
 * prints with html2canvas, one image per page, and posts each to the app.
 *
 * 1. What prints is the first element `roots` finds, else the body.
 * 2. Its pages, in order: the elements marked `data-print-page`; else the siblings a CSS page
 *    break separates (`break-after` / `break-before: page`, `page-break-*: always`), as a browser
 *    prints them; else the whole element, one page.
 * 3. Each page is captured after the one before, so a long print never holds every canvas at
 *    once; a page of several siblings is captured from a copy of them.
 * Final: PRINT_STARTED with how many pages, then one PRINT_IMAGE per page (`page` of `pages`),
 *    or PRINT_FAILED — all with one job id, so the app follows them in one notice.
 */
export function createPrintInterceptor(
  options: PrintInterceptorOptions = {},
): IInjectedScript {
  const roots = options.roots ?? DEFAULT_PRINT_ROOTS;
  return {
    name: "print_interceptor",
    script: `
    (function() {
      if (window.__printInterceptorLoaded) return;
      window.__printInterceptorLoaded = true;

      function post(message) {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify(message));
        } catch(e) {}
      }

      post({ type: 'DEBUG_PRINT', debug: { message: 'Script started', ts: Date.now() } });

      var CANVAS_SCALE = ${CANVAS_SCALE};
      var ROOTS = ${JSON.stringify(roots)};
      var PAGE_BREAKS = ['page', 'always', 'left', 'right', 'recto', 'verso'];

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

      function findPrintableElement() {
        for (var i = 0; i < ROOTS.length; i++) {
          var el = document.querySelector(ROOTS[i]);
          if (el) return el;
        }
        return document.body;
      }

      function breaks(el, side) {
        var style = window.getComputedStyle(el);
        var modern = side === 'after' ? style.breakAfter : style.breakBefore;
        var legacy = side === 'after' ? style.pageBreakAfter : style.pageBreakBefore;
        return PAGE_BREAKS.indexOf(modern) >= 0 || PAGE_BREAKS.indexOf(legacy) >= 0;
      }

      function shown(group) {
        for (var i = 0; i < group.length; i++) {
          if (group[i].getClientRects().length > 0) return true;
        }
        return false;
      }

      // The pages of what prints, each a list of sibling elements.
      function pagesOf(root) {
        var marked = root.querySelectorAll('[data-print-page]');
        if (marked.length > 0) {
          return Array.prototype.map.call(marked, function(el) { return [el]; });
        }
        var all = root.querySelectorAll('*');
        var first = null;
        for (var i = 0; i < all.length && !first; i++) {
          if (breaks(all[i], 'after') || breaks(all[i], 'before')) first = all[i];
        }
        if (!first || !first.parentElement) return [[root]];
        var groups = [];
        var current = [];
        var children = first.parentElement.children;
        for (var j = 0; j < children.length; j++) {
          var child = children[j];
          if (breaks(child, 'before') && current.length > 0) {
            groups.push(current);
            current = [];
          }
          current.push(child);
          if (breaks(child, 'after')) {
            groups.push(current);
            current = [];
          }
        }
        if (current.length > 0) groups.push(current);
        groups = groups.filter(shown);
        return groups.length > 0 ? groups : [[root]];
      }

      // What html2canvas captures for a page: its element, or a copy of its siblings.
      function surfaceOf(group) {
        if (group.length === 1) return { element: group[0], release: function() {} };
        var parent = group[0].parentElement;
        var wrapper = document.createElement('div');
        wrapper.style.width = parent.clientWidth + 'px';
        for (var i = 0; i < group.length; i++) wrapper.appendChild(group[i].cloneNode(true));
        parent.appendChild(wrapper);
        return { element: wrapper, release: function() { parent.removeChild(wrapper); } };
      }

      function capture(html2canvas, group) {
        var surface = surfaceOf(group);
        return html2canvas(surface.element, {
          backgroundColor: '#ffffff',
          scale: CANVAS_SCALE,
          useCORS: true,
          allowTaint: true,
          logging: false
        }).then(function(canvas) {
          surface.release();
          return canvas;
        }, function(error) {
          surface.release();
          throw error;
        });
      }

      // The app shows the print as a process: started here, then each page's image or the
      // failure. The native print() does nothing inside the app, so it is not a fallback. The
      // job id ties the messages, so the app updates one notice instead of stacking them.
      window.print = function() {
        var jobId = 'print-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        var root = findPrintableElement();
        var pages = pagesOf(root);

        post({
          type: '${EWebViewMessageType.PRINT_STARTED}',
          title: document.title,
          pages: pages.length,
          jobId: jobId
        });
        post({
          type: 'DEBUG_PRINT',
          debug: {
            message: 'Element: ' + root.tagName + '.' + (root.className || 'no-class'),
            pages: pages.length,
            w: root.offsetWidth,
            h: root.offsetHeight
          }
        });

        loadHtml2Canvas().then(function(html2canvas) {
          var chain = Promise.resolve();
          pages.forEach(function(group, index) {
            chain = chain.then(function() {
              return capture(html2canvas, group).then(function(canvas) {
                post({
                  type: '${EWebViewMessageType.PRINT_IMAGE}',
                  image: canvas.toDataURL('image/png').replace('data:image/png;base64,', ''),
                  width: canvas.width,
                  height: canvas.height,
                  page: index + 1,
                  pages: pages.length,
                  jobId: jobId,
                  metadata: {
                    url: window.location.href,
                    title: document.title,
                    capturedAt: new Date().toISOString()
                  }
                });
              });
            });
          });
          return chain;
        }).catch(function(error) {
          post({
            type: '${EWebViewMessageType.PRINT_FAILED}',
            title: document.title,
            jobId: jobId,
            reason: (error && error.message) || 'capture failed'
          });
        });
      };

      post({ type: '${EWebViewMessageType.INJECTION_READY}', injector: 'PrintInterceptor' });

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
  /**
   * @deprecated It looks for Odoo's containers. Use `printInterceptorFor({ roots })` with the
   * page's own roots — mobile-odoo passes Odoo's to its portal.
   */
  readonly printInterceptor = createPrintInterceptor({ roots: LEGACY_PRINT_ROOTS });
  readonly contentHeightReporter = createContentHeightReporter();
  readonly ajaxInterceptor = createAjaxInterceptor();

  /** The print interceptor for pages that keep what they print in one of `roots`. */
  printInterceptorFor(options: PrintInterceptorOptions = {}): IInjectedScript {
    return createPrintInterceptor(options);
  }

  getDefaultInterceptors(): IInjectedScript[] {
    return [this.printInterceptorFor()];
  }

  getAllInterceptors(): IInjectedScript[] {
    return [this.printInterceptorFor(), this.ajaxInterceptor];
  }
}

export const WebViewAdapter = new WebViewAdapterImpl();
