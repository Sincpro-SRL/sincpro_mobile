/**
 * How a print of more than one page reaches the printer. A print of one page is printed as it
 * comes, whatever the mode.
 */
export enum EPrintPages {
  /** The person chooses: everything at once, or one page at a time. */
  ASK = "ask",
  /** One page at a time: the first prints at once, each next one when the person asks. */
  STEP = "step",
  /** Every page at once, nobody asked. */
  ALL = "all",
}

/** Which pages of a job go to the printer now: the next one, or all that are left. */
export enum EPrintJobScope {
  NEXT = "next",
  REST = "rest",
}

/** One page of a print job: the image the printer prints. */
export interface PrintPage {
  /** PNG in base64, without the `data:` prefix. */
  readonly image: string;
  readonly width: number;
  readonly height: number;
}

/**
 * A print of N pages and how far it went. The pages go to the printer in order: `printed` of
 * them already went, so the next one is `printed + 1`.
 */
export interface PrintJob {
  readonly id: string;
  readonly title: string;
  readonly total: number;
  readonly printed: number;
}

/**
 * Where print jobs wait — kept on the device, so a job half printed is still there when the
 * app opens again. A job is either arriving (its pages still coming, one by one) or ready.
 */
export interface PrintJobStore {
  /** Keeps one page of a job that is arriving, and the job itself with its first page. */
  addPage(
    job: Pick<PrintJob, "id" | "title" | "total">,
    page: number,
    content: PrintPage,
  ): Promise<void>;
  /**
   * The job is ready once every page arrived. `true` only for the call that made it ready: two
   * pages arriving at once never make it ready twice.
   */
  markReady(jobId: string): Promise<boolean>;
  /** A ready job, or `null` when it is not there (finished, cancelled) or still arriving. */
  find(jobId: string): Promise<PrintJob | null>;
  /** Pages `from` to `to`, both included, counted from 1. */
  pages(jobId: string, from: number, to: number): Promise<PrintPage[]>;
  /**
   * Moves how many pages went to the printer from `from` to `to`. `false` when it is no longer
   * `from` — someone else moved it first — so a page never goes twice.
   */
  advance(jobId: string, from: number, to: number): Promise<boolean>;
  /** Forgets the job and its pages. */
  remove(jobId: string): Promise<void>;
  /** The ready jobs, oldest first. */
  ready(): Promise<PrintJob[]>;
  /** Forgets the jobs whose pages never all arrived; answers how many. */
  discardArriving(): Promise<number>;
}

/** What the person sees of a job waiting for them: where it is, and the page that prints next. */
export interface PrintJobOffer {
  readonly job: PrintJob;
  readonly next: PrintPage | null;
}

/**
 * How a use case puts a job in front of the person — the port a Feature holds instead of
 * reaching the UI: on a phone, the sheet the AppShell mounts; in a test, a list.
 */
export interface PrintJobPrompt {
  /** Shows the job, or its new state. */
  show(offer: PrintJobOffer): void;
  /** The job no longer waits for the person. */
  close(jobId: string): void;
}
