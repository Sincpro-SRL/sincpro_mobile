import { loggerAdapter } from "@sincpro/client-framework";
import { ReceiptExporterAdapter } from "@sincpro/mobile/adapters/ReceiptExporter.adapter";
import { SettingsRepository } from "@sincpro/mobile/adapters/repositories/setting.repository";
import { type DevicePermissions, EPermission } from "@sincpro/mobile/domain/permissions";
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
import { ECommonSetting } from "@sincpro/mobile/domain/settings";
import {
  BluetoothPermissionDenied,
  DomainAppError,
  PrinterNotSelected,
  PrinterUnavailable,
} from "@sincpro/mobile/exceptions";
import { errorAttributes } from "@sincpro/mobile/infrastructure/logger";
import { RECONNECT_DELAYS_MS } from "@sincpro/mobile/infrastructure/print/reconnect";
import { File } from "expo-file-system";
import * as Print from "expo-print";
import type { RefObject } from "react";
import type { View } from "react-native";

import { devicePermissions } from "./permissions.adapter";

export interface PrinterOptions {
  /** Reconnect the saved printer on start, on return and after a lost link. Default: true. */
  autoReconnect: boolean;
  /** Waits between reconnection tries, in ms. */
  reconnectDelays: readonly number[];
}

/**
 * The printer as a device — the adapter the printer's use cases hold (`this.printer`): it adapts
 * the native driver the app registered (`setPrinterDriver`, the `IPrinterDriver` port) to the
 * domain — the printer the person chose, connecting, scanning and printing, each failure with
 * its kind.
 *
 * Context: it tells nobody anything and hides no failure. No printer chosen is
 * `PrinterNotSelected` (domain), a printer off or out of reach `PrinterUnavailable`
 * (unavailable), Bluetooth not granted `BluetoothPermissionDenied` (permission_denied). What the
 * person reads, and when, is the use case's (`services/printer`), so every operation is a run
 * with its span, its log lines and its report. It holds the device's state in the process (the
 * chosen printer, a disconnection on purpose), as an adapter may and a use case never does.
 * Extend it without touching the core: `configure()` tunes its policies, `driver` reaches the
 * native driver, and a subclass takes its place for every use case with
 * `commonBoundedContext.addDependency("printer", new MyPrinter(), { replaces: printerAdapter })`.
 */
export class PrinterAdapter {
  constructor(private readonly permissions: DevicePermissions = devicePermissions) {}

  private cachedPrinter: ISelectedPrinter | null = null;
  /** The person disconnected on purpose: nothing reconnects until they connect again. */
  private userDisconnected = false;
  private options: PrinterOptions = {
    autoReconnect: true,
    reconnectDelays: RECONNECT_DELAYS_MS,
  };

