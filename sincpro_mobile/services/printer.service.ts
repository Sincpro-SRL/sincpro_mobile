import { logger } from "@sincpro/client-framework";
import { ReceiptExporterAdapter } from "@sincpro/mobile/adapters/ReceiptExporter.adapter";
import { SettingsRepository } from "@sincpro/mobile/adapters/repositories/setting.repository";
import { newEvent } from "@sincpro/mobile/domain/events/delivery";
import {
  type BluetoothDevice,
  getPrinterDriver,
  hasPrinterDriver,
  type IPrinterConnection,
  type IPrinterDriver,
  type ISelectedPrinter,
  type PairedPrinter,
  setPrinterDriver,
} from "@sincpro/mobile/domain/print";
import { PrintImageRequestedEvent } from "@sincpro/mobile/domain/print/events";
import { ECommonSetting } from "@sincpro/mobile/domain/settings";
import { printNoticeKey } from "@sincpro/mobile/domain/webview/print_cycle";
import { PrinterNotSelected, PrinterUnavailable } from "@sincpro/mobile/exceptions";
import { replaceable } from "@sincpro/mobile/framework/replaceable";
import { generateUUID } from "@sincpro/mobile/infrastructure/database/utils";
import { eventDelivery } from "@sincpro/mobile/infrastructure/events/delivery";
import { errorAttributes } from "@sincpro/mobile/infrastructure/logger";
import {
  createReconnector,
  RECONNECT_DELAYS_MS,
} from "@sincpro/mobile/infrastructure/print/reconnect";
import { notifyDevice } from "@sincpro/mobile/infrastructure/ui/activity";
import { File } from "expo-file-system";
import * as Print from "expo-print";
import type { RefObject } from "react";
import { AppState, type View } from "react-native";

import { bluetoothService } from "./bluetooth.service";

/**
 * Where a print problem sends the user. The host maps each intent to a screen:
 * `failed-prints` to the list of prints that did not come out, `printer` to its settings.
 */
export const PRINT_NOTICE_ACTIONS = {
  failed: { label: "Ver fallidas", intent: "failed-prints" },
  printer: { label: "Impresora", intent: "printer" },
} as const;
const PRINT_FAILURE_ACTIONS = [PRINT_NOTICE_ACTIONS.failed, PRINT_NOTICE_ACTIONS.printer];
const PRINT_CAPTURE_TIMEOUT_MS = 45_000;
/** A page that did not send a job id: its steps still share one notice. */
const UNTRACKED_PAGE_JOB = "page";

export interface PrinterOptions {
  /** Reconnect the saved printer on start, on return and after a lost link. Default: true. */
  autoReconnect: boolean;
  /** Waits between reconnection tries, in ms. */
  reconnectDelays: readonly number[];
}

/**
 * The printer component: connect, print images, HTML and views, a test page, reconnection and
 * notices. Extend it from the app without touching the core:
 * - `configure()` tunes its policies;
 * - `driver` gives the native driver for low-level work;
 * - `class MyPrinter extends PrinterService` overrides any method, registered with `setPrinterService`;
 * - `commonBoundedContext.interceptor(CommandPrintImage)` wraps the print use case, and
 *   `commonBoundedContext.feature([CommandPrintImage, PrintImageRequestedEvent], { replaces: PrintImage })`
 *   replaces it.
 */
export class PrinterService {
  private readonly bluetooth = bluetoothService;
  private cachedPrinter: ISelectedPrinter | null = null;
  /** The user disconnected on purpose: nothing reconnects until they connect again. */
  private userDisconnected = false;
  /** Page captures that started and have not delivered an image or a failure yet. */
  private readonly pendingCaptures = new Map<string, ReturnType<typeof setTimeout>>();
  private options: PrinterOptions = {
    autoReconnect: true,
    reconnectDelays: RECONNECT_DELAYS_MS,
  };

