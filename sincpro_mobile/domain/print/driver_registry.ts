import type { IPrinterDriver } from "@sincpro/mobile/domain/print/printer";
import { loggerUseCases } from "@sincpro/mobile/infrastructure/logger";

const noopDriver: IPrinterDriver = {
  getPairedDevices: () => [],
  getPairedPrinters: () => [],
  isConnected: () => false,
  connectBluetooth: async () => {
    loggerUseCases.warn("Printer driver no registrado: connectBluetooth ignorado");
  },
  disconnect: async () => {},
  printText: async () => {
    loggerUseCases.warn("Printer driver no registrado: printText ignorado");
  },
  printImageBase64: async () => {
    loggerUseCases.warn("Printer driver no registrado: printImageBase64 ignorado");
  },
  printPdfBase64: async () => {
    loggerUseCases.warn("Printer driver no registrado: printPdfBase64 ignorado");
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
