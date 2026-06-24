import { BluetoothDevice } from "@sincpro/mobile/domain/print";
import { bluetoothService } from "@sincpro/mobile/services/bluetooth.service";
import { printerService } from "@sincpro/mobile/services/printer.service";
import PrinterIcon from "@sincpro/mobile/ui/components/atoms/PrinterIcon";
import { Display, Form } from "@sincpro/mobile-ui";
import Sheet from "@sincpro/mobile-ui/Dialog/Sheet";
import { theme } from "@sincpro/mobile-ui/theme";
import { Typography } from "@sincpro/mobile-ui/Typography";
import { useCallback, useEffect, useState } from "react";
import { TouchableOpacity, View } from "react-native";

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
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      className={`flex-row items-center p-4 rounded-xl ${
        isSelected ? "bg-success-light" : "bg-bg-card"
      }`}
      onPress={onSelect}
    >
      <Display.Icon
        color={device.isPrinter ? theme.success : theme.text.secondary}
        customIcon={PrinterIcon}
        size={24}
        type="custom"
      />
      <View className="ml-3 flex-1">
        <Typography.Text semibold>{device.name || "Dispositivo sin nombre"}</Typography.Text>
        <Typography.Text className="text-text-tertiary text-xs">
          {device.address}
        </Typography.Text>
        {device.isPrinter && (
          <Typography.Text className="text-success text-xs">
            {"Impresora detectada"}
          </Typography.Text>
        )}
      </View>
      {isSelected && (
        <View className="w-6 h-6 rounded-full bg-success items-center justify-center">
          <Display.Icon color={theme.text.inverse} name="check" size={16} type="material" />
        </View>
      )}
    </TouchableOpacity>
  );
}

function EmptyState() {
  return (
    <View className="p-8 items-center justify-center" style={{ minHeight: 250 }}>
      <Display.Icon
        color={theme.text.tertiary}
        customIcon={PrinterIcon}
        size={64}
        type="custom"
      />
      <Typography.Text className="text-text-secondary text-center mt-4">
        {"No hay dispositivos vinculados"}
      </Typography.Text>
      <Typography.Text className="text-text-tertiary text-center text-sm mt-2">
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
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<BluetoothDevice | null>(null);
  const [connecting, setConnecting] = useState(false);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      const hasPermission = await bluetoothService.ensurePermissionsForPrinter();
      if (!hasPermission) return;

      const pairedDevices = await printerService.getPairedDevices();
      setDevices(pairedDevices);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      loadDevices();
      setSelectedDevice(null);
    }
  }, [visible, loadDevices]);

  async function handleConfirm() {
    if (!selectedDevice) return;

    setConnecting(true);
    try {
      const success = await printerService.connect(
        selectedDevice.address,
        selectedDevice.name || "Impresora",
      );

      if (success) {
        onSelect(selectedDevice);
        onClose();
      }
    } finally {
      setConnecting(false);
    }
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
        <Typography.Text className="text-text-secondary text-xs">
          Dispositivos Bluetooth vinculados
        </Typography.Text>
        <TouchableOpacity
          accessibilityLabel="Actualizar"
          disabled={loading}
          hitSlop={8}
          onPress={loadDevices}
        >
          <Display.Icon
            color={theme.icon.secondary}
            name="refresh"
            size={20}
            type="material"
          />
        </TouchableOpacity>
      </View>

      {devices.length === 0 && !loading ? (
        <EmptyState />
      ) : (
        <View className="gap-1">
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
          <Form.Button onPress={onClose} title="Cancelar" variant="outline" />
        </View>
        {selectedDevice ? (
          <View className="flex-1">
            <Form.Button
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