  /** Tunes the service from the app: e.g. no automatic reconnection, or other delays. */
  configure(options: Partial<PrinterOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * The native driver, for what this service does not wrap: raw commands, other formats,
   * custom status checks. Low level on purpose: the app reaches it without changing the core.
   */
  get driver(): IPrinterDriver {
    return getPrinterDriver();
  }

  setDriver(driver: IPrinterDriver): void {
    setPrinterDriver(driver);
  }

  hasDriver(): boolean {
    return hasPrinterDriver();
  }

  getPairedDevices(): BluetoothDevice[] {
    return getPrinterDriver().getPairedDevices();
  }

  getPairedPrinters(): PairedPrinter[] {
    return getPrinterDriver().getPairedPrinters();
  }

  scanPrinters(): Promise<BluetoothDevice[]> {
    return getPrinterDriver().scanPrinters();
  }

  isConnected(): boolean {
    return getPrinterDriver().isConnected();
  }

  getConnection(): IPrinterConnection {
    return getPrinterDriver().getConnection();
  }

  onConnectionChange(listener: (connection: IPrinterConnection) => void): () => void {
    return getPrinterDriver().onConnectionChange(listener);
  }

  async connect(address: string, name: string, notify = true): Promise<boolean> {
    this.userDisconnected = false;
    const hasPermissions = await this.bluetooth.ensurePermissionsForPrinter();
    if (!hasPermissions) {
      return false;
    }

    try {
      await getPrinterDriver().connectBluetooth(address);

      const printer: ISelectedPrinter = {
        name,
        address,
        selectedAt: new Date().toISOString(),
      };

      await this.saveSelectedPrinter(printer);

      if (notify) {
        notifyDevice({
          name: "printer.connected",
          title: "Impresora conectada",
          message: `Conectado a ${name}`,
          variant: "success",
        });
      }

      return true;
    } catch (error) {
      logger.error(`Failed to connect to printer: ${name}`, errorAttributes(error));

      if (notify) {
        notifyDevice({
          name: "printer.connect_failed",
          title: "Error de conexión",
          message: `No se pudo conectar a ${name}`,
          variant: "danger",
          actions: [PRINT_NOTICE_ACTIONS.printer],
        });
      }

      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.userDisconnected = true;
    try {
      await getPrinterDriver().disconnect();
      notifyDevice({
        name: "printer.disconnected",
        title: "Desconectado",
        message: "Impresora desconectada",
        variant: "info",
      });
    } catch (error) {
      logger.error("Error disconnecting from printer", errorAttributes(error));
    }
  }

  async getSelectedPrinter(): Promise<ISelectedPrinter | null> {
    if (this.cachedPrinter) {
      return this.cachedPrinter;
    }

    const printer = await SettingsRepository.getSettingByName(
      ECommonSetting.SELECTED_PRINTER,
    );
    this.cachedPrinter = printer;
    return printer;
  }

  async saveSelectedPrinter(printer: ISelectedPrinter): Promise<void> {
    await SettingsRepository.saveOneSetting(ECommonSetting.SELECTED_PRINTER, printer);
    this.cachedPrinter = printer;
  }

  async clearSelectedPrinter(): Promise<void> {
    await SettingsRepository.saveOneSetting(ECommonSetting.SELECTED_PRINTER, null);
    this.cachedPrinter = null;
  }

  async printTestPage(): Promise<boolean> {
    if (!(await this.ensureConnected())) {
      return false;
    }

    try {
      await getPrinterDriver().printText("=== PRUEBA DE IMPRESIÓN ===", {
        alignment: "center",
        bold: true,
        fontSize: "large",
      });

      await getPrinterDriver().printText("Impresora configurada correctamente", {
        alignment: "center",
        fontSize: "medium",
      });

      await getPrinterDriver().printText(new Date().toLocaleString(), {
        alignment: "center",
        fontSize: "small",
      });

      notifyDevice({
        name: "printer.test_ok",
        title: "Impresión exitosa",
        message: "Página de prueba impresa",
        variant: "success",
      });

      return true;
    } catch (error) {
      logger.error("Error printing test page", errorAttributes(error));

      notifyDevice({
        name: "printer.test_failed",
        title: "Error de impresión",
        message: "No se pudo imprimir la página de prueba",
        variant: "danger",
      });

      return false;
    }
  }

  /**
   * Queues an image to print. `jobId` is the notice the user is already following (a page
   * print); without it the print starts its own.
   */
  async enqueuePrintImage(input: {
    imageBase64: string;
    width: number;
    height: number;
    title: string;
    jobId?: string;
  }): Promise<void> {
    const jobId = input.jobId ?? generateUUID();
    this.settleCapture(jobId);
    // The image travels in the event and stays in its history: retention and logout clean it.
    const event = newEvent(PrintImageRequestedEvent, {
      imageBase64: input.imageBase64,
      width: input.width,
      height: input.height,
      title: input.title,
      jobId,
    });
    try {
      await eventDelivery.publisher.publish(event);
    } catch (error) {
      this.reportPrintFailed(input.title, "the print could not be queued", jobId);
      throw error;
    }
  }

  /**
   * Prints an image, or fails saying why — what a use case calls:
   * 1. No printer saved: `PrinterNotSelected` (domain) — the person picks one, then retries.
   * 2. Not connected: connects to the saved one, silently; it does not answer:
   *    `PrinterUnavailable` (off, out of reach) — a retry may print.
   * 3. The print fails on a stale link: one reconnect and one more try; failing again:
   *    `PrinterUnavailable`.
   */
  async printImage(base64Data: string): Promise<void> {
    if (!this.isConnected()) {
      const printer = await this.getSelectedPrinter();
      if (!printer) throw new PrinterNotSelected("No printer is selected");
      if (!(await this.connect(printer.address, printer.name, false)))
        throw new PrinterUnavailable(`${printer.name} did not answer`);
    }
    try {
      await getPrinterDriver().printImageBase64(base64Data);
      return;
    } catch (firstError) {
      logger.warn("Print failed — attempting grace reconnect", errorAttributes(firstError));
    }
    if (!(await this.forceReconnect()))
      throw new PrinterUnavailable("The printer link was lost and did not come back");
    try {
      await getPrinterDriver().printImageBase64(base64Data);
    } catch (retryError) {
      throw new PrinterUnavailable(
        retryError instanceof Error
          ? retryError.message
          : "The print failed after reconnecting",
      );
    }
  }

  /** Prints an image from a screen: `true` when it came out; why not is in the notices. */
  async printImageBase64(base64Data: string): Promise<boolean> {
    const connected = await this.ensureConnected();
    if (!connected) return false;
    return this.printImage(base64Data).then(
      () => true,
      (error: unknown) => {
        logger.error("Print failed", errorAttributes(error));
        return false;
      },
    );
  }

  async printFromView(viewRef: RefObject<View | null>): Promise<boolean> {
    const connected = await this.ensureConnected();
    if (!connected) return false;

    try {
      const imageBase64 = await ReceiptExporterAdapter.captureAsImageBase64(viewRef);
      if (!imageBase64) {
        logger.warn("Could not capture view for printing");
        return false;
      }

      await getPrinterDriver().printImageBase64(imageBase64);

      notifyDevice({
        name: "printer.sent",
        title: "Impresión enviada",
        message: "Documento enviado a la impresora",
        variant: "success",
      });

      return true;
    } catch (error) {
      logger.error("Error printing from view", errorAttributes(error));
      return false;
    }
  }

  async printHtml(html: string): Promise<boolean> {
    const connected = await this.ensureConnected();
    if (!connected) return false;

    try {
      const pdfBase64 = await this.htmlToPdfBase64(html);
      if (!pdfBase64) {
        logger.warn("Could not convert HTML to PDF");
        return false;
      }

      logger.info("PDF generated", { base64_length: pdfBase64.length });
      await getPrinterDriver().printPdfBase64(pdfBase64, 1);
      return true;
    } catch (error) {
      logger.error("Error printing HTML", errorAttributes(error));
      return false;
    }
  }

  private async htmlToPdfBase64(html: string): Promise<string | null> {
    try {
      const THERMAL_WIDTH_PX = 576;
      const THERMAL_HEIGHT_PX = 1500;

      const { uri } = await Print.printToFileAsync({
        html,
        width: THERMAL_WIDTH_PX,
        height: THERMAL_HEIGHT_PX,
      });

      if (!uri) return null;

      logger.info("PDF written", { uri });

      const file = new File(uri);
      const pdfBase64 = await file.base64();

      await file.delete();

      return pdfBase64;
    } catch (error) {
      logger.error("Error converting HTML to PDF", errorAttributes(error));
      return null;
    }
  }

  /**
   * A page started a print. The capture can take seconds, so the user sees it coming, and a
   * capture that never answers ends as a failure instead of a notice that spins forever.
   */
  reportPrintStarted(title: string, jobId: string = UNTRACKED_PAGE_JOB): void {
    this.settleCapture(jobId);
    this.pendingCaptures.set(
      jobId,
      setTimeout(
        () => this.reportPrintFailed(title, "the capture did not answer", jobId),
        PRINT_CAPTURE_TIMEOUT_MS,
      ),
    );
    logger.info(`Print started: ${title || "untitled"} (${jobId})`);
    notifyDevice({
      key: printNoticeKey(jobId),
      name: "printer.preparing",
      title: "Preparando impresión",
      message: title || "Capturando el documento…",
      variant: "loading",
    });
  }

  /** The capture failed before reaching the printer: without this nothing was shown. */
  reportPrintFailed(title: string, reason: string, jobId: string = UNTRACKED_PAGE_JOB): void {
    this.settleCapture(jobId);
    logger.warn(`Print capture failed: ${reason} (${jobId})`);
    notifyDevice({
      key: printNoticeKey(jobId),
      name: "printer.capture_failed",
      title: "No se pudo preparar la impresión",
      message: title
        ? `«${title}»: vuelve a intentarlo desde la página.`
        : "Vuelve a intentarlo desde la página.",
      variant: "danger",
      actions: [PRINT_NOTICE_ACTIONS.printer],
    });
  }

  /** Actions offered when a print fails: the failed list and the printer settings. */
  printFailureActions() {
    return PRINT_FAILURE_ACTIONS;
  }

  /**
   * One silent try to bring back the saved printer. Resolves `true` when there is nothing left
   * to do: already connected, disconnected on purpose, no printer saved, or Bluetooth
   * permission missing (it is never requested here; the user grants it from settings).
   */
  async restoreConnection(): Promise<boolean> {
    if (this.isConnected() || this.userDisconnected) return true;
    const printer = await this.getSelectedPrinter();
    if (!printer) return true;
    const permissions = await this.bluetooth.checkPermissions();
    if (!permissions.isGranted) return true;
    logger.info(`Restoring printer connection: ${printer.name} (${printer.address})`);
    return this.connect(printer.address, printer.name, false);
  }

  /**
   * Keeps the saved printer connected while the app runs:
   * 1. Tries at once, so a restart or a crash does not leave it disconnected.
   * 2. Tries again when the app returns to the foreground and when the link is lost
   *    (printer off or out of range), backing off up to 30 s.
   * 3. A disconnection by the user stops it.
   * Final: returns the cleanup that removes the listeners and the pending try.
   */
  keepConnected(): () => void {
    if (!this.options.autoReconnect) return () => {};
    const reconnector = createReconnector(
      () => this.restoreConnection(),
      this.options.reconnectDelays,
    );
    reconnector.start();
    const offConnection = this.onConnectionChange(({ reason }) => {
      if (reason === "link_lost") reconnector.start();
      if (reason === "user_disconnect") reconnector.stop();
    });
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") reconnector.start();
    });
    return () => {
      reconnector.stop();
      offConnection();
      appState.remove();
    };
  }

