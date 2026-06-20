import { File } from "expo-file-system";
import * as Print from "expo-print";
import type { RefObject } from "react";
import type { View } from "react-native";

import { BluetoothDevice, PairedPrinter, PrinterAdapter } from "../adapters/Printer.adapter";
import { ReceiptExporterAdapter } from "../adapters/ReceiptExporter.adapter";
import { SettingsRepository } from "../adapters/repositories/setting.repository";
import { ISelectedPrinter } from "../domain/print";
import { ECommonSetting } from "../domain/settings";
import { loggerUseCases } from "../infrastructure/logger";
import { UI_NOTIFICATION_EVENT } from "../infrastructure/ui/events";
import { UIEventBus } from "../infrastructure/ui/UIEventBus";
import { bluetoothService } from "./bluetooth.service";

class PrinterService {
  private readonly bluetooth = bluetoothService;
  private cachedPrinter: ISelectedPrinter | null = null;

  getPairedDevices(): BluetoothDevice[] {
    return PrinterAdapter.getPairedDevices();
  }

  getPairedPrinters(): PairedPrinter[] {
    return PrinterAdapter.getPairedPrinters();
  }

  isConnected(): boolean {
    return PrinterAdapter.isConnected();
  }

  async connect(address: string, name: string): Promise<boolean> {
    const hasPermissions = await this.bluetooth.ensurePermissionsForPrinter();
    if (!hasPermissions) {
      return false;
    }

    try {
      await PrinterAdapter.connectBluetooth(address);

      const printer: ISelectedPrinter = {
        name,
        address,
        selectedAt: new Date().toISOString(),
      };

      await this.saveSelectedPrinter(printer);

      UIEventBus.emit(UI_NOTIFICATION_EVENT, {
        type: "success",
        text1: "Impresora conectada",
        text2: `Conectado a ${name}`,
      });

      return true;
    } catch (error) {
      loggerUseCases.error(`Failed to connect to printer: ${name}`, error);

      UIEventBus.emit(UI_NOTIFICATION_EVENT, {
        type: "error",
        text1: "Error de conexión",
        text2: `No se pudo conectar a ${name}`,
      });

      return false;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await PrinterAdapter.disconnect();
      UIEventBus.emit(UI_NOTIFICATION_EVENT, {
        type: "info",
        text1: "Desconectado",
        text2: "Impresora desconectada",
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
      UIEventBus.emit(UI_NOTIFICATION_EVENT, {
        type: "error",
        text1: "Sin conexión",
        text2: "Conecta una impresora primero",
      });
      return false;
    }

    try {
      await PrinterAdapter.printText("=== PRUEBA DE IMPRESIÓN ===", {
        alignment: "center",
        bold: true,
        fontSize: "large",
      });

      await PrinterAdapter.printText("Impresora configurada correctamente", {
        alignment: "center",
        fontSize: "medium",
      });

      await PrinterAdapter.printText(new Date().toLocaleString(), {
        alignment: "center",
        fontSize: "small",
      });

      UIEventBus.emit(UI_NOTIFICATION_EVENT, {
        type: "success",
        text1: "Impresión exitosa",
        text2: "Página de prueba impresa",
      });

      return true;
    } catch (error) {
      loggerUseCases.error("Error printing test page", error);

      UIEventBus.emit(UI_NOTIFICATION_EVENT, {
        type: "error",
        text1: "Error de impresión",
        text2: "No se pudo imprimir la página de prueba",
      });

      return false;
    }
  }

  async printImageBase64(base64Data: string): Promise<boolean> {
    const connected = await this.ensureConnected();
    if (!connected) return false;

    try {
      await PrinterAdapter.printImageBase64(base64Data);
      return true;
    } catch (error) {
      loggerUseCases.error("Error printing image", error);
      return false;
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

      await PrinterAdapter.printImageBase64(imageBase64);

      UIEventBus.emit(UI_NOTIFICATION_EVENT, {
        type: "success",
        text1: "Impresión enviada",
        text2: "Documento enviado a la impresora",
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
      await PrinterAdapter.printPdfBase64(pdfBase64, 1);
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

  private async ensureConnected(): Promise<boolean> {
    if (this.isConnected()) {
      return true;
    }

    const printer = await this.getSelectedPrinter();
    if (!printer) {
      UIEventBus.emit(UI_NOTIFICATION_EVENT, {
        type: "error",
        text1: "Sin impresora",
        text2: "Selecciona una impresora primero",
      });
      return false;
    }

    return this.connect(printer.address, printer.name);
  }
}

export const printerService = new PrinterService();