  /** Tunes the adapter from the app: e.g. no automatic reconnection, or other delays. */
  configure(options: Partial<PrinterOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /** How it reconnects the saved printer while the app runs. */
  get policy(): Readonly<PrinterOptions> {
    return this.options;
  }

  /**
   * The native driver, for what this adapter does not wrap: raw commands, other formats,
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

  /** The printers in reach; without the Bluetooth permission `BluetoothPermissionDenied`. */
  async scanPrinters(): Promise<BluetoothDevice[]> {
    await this.requireBluetooth();
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

  /**
   * Connects to a printer and keeps it as the chosen one:
   * 1. Without the Bluetooth permission: `BluetoothPermissionDenied` — never asked for here.
   * 2. The driver connects: one that does not answer is `PrinterUnavailable`.
   * Final: the printer is saved as the chosen one.
   */
  async connect(address: string, name: string): Promise<void> {
    this.userDisconnected = false;
    await this.requireBluetooth();
    try {
      await getPrinterDriver().connectBluetooth(address);
    } catch (error) {
      throw new PrinterUnavailable(
        `${name} did not answer: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    await this.saveSelectedPrinter({ name, address, selectedAt: new Date().toISOString() });
  }

  /** Disconnects on purpose: nothing reconnects until the person connects again. */
  async disconnect(): Promise<void> {
    this.userDisconnected = true;
    await getPrinterDriver().disconnect();
  }

  async getSelectedPrinter(): Promise<ISelectedPrinter | null> {
    if (this.cachedPrinter) return this.cachedPrinter;
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

  /** A short page that proves the printer works. */
  async printTestPage(): Promise<void> {
    await this.ensureConnected();
    const driver = getPrinterDriver();
    await this.onDevice(async () => {
      await driver.printText("=== PRUEBA DE IMPRESIÓN ===", {
        alignment: "center",
        bold: true,
        fontSize: "large",
      });
      await driver.printText("Impresora configurada correctamente", {
        alignment: "center",
        fontSize: "medium",
      });
      await driver.printText(new Date().toLocaleString(), {
        alignment: "center",
        fontSize: "small",
      });
    });
  }

  /**
   * Prints an image, or fails saying why:
   * 1. Not connected: connects to the saved printer, or fails (`PrinterNotSelected`,
   *    `PrinterUnavailable`).
   * 2. The print fails on a stale link: one reconnect and one more try; failing again:
   *    `PrinterUnavailable`.
   */
  async printImage(base64Data: string): Promise<void> {
    await this.ensureConnected();
    try {
      await getPrinterDriver().printImageBase64(base64Data);
      return;
    } catch (firstError) {
      loggerAdapter.warn("Print failed: reconnecting once", errorAttributes(firstError));
    }
    await this.forceReconnect();
    await this.onDevice(() => getPrinterDriver().printImageBase64(base64Data));
  }

  /** A mounted view as the image to print; one that cannot be captured is a fault. */
  async captureView(viewRef: RefObject<View | null>): Promise<string> {
    const imageBase64 = await ReceiptExporterAdapter.captureAsImageBase64(viewRef);
    if (!imageBase64) throw new DomainAppError("The view could not be captured to print");
    return imageBase64;
  }

  /** Renders HTML as a thermal-width PDF and prints it. */
  async printHtml(html: string): Promise<void> {
    await this.ensureConnected();
    const pdfBase64 = await this.htmlToPdfBase64(html);
    await this.onDevice(() => getPrinterDriver().printPdfBase64(pdfBase64, 1));
  }

  /**
   * One silent try to bring back the saved printer — what the reconnection loop runs:
   * nothing to do when it is connected, was disconnected on purpose, none is saved, or the
   * Bluetooth permission is missing (never asked for here); else it connects, or fails
   * `PrinterUnavailable`.
   */
  async restoreConnection(): Promise<void> {
    if (this.isConnected() || this.userDisconnected) return;
    const printer = await this.getSelectedPrinter();
    if (!printer) return;
    if ((await this.permissions.check(EPermission.BLUETOOTH)) !== "granted") return;
    try {
      await getPrinterDriver().connectBluetooth(printer.address);
    } catch (error) {
      throw new PrinterUnavailable(
        `${printer.name} did not come back: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Bluetooth granted, or `BluetoothPermissionDenied`. The adapter never asks: a print from the
   * queue or a reconnection runs with no one looking, and the system's dialog is shown only
   * when a person asks for it (`CommandRequestPermission`).
   */
  private async requireBluetooth(): Promise<void> {
    if ((await this.permissions.check(EPermission.BLUETOOTH)) !== "granted") {
      throw new BluetoothPermissionDenied("The Bluetooth permission is not granted");
    }
  }

  private async ensureConnected(): Promise<void> {
    if (this.isConnected()) return;
    const printer = await this.getSelectedPrinter();
    if (!printer) throw new PrinterNotSelected("No printer is selected");
    await this.connect(printer.address, printer.name);
  }

  /** Drops a stale link and connects again to the saved printer, once. */
  private async forceReconnect(): Promise<void> {
    try {
      await getPrinterDriver().disconnect();
    } catch {
      // The link is already dead: nothing to drop.
    }
    const printer = await this.getSelectedPrinter();
    if (!printer) throw new PrinterNotSelected("No printer is selected");
    await this.connect(printer.address, printer.name);
  }

  /** What the printer itself refused or could not do: it is off, out of reach or jammed. */
  private async onDevice(work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      throw new PrinterUnavailable(error instanceof Error ? error.message : String(error));
    }
  }

  private async htmlToPdfBase64(html: string): Promise<string> {
    const THERMAL_WIDTH_PX = 576;
    const THERMAL_HEIGHT_PX = 1500;
    const { uri } = await Print.printToFileAsync({
      html,
      width: THERMAL_WIDTH_PX,
      height: THERMAL_HEIGHT_PX,
    });
    if (!uri) throw new DomainAppError("The HTML could not be rendered to PDF");
    const file = new File(uri);
    const pdfBase64 = await file.base64();
    await file.delete();
    return pdfBase64;
  }
}

/** The core's printer: what `commonBoundedContext` holds as `printer`. */
export const printerAdapter = new PrinterAdapter();
