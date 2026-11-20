import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";

import { WebViewAdapter } from "../../sincpro_mobile/adapters/webview.adapter.ts";
import type { IInjectedScript } from "../../sincpro_mobile/domain/webview/index.ts";

type Breaks = { after?: string; before?: string };
type Posted = { type: string } & Record<string, unknown>;

/** The little of the DOM the print interceptor reads: a tree, attributes, page breaks. */
class FakeElement {
  tagName = "DIV";
  className = "";
  clientWidth = 272;
  offsetWidth = 272;
  offsetHeight = 100;
  parentElement: FakeElement | null = null;
  children: FakeElement[] = [];
  readonly attributes = new Set<string>();
  readonly style: Record<string, string> = {};
  shown = true;

  constructor(
    readonly name: string,
    readonly breaks: Breaks = {},
  ) {}

  with(...children: FakeElement[]): this {
    for (const child of children) this.appendChild(child);
    return this;
  }

  marked(attribute: string): this {
    this.attributes.add(attribute);
    return this;
  }

  hidden(): this {
    this.shown = false;
    return this;
  }

  appendChild(child: FakeElement): FakeElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child: FakeElement): FakeElement {
    this.children = this.children.filter((one) => one !== child);
    child.parentElement = null;
    return child;
  }

  cloneNode(deep: boolean): FakeElement {
    const copy = new FakeElement(this.name, this.breaks);
    for (const attribute of this.attributes) copy.attributes.add(attribute);
    if (deep) for (const child of this.children) copy.appendChild(child.cloneNode(true));
    return copy;
  }

  getClientRects(): object[] {
    return this.shown ? [{}] : [];
  }

  descendants(): FakeElement[] {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }

  matches(selector: string): boolean {
    if (selector.startsWith("."))
      return this.className.split(" ").includes(selector.slice(1));
    if (selector.startsWith("[")) return this.attributes.has(selector.slice(1, -1));
    return false;
  }

  querySelectorAll(selector: string): FakeElement[] {
    const all = this.descendants();
    return selector === "*" ? all : all.filter((one) => one.matches(selector));
  }
}

function el(name: string, breaks: Breaks = {}): FakeElement {
  return new FakeElement(name, breaks);
}

/** What a capture of `element` shows: its name, or the names inside the copy of a group. */
function drawn(element: FakeElement): string {
  return element.name === "wrapper"
    ? element.children.map((child) => child.name).join("+")
    : element.name;
}

/**
 * Runs the script in a page whose body is `body`, calls `window.print()` and answers what it
 * posted to the app and what html2canvas was asked to draw.
 */
async function printPage(
  interceptor: IInjectedScript,
  body: FakeElement,
  options: { failAt?: number } = {},
): Promise<{ posted: Posted[]; drawnPages: string[] }> {
  const posted: Posted[] = [];
  const drawnPages: string[] = [];
  const document = {
    title: "Punto de venta tickets",
    body,
    head: { appendChild: () => undefined },
    createElement: () => el("wrapper"),
    querySelector: (selector: string) =>
      body.descendants().find((one) => one.matches(selector)) ?? null,
  };
  const window: Record<string, unknown> = {
    location: { href: "https://portal.test/pos" },
    ReactNativeWebView: { postMessage: (raw: string) => posted.push(JSON.parse(raw)) },
    getComputedStyle: (element: FakeElement) => ({
      breakAfter: element.breaks.after ?? "auto",
      breakBefore: element.breaks.before ?? "auto",
      pageBreakAfter: "auto",
      pageBreakBefore: "auto",
    }),
    html2canvas: async (element: FakeElement) => {
      if (options.failAt === drawnPages.length + 1) throw new Error("tainted canvas");
      drawnPages.push(drawn(element));
      return {
        width: 544,
        height: 300,
        toDataURL: () => `data:image/png;base64,${drawn(element)}`,
      };
    },
  };
  vm.runInNewContext(interceptor.script, { window, document, Promise, Date, Math, JSON });
  (window.print as () => void)();
  for (let tick = 0; tick < 50; tick += 1) await new Promise(setImmediate);
  return { posted: posted.filter((one) => one.type !== "DEBUG_PRINT"), drawnPages };
}

