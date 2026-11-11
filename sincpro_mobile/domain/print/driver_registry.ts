import { logger } from "@sincpro/client-framework";
import type { IPrinterDriver } from "@sincpro/mobile/domain/print/printer";

const noopDriver: IPrinterDriver = {
  getPairedDevices: () => [],
  getPairedPrinters: () => [],
  scanPrinters: async () => [],
  isConnected: () => false,
  getConnection: () => ({ state: "DISCONNECTED", address: null }),
  onConnectionChange: () => () => {},
  connectBluetooth: async () => {
    logger.warn("Printer driver no registrado: connectBluetooth ignorado");
  },
  disconnect: async () => {},
  printText: async () => {
    logger.warn("Printer driver no registrado: printText ignorado");
  },
  printImageBase64: async () => {
    logger.warn("Printer driver no registrado: printImageBase64 ignorado");
  },
  printPdfBase64: async () => {
    logger.warn("Printer driver no registrado: printPdfBase64 ignorado");
  },
};

let driver: IPrinterDriver = noopDriver;

export function setPrinterDriver(impl: IPrinterDriver): void {
  driver = impl;
}

export function getPrinterDriver(): IPrinterDriver {
  return driver;
}

export function hasPrinterDriver(): boolean {
  return driver !== noopDriver;
}
