import { BluetoothDevice } from "@sincpro/mobile/domain/print";
import { bluetoothService } from "@sincpro/mobile/services/bluetooth.service";
import { printerService } from "@sincpro/mobile/services/printer.service";
import { withCleanup } from "@sincpro/mobile/tools/utils/async";
import PrinterIcon from "@sincpro/mobile/ui/components/atoms/PrinterIcon";
import { Actions } from "@sincpro/mobile-ui/Actions";
import Sheet from "@sincpro/mobile-ui/Dialog/Sheet";
import { Display } from "@sincpro/mobile-ui/Display";
import { Pressable } from "@sincpro/mobile-ui/primitives/Pressable";
import { useTheme } from "@sincpro/mobile-ui/theme";
import { Typography } from "@sincpro/mobile-ui/Typography";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

interface BluetoothDeviceSelectorModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (device: BluetoothDevice) => void;
}

interface DeviceRowProps {
  device: BluetoothDevice;
  onSelect: () => void;
  isSelected: boolean;
}

function DeviceRow({ device, onSelect, isSelected }: DeviceRowProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      className="flex-row items-center border-b border-border-default py-3"
      onPress={onSelect}
      style={{ backgroundColor: isSelected ? theme.bg.muted : "transparent" }}
    >
      <PrinterIcon
        color={device.isPrinter ? theme.success : theme.text.secondary}
        size={22}
      />
      <View className="ml-3 min-w-0 flex-1">
        <Typography.Text semibold>{device.name || "Dispositivo sin nombre"}</Typography.Text>
        <Typography.Text className="text-text-tertiary" variant="caption">
          {device.address}
        </Typography.Text>
        {device.isPrinter ? (
          <Typography.Text className="text-success" variant="caption">
            Impresora
          </Typography.Text>
        ) : null}
      </View>
      {isSelected ? <Display.Icon color={theme.success} name="check" size={18} /> : null}
    </Pressable>
  );
}

function EmptyState() {
  const theme = useTheme();
  return (
    <View className="p-8 items-center justify-center" style={{ minHeight: 250 }}>
      <PrinterIcon color={theme.text.tertiary} size={40} />
      <Typography.Text className="text-text-secondary text-center mt-4">
        {"No hay dispositivos vinculados"}
      </Typography.Text>
      <Typography.Text className="text-text-tertiary text-center mt-2">
        {"Vincula una impresora desde configuración de Bluetooth del sistema"}
      </Typography.Text>
    </View>
  );
}

function BluetoothDeviceSelectorModal({
  visible,
  onClose,
  onSelect,
}: BluetoothDeviceSelectorModalProps) {
  const theme = useTheme();
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<BluetoothDevice | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [prevVisible, setPrevVisible] = useState(visible);

  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setSelectedDevice(null);
    }
  }

  const loadDevices = useCallback(async () => {
    setLoading(true);
    return withCleanup(
      async () => {
        const hasPermission = await bluetoothService.ensurePermissionsForPrinter();
        if (!hasPermission) return;

        setDevices(await printerService.scanPrinters());
      },
      () => setLoading(false),
    );
  }, []);

  useEffect(() => {
    if (visible) {
      Promise.resolve().then(() => loadDevices());
    }
  }, [visible, loadDevices]);

  async function handleConfirm() {
    if (!selectedDevice) return;

    setConnecting(true);
    return withCleanup(
      async () => {
        const success = await printerService.connect(
          selectedDevice.address,
          selectedDevice.name || "Impresora",
        );

        if (success) {
          onSelect(selectedDevice);
          onClose();
        }
      },
      () => setConnecting(false),
    );
  }

  const printers = devices.filter((d) => d.isPrinter);
  const otherDevices = devices.filter((d) => !d.isPrinter);

  function renderRow(item: BluetoothDevice) {
    return (
      <DeviceRow
        device={item}
        isSelected={selectedDevice?.address === item.address}
        key={item.address}
        onSelect={() => setSelectedDevice(item)}
      />
    );
  }

  return (
    <Sheet onClose={onClose} title="Seleccionar Impresora" visible={visible}>
      <View className="flex-row items-center justify-between mb-3">
        <Typography.Text className="text-text-secondary">
          Dispositivos Bluetooth vinculados
        </Typography.Text>
        <Pressable
          accessibilityLabel="Actualizar"
          accessibilityRole="button"
          disabled={loading}
          hitSlop={8}
          onPress={loadDevices}
        >
          <Display.Icon color={theme.icon.secondary} name="sync" size={20} />
        </Pressable>
      </View>

      {devices.length === 0 && !loading ? (
        <EmptyState />
      ) : (
        <View>
          {printers.length > 0 ? (
            <Typography.Text className="text-text-secondary px-1 py-1" semibold>
              Impresoras ({printers.length})
            </Typography.Text>
          ) : null}
          {printers.map(renderRow)}

          {otherDevices.length > 0 ? (
            <Typography.Text className="text-text-secondary px-1 py-1 mt-1" semibold>
              Otros dispositivos ({otherDevices.length})
            </Typography.Text>
          ) : null}
          {otherDevices.map(renderRow)}
        </View>
      )}

      <View className="flex-row gap-2 mt-4">
        <View className="flex-1">
          <Actions.Button onPress={onClose} title="Cancelar" variant="outline" />
        </View>
        {selectedDevice ? (
          <View className="flex-1">
            <Actions.Button
              loading={connecting}
              onPress={handleConfirm}
              title={"Conectar"}
              variant="cta"
            />
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

export { BluetoothDeviceSelectorModal };
