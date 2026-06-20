import { loggerAdapter } from "@sincpro/mobile/infrastructure/logger";
import type {
  BluetoothDevice,
  MediaConfig,
  MediaPreset,
  PairedPrinter,
  PrinterConfig,
  PrinterInfo,
  PrinterStatus,
  PrintImageOptions,
  PrintReceiptOptions,
  PrintTextOptions,
  Receipt,
} from "@sincpro/printer-expo";
import { bluetooth, config, connection, print } from "@sincpro/printer-expo";

export type { BluetoothDevice, PairedPrinter, PrinterInfo, PrinterStatus };

const DEFAULT_MEDIA_PRESET: MediaPreset = "continuous72mm";

const DEFAULT_PRINTER_CONFIG: PrinterConfig = {
  marginLeft: 0,
  marginTop: 0,
  density: "extra_dark",
};

class PrinterAdapterImpl {
  getPairedDevices(): BluetoothDevice[] {
    loggerAdapter.info("Getting paired Bluetooth devices");
    try {
      return bluetooth.getPairedDevices();
    } catch (error) {
      loggerAdapter.error("Error getting paired devices", error);
      return [];
    }
  }

  getPairedPrinters(): PairedPrinter[] {
    loggerAdapter.info("Getting paired printers");
    try {
      return bluetooth.getPairedPrinters();
    } catch (error) {
      loggerAdapter.error("Error getting paired printers", error);
      return [];
    }
  }

  async connectBluetooth(address: string, timeoutMs: number = 10000): Promise<void> {
    await connection.connectBluetooth(address, timeoutMs);
    await config.set(DEFAULT_PRINTER_CONFIG);
    loggerAdapter.info(`Connected to printer at ${address} with zero margins`);
  }

  async disconnect(): Promise<void> {
    loggerAdapter.info("Disconnecting from printer");
    await connection.disconnect();
  }

  isConnected(): boolean {
    return connection.isConnected();
  }

  async getStatus(): Promise<PrinterStatus> {
    return connection.getStatus();
  }

  async getInfo(): Promise<PrinterInfo> {
    return connection.getInfo();
  }

  getDpi(): number {
    return connection.getDpi();
  }

  async printText(text: string, options?: PrintTextOptions): Promise<void> {
    await print.text(text, { ...options, media: { preset: DEFAULT_MEDIA_PRESET } });
  }

  async printReceipt(receipt: Receipt, options?: PrintReceiptOptions): Promise<void> {
    await print.receipt(receipt, { ...options, media: { preset: DEFAULT_MEDIA_PRESET } });
  }

  async printQR(data: string, size?: number): Promise<void> {
    await print.qr(data, { size, media: { preset: DEFAULT_MEDIA_PRESET } });
  }

  async printBarcode(data: string): Promise<void> {
    await print.barcode(data, { media: { preset: DEFAULT_MEDIA_PRESET } });
  }

  async printImageBase64(base64Data: string, options?: PrintImageOptions): Promise<void> {
    const mediaConfig: MediaConfig = options?.media ?? { preset: DEFAULT_MEDIA_PRESET };
    loggerAdapter.info(`Printing image with media preset: ${mediaConfig.preset ?? "custom"}`);
    await print.imageBase64(base64Data, { ...options, media: mediaConfig });
  }

  async printPdfBase64(base64Data: string, page: number = 1): Promise<void> {
    await print.pdfBase64(base64Data, { page, media: { preset: DEFAULT_MEDIA_PRESET } });
  }
}

export const PrinterAdapter = new PrinterAdapterImpl();