  /**
   * Drops the current BLE connection (even if cached as "connected") and
   * reconnects to the last saved printer. Used as a one-shot recovery after
   * a failed print caused by a stale connection.
   */
  private async forceReconnect(): Promise<boolean> {
    try {
      await getPrinterDriver().disconnect();
    } catch {
      // Expected when the BLE link is already dead — ignore.
    }
    const printer = await this.getSelectedPrinter();
    if (!printer) return false;
    logger.info(`Grace reconnect: reconnecting to ${printer.name} (${printer.address})`);
    return this.connect(printer.address, printer.name, false);
  }

  private settleCapture(jobId: string): void {
    const timer = this.pendingCaptures.get(jobId);
    if (timer !== undefined) clearTimeout(timer);
    this.pendingCaptures.delete(jobId);
  }

  private async ensureConnected(): Promise<boolean> {
    if (this.isConnected()) {
      return true;
    }

    const printer = await this.getSelectedPrinter();
    if (!printer) {
      notifyDevice({
        name: "printer.missing",
        title: "Sin impresora",
        message: "Selecciona una impresora primero",
        variant: "danger",
      });
      return false;
    }

    return this.connect(printer.address, printer.name);
  }
}

const printerSlot = replaceable(new PrinterService());

/**
 * The app's printer service. A subclass replaces it for the whole app, the core included:
 * `setPrinterService(new MyPrinter())` at module scope, before the AppShell mounts.
 */
export function setPrinterService(service: PrinterService): void {
  printerSlot.set(service);
}

/** Always the current implementation, so a replacement reaches every caller of the core. */
export const printerService: PrinterService = printerSlot.instance;
