export {
  getPrinterDriver,
  hasPrinterDriver,
  setPrinterDriver,
} from "@sincpro/mobile/domain/print/driver_registry";
export {
  EPrintJobScope,
  EPrintPages,
  type PrintJob,
  type PrintJobOffer,
  type PrintJobPrompt,
  type PrintJobStore,
  type PrintPage,
} from "@sincpro/mobile/domain/print/print_job";
export type {
  BluetoothDevice,
  IPrinterConnection,
  IPrinterDriver,
  ISelectedPrinter,
  PairedPrinter,
  PrinterConnectionState,
  PrintTextOptions,
} from "@sincpro/mobile/domain/print/printer";
