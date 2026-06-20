import { BluetoothDevice } from "@sincpro/mobile/adapters/Printer.adapter";
import { ISelectedPrinter } from "@sincpro/mobile/domain/print";
import { bluetoothService } from "@sincpro/mobile/services/bluetooth.service";
import { printerService } from "@sincpro/mobile/services/printer.service";
import { BluetoothDeviceSelectorModal } from "@sincpro/mobile/ui/components/molecules/BluetoothDeviceSelectorModal";
import { Display, Form } from "@sincpro/mobile-ui";
import PrinterIcon from "@sincpro/mobile-ui/icons/PrinterIcon";
import { Typography } from "@sincpro/mobile-ui/Typography";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { tv } from "tailwind-variants";

interface BluetoothPrinterSelectorProps {
  onPrinterSelected?: (printer: ISelectedPrinter) => void;
  onConnectionChange?: (isConnected: boolean) => void;
}

const statusTextVariants = tv({
  variants: {
    granted: {
      true: "text-green-600",
      false: "text-red-500",
    },
  },
});

function PermissionRequired({
  loading,
  onRequestPermission,
}: {
  loading: boolean;
  onRequestPermission: () => void;
}) {
  return (
    <>
      <Typography.Text className={statusTextVariants({ granted: false })}>
        Permiso de Bluetooth requerido
      </Typography.Text>
      <Form.Button
        loading={loading}
        onPress={onRequestPermission}
        size="small"
        title="Solicitar Permiso"
      />
    </>
  );
}

function PrinterInfo({
  printer,
  isConnected,
  loading,
  onConnect,
  onTestPrint,
  onChangePrinter,
}: {
  printer: ISelectedPrinter;
  isConnected: boolean;
  loading: boolean;
  onConnect: () => void;
  onTestPrint: () => void;
  onChangePrinter: () => void;
}) {
  return (
    <View className="mt-2 bg-white rounded-lg p-3">
      <Typography.Text className="text-gray-700" semibold>
        {printer.name}
      </Typography.Text>
      <Typography.Text className="text-gray-400 text-xs">{printer.address}</Typography.Text>

      <View className="flex-row gap-2 mt-2">
        {!isConnected ? (
          <Form.Button
            loading={loading}
            onPress={onConnect}
            size="small"
            title="Conectar"
            variant="primary"
          />
        ) : (
          <Form.Button
            loading={loading}
            onPress={onTestPrint}
            size="small"
            title="Imprimir Prueba"
            variant="secondary"
          />
        )}
        <Form.Button
          onPress={onChangePrinter}
          size="small"
          title="Cambiar"
          variant="outline"
        />
      </View>

      {isConnected && (
        <View className="flex-row items-center mt-2">
          <View className="w-2 h-2 rounded-full bg-green-500 mr-2" />
          <Typography.Text className="text-green-600 text-xs">Conectado</Typography.Text>
        </View>
      )}
    </View>
  );
}

function NoPrinterSelected({
  loading,
  onSelectPrinter,
}: {
  loading: boolean;
  onSelectPrinter: () => void;
}) {
  return (
    <Form.Button
      loading={loading}
      onPress={onSelectPrinter}
      size="small"
      title="Seleccionar Impresora"
    />
  );
}

function BluetoothPrinterSelector({
  onPrinterSelected,
  onConnectionChange,
}: BluetoothPrinterSelectorProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [selectedPrinter, setSelectedPrinter] = useState<ISelectedPrinter | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectorVisible, setSelectorVisible] = useState(false);

  const checkStatus = useCallback(async () => {
    const permissions = await bluetoothService.checkPermissions();
    setHasPermission(permissions.isGranted);

    const printer = await printerService.getSelectedPrinter();
    setSelectedPrinter(printer);

    const connected = printerService.isConnected();
    setIsConnected(connected);
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  useEffect(() => {
    onConnectionChange?.(isConnected);
  }, [isConnected, onConnectionChange]);

  async function handleRequestPermission() {
    setLoading(true);
    try {
      const permissions = await bluetoothService.requestPermissions();
      setHasPermission(permissions.isGranted);
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    if (!selectedPrinter) return;

    setLoading(true);
    try {
      const connected = await printerService.connect(
        selectedPrinter.address,
        selectedPrinter.name,
      );
      setIsConnected(connected);
    } finally {
      setLoading(false);
    }
  }

  async function handleTestPrint() {
    setLoading(true);
    try {
      await printerService.printTestPage();
    } finally {
      setLoading(false);
    }
  }

  function handleDeviceSelected(device: BluetoothDevice) {
    checkStatus();
    setSelectorVisible(false);

    const printer: ISelectedPrinter = {
      name: device.name || "Impresora",
      address: device.address,
      selectedAt: new Date().toISOString(),
    };
    onPrinterSelected?.(printer);
  }

  const granted = hasPermission === true;

  return (
    <View className="bg-slate-50 rounded-xl p-5 my-2.5 shadow-sm">
      <View className="flex-row items-start">
        <Display.Icon
          color={granted ? "#22c55e" : "#ef4444"}
          customIcon={PrinterIcon}
          size={35}
          type="custom"
        />
        <View className="ml-2.5 flex-1">
          <Typography.Text className="text-base mb-1" semibold>
            Impresora Bluetooth
          </Typography.Text>

          {hasPermission === null ? (
            <Typography.Text className="text-gray-500">
              Verificando permisos...
            </Typography.Text>
          ) : !granted ? (
            <PermissionRequired
              loading={loading}
              onRequestPermission={handleRequestPermission}
            />
          ) : (
            <>
              <Typography.Text className={statusTextVariants({ granted: true })}>
                Bluetooth habilitado
              </Typography.Text>

              {selectedPrinter ? (
                <PrinterInfo
                  isConnected={isConnected}
                  loading={loading}
                  onChangePrinter={() => setSelectorVisible(true)}
                  onConnect={handleConnect}
                  onTestPrint={handleTestPrint}
                  printer={selectedPrinter}
                />
              ) : (
                <NoPrinterSelected
                  loading={loading}
                  onSelectPrinter={() => setSelectorVisible(true)}
                />
              )}
            </>
          )}
        </View>
      </View>

      <BluetoothDeviceSelectorModal
        onClose={() => setSelectorVisible(false)}
        onSelect={handleDeviceSelected}
        visible={selectorVisible}
      />
    </View>
  );
}

export { BluetoothPrinterSelector };
