import type {
  PrintJob,
  PrintJobStore,
  PrintPage,
} from "@sincpro/mobile/domain/print/print_job";
import { DATABASE_TABLES } from "@sincpro/mobile/entrypoints/db/migrations";
import { DBCursor } from "@sincpro/mobile/infrastructure/database";

const JOBS = DATABASE_TABLES.PRINT_JOBS;
const PAGES = DATABASE_TABLES.PRINT_JOB_PAGES;

/** A job whose pages are still coming, and one ready to print. */
const ARRIVING = "arriving";
const READY = "ready";

type JobRow = { id: string; title: string; total: number; printed: number };
type PageRow = { image: string; width: number; height: number };

function jobOf(row: JobRow): PrintJob {
  return { id: row.id, title: row.title, total: row.total, printed: row.printed };
}

function pageOf(row: PageRow): PrintPage {
  return { image: row.image, width: row.width, height: row.height };
}

/**
 * The print jobs in SQLite (`print_jobs`, `print_job_pages`). Each change that two runs could
 * make at once — a job becoming ready, pages going to the printer — is one conditional
 * `UPDATE`, so only one of them wins.
 */
export class PrintJobRepository implements PrintJobStore {
  async addPage(
    job: Pick<PrintJob, "id" | "title" | "total">,
    page: number,
    content: PrintPage,
  ): Promise<void> {
    await DBCursor.mutateDatabase(
      `INSERT OR IGNORE INTO ${JOBS} (id, title, total, printed, state) VALUES (?, ?, ?, 0, ?)`,
      job.id,
      job.title,
      job.total,
      ARRIVING,
    );
    await DBCursor.mutateDatabase(
      `INSERT OR REPLACE INTO ${PAGES} (job_id, page, image, width, height)
       VALUES (?, ?, ?, ?, ?)`,
      job.id,
      page,
      content.image,
      content.width,
      content.height,
    );
  }

  async markReady(jobId: string): Promise<boolean> {
    const result = await DBCursor.mutateDatabase(
      `UPDATE ${JOBS} SET state = ?
       WHERE id = ? AND state = ?
         AND total = (SELECT COUNT(*) FROM ${PAGES} WHERE job_id = ?)`,
      READY,
      jobId,
      ARRIVING,
      jobId,
    );
    return result.changes === 1;
  }

  async find(jobId: string): Promise<PrintJob | null> {
    const row = await DBCursor.getFirstAsync<JobRow>(
      `SELECT id, title, total, printed FROM ${JOBS} WHERE id = ? AND state = ?`,
      jobId,
      READY,
    );
    return row ? jobOf(row) : null;
  }

  async pages(jobId: string, from: number, to: number): Promise<PrintPage[]> {
    const rows = await DBCursor.getAllAsync<PageRow>(
      `SELECT image, width, height FROM ${PAGES}
       WHERE job_id = ? AND page BETWEEN ? AND ?
       ORDER BY page`,
      jobId,
      from,
      to,
    );
    return rows.map(pageOf);
  }

  async advance(jobId: string, from: number, to: number): Promise<boolean> {
    const result = await DBCursor.mutateDatabase(
      `UPDATE ${JOBS} SET printed = ? WHERE id = ? AND printed = ? AND state = ?`,
      to,
      jobId,
      from,
      READY,
    );
    return result.changes === 1;
  }

  async remove(jobId: string): Promise<void> {
    await DBCursor.mutateDatabase(`DELETE FROM ${PAGES} WHERE job_id = ?`, jobId);
    await DBCursor.mutateDatabase(`DELETE FROM ${JOBS} WHERE id = ?`, jobId);
  }

  async ready(): Promise<PrintJob[]> {
    const rows = await DBCursor.getAllAsync<JobRow>(
      `SELECT id, title, total, printed FROM ${JOBS} WHERE state = ? ORDER BY created_at, id`,
      READY,
    );
    return rows.map(jobOf);
  }

  async discardArriving(): Promise<number> {
    await DBCursor.mutateDatabase(
      `DELETE FROM ${PAGES} WHERE job_id IN (SELECT id FROM ${JOBS} WHERE state = ?)`,
      ARRIVING,
    );
    const result = await DBCursor.mutateDatabase(
      `DELETE FROM ${JOBS} WHERE state = ?`,
      ARRIVING,
    );
    return result.changes;
  }
}

export const printJobRepository = new PrintJobRepository();