const ofType = (posted: Posted[], type: string) => posted.filter((one) => one.type === type);

test("a page of N tickets, each ending in a page break, prints one image per ticket, in order", async () => {
  const roll = el("roll").with(
    el("node").with(
      el("ticket-48", { after: "page" }),
      el("ticket-47", { after: "page" }),
      el("ticket-46", { after: "page" }),
    ),
  );
  roll.className = "sp-printable-roll overflow-y-auto";
  const body = el("body").with(el("toolbar"), roll);

  const { posted, drawnPages } = await printPage(WebViewAdapter.printInterceptor, body);

  assert.deepEqual(drawnPages, ["ticket-48", "ticket-47", "ticket-46"]);
  const [started] = ofType(posted, "PRINT_STARTED");
  assert.equal(started.pages, 3);
  const images = ofType(posted, "PRINT_IMAGE");
  assert.deepEqual(
    images.map((image) => [image.page, image.pages, image.image]),
    [
      [1, 3, "ticket-48"],
      [2, 3, "ticket-47"],
      [3, 3, "ticket-46"],
    ],
  );
  assert.ok(
    images.every((image) => image.jobId === started.jobId),
    "one job, one notice",
  );
  assert.equal(ofType(posted, "PRINT_FAILED").length, 0);
});

test("the elements marked data-print-page are the pages; a hidden one does not print", async () => {
  const body = el("body").with(
    el("root")
      .marked("data-print-root")
      .with(
        el("page-a").marked("data-print-page"),
        el("aside"),
        el("page-b").marked("data-print-page"),
      ),
    el("elsewhere", { after: "page" }),
  );

  const { drawnPages } = await printPage(WebViewAdapter.printInterceptorFor(), body);
  assert.deepEqual(drawnPages, ["page-a", "page-b"]);

  const withHidden = el("body").with(
    el("root").with(
      el("ticket-1", { after: "page" }),
      el("template", { after: "page" }).hidden(),
      el("ticket-2", { after: "page" }),
    ),
  );
  const pages = await printPage(
    WebViewAdapter.printInterceptorFor({ roots: [] }),
    withHidden,
  );
  assert.deepEqual(pages.drawnPages, ["ticket-1", "ticket-2"]);
});

test("a print with no page break is one image of what it prints, as before", async () => {
  const body = el("body").with(el("receipt").marked("data-print-root").with(el("line")));

  const { posted, drawnPages } = await printPage(WebViewAdapter.printInterceptorFor(), body);

  assert.deepEqual(drawnPages, ["receipt"]);
  const images = ofType(posted, "PRINT_IMAGE");
  assert.deepEqual(
    images.map((image) => [image.page, image.pages]),
    [[1, 1]],
  );
});

test("siblings between page breaks print together, from a copy the page gets back", async () => {
  const node = el("node").with(
    el("header"),
    el("ticket-1", { after: "page" }),
    el("ticket-2", { before: "page" }),
    el("footer"),
  );
  const body = el("body").with(el("root").marked("data-print-root").with(node));

  const { drawnPages } = await printPage(WebViewAdapter.printInterceptorFor(), body);

  assert.deepEqual(drawnPages, ["header+ticket-1", "ticket-2+footer"]);
  assert.deepEqual(
    node.children.map((child) => child.name),
    ["header", "ticket-1", "ticket-2", "footer"],
    "the copy drawn for a group leaves the page as it was",
  );
});

test("a page that cannot be drawn fails the print, under its job", async () => {
  const body = el("body").with(
    el("root")
      .marked("data-print-root")
      .with(el("ticket-1", { after: "page" }), el("ticket-2", { after: "page" })),
  );

  const { posted } = await printPage(WebViewAdapter.printInterceptorFor(), body, {
    failAt: 2,
  });

  const [started] = ofType(posted, "PRINT_STARTED");
  const [failed] = ofType(posted, "PRINT_FAILED");
  assert.equal(ofType(posted, "PRINT_IMAGE").length, 1);
  assert.equal(failed.jobId, started.jobId);
  assert.equal(failed.reason, "tainted canvas");
});
