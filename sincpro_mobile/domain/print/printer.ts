export interface ISelectedPrinter {
  name: string;
  address: string;
  selectedAt: string;
}

export interface BluetoothDevice {
  name: string;
  address: string;
  isPrinter?: boolean;
}

export interface PairedPrinter {
  name: string;
  address: string;
  isPrinter?: boolean;
}

export interface PrintTextOptions {
  alignment?: "left" | "center" | "right";
  bold?: boolean;
  fontSize?: "small" | "medium" | "large";
}

/**
 * Puerto del driver de impresora. El core es agnóstico del hardware: la app
 * (o un addon) provee una implementación concreta (p. ej. Bluetooth vía
 * @sincpro/printer-expo) y la registra con setPrinterDriver() al bootstrap.
 */
export type PrinterConnectionState = "DISCONNECTED" | "CONNECTING" | "CONNECTED";

export interface IPrinterConnection {
  state: PrinterConnectionState;
  address: string | null;
  /** `link_lost`: la impresora se apagó o salió de rango estando conectada. */
  reason?: "connected" | "user_disconnect" | "link_lost" | "connect_failed";
}

export interface IPrinterDriver {
  getPairedDevices(): BluetoothDevice[];
  getPairedPrinters(): PairedPrinter[];
  /** iOS descubre impresoras (clásico MFi + BLE); Android devuelve las vinculadas. */
  scanPrinters(): Promise<BluetoothDevice[]>;
  isConnected(): boolean;
  getConnection(): IPrinterConnection;
  /** Devuelve la función para cancelar la suscripción. */
  onConnectionChange(listener: (connection: IPrinterConnection) => void): () => void;
  connectBluetooth(address: string, timeoutMs?: number): Promise<void>;
  disconnect(): Promise<void>;
  printText(text: string, options?: PrintTextOptions): Promise<void>;
  printImageBase64(base64Data: string, options?: unknown): Promise<void>;
  printPdfBase64(base64Data: string, page?: number): Promise<void>;
}
