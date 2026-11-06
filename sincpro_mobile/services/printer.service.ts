import { ReceiptExporterAdapter } from "@sincpro/mobile/adapters/ReceiptExporter.adapter";
import { SettingsRepository } from "@sincpro/mobile/adapters/repositories/setting.repository";
import {
  type BluetoothDevice,
  getPrinterDriver,
  hasPrinterDriver,
  type IPrinterDriver,
  type ISelectedPrinter,
  type PairedPrinter,
  setPrinterDriver,
} from "@sincpro/mobile/domain/print";
import { ECommonSetting } from "@sincpro/mobile/domain/settings";
import { loggerUseCases } from "@sincpro/mobile/infrastructure/logger";
import { notifyDevice } from "@sincpro/mobile/infrastructure/ui/activity";
import { File } from "expo-file-system";
import * as Print from "expo-print";
import type { RefObject } from "react";
import type { View } from "react-native";

import { bluetoothService } from "./bluetooth.service";

class PrinterService {
  private readonly bluetooth = bluetoothService;
  private cachedPrinter: ISelectedPrinter | null = null;

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

  isConnected(): boolean {
    return getPrinterDriver().isConnected();
  }

  async connect(address: string, name: string, notify = true): Promise<boolean> {
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
      loggerUseCases.error(`Failed to connect to printer: ${name}`, error);

      if (notify) {
        notifyDevice({
          name: "printer.connect_failed",
          title: "Error de conexión",
          message: `No se pudo conectar a ${name}`,
          variant: "danger",
        });
      }

      return false;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await getPrinterDriver().disconnect();
      notifyDevice({
        name: "printer.disconnected",
        title: "Desconectado",
        message: "Impresora desconectada",
        variant: "info",
      });
    } catch (error) {
      loggerUseCases.error("Error disconnecting from printer", error);
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
    if (!this.isConnected()) {
      notifyDevice({
        name: "printer.not_connected",
        title: "Sin conexión",
        message: "Conecta una impresora primero",
        variant: "danger",
      });
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
      loggerUseCases.error("Error printing test page", error);

      notifyDevice({
        name: "printer.test_failed",
        title: "Error de impresión",
        message: "No se pudo imprimir la página de prueba",
        variant: "danger",
      });

      return false;
    }
  }

  async printImageBase64(base64Data: string): Promise<boolean> {
    const connected = await this.ensureConnected();
    if (!connected) return false;

    try {
      await getPrinterDriver().printImageBase64(base64Data);
      return true;
    } catch (firstError) {
      loggerUseCases.warn("Print failed — attempting grace reconnect", firstError);

      const reconnected = await this.forceReconnect();
      if (!reconnected) return false;

      try {
        await getPrinterDriver().printImageBase64(base64Data);
        return true;
      } catch (retryError) {
        loggerUseCases.error("Print retry after reconnect also failed", retryError);
        return false;
      }
    }
  }

  async printFromView(viewRef: RefObject<View | null>): Promise<boolean> {
    const connected = await this.ensureConnected();
    if (!connected) return false;

    try {
      const imageBase64 = await ReceiptExporterAdapter.captureAsImageBase64(viewRef);
      if (!imageBase64) {
        loggerUseCases.warn("Could not capture view for printing");
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
      loggerUseCases.error("Error printing from view", error);
      return false;
    }
  }

  async printHtml(html: string): Promise<boolean> {
    const connected = await this.ensureConnected();
    if (!connected) return false;

    try {
      const pdfBase64 = await this.htmlToPdfBase64(html);
      if (!pdfBase64) {
        loggerUseCases.warn("Could not convert HTML to PDF");
        return false;
      }

      loggerUseCases.info("PDF base64 length:", pdfBase64.length);
      await getPrinterDriver().printPdfBase64(pdfBase64, 1);
      return true;
    } catch (error) {
      loggerUseCases.error("Error printing HTML", error);
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

      loggerUseCases.info("PDF generated at:", uri);

      const file = new File(uri);
      const pdfBase64 = await file.base64();

      await file.delete();

      return pdfBase64;
    } catch (error) {
      loggerUseCases.error("Error converting HTML to PDF", error);
      return null;
    }
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
    loggerUseCases.info(
      `Grace reconnect: reconnecting to ${printer.name} (${printer.address})`,
    );
    return this.connect(printer.address, printer.name, false);
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

export const printerService = new PrinterService();
