import { Display, Form } from "@sincpro/mobile-ui";
import { BottomSheet } from "@sincpro/mobile-ui/Dialog/BottomSheet";
import PrinterIcon from "@sincpro/mobile-ui/icons/PrinterIcon";
import { theme } from "@sincpro/mobile-ui/theme";
import { Typography } from "@sincpro/mobile-ui/Typography";
import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, TouchableOpacity, View } from "react-native";

import { BluetoothDevice } from "../../../adapters/Printer.adapter";
import { bluetoothService } from "../../../services/bluetooth.service";
import { printerService } from "../../../services/printer.service";

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
      className={`flex-row items-center p-4 border-b border-gray-100 ${
        isSelected ? "bg-green-50" : "bg-white"
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
        <Typography.Text className="text-gray-400 text-xs">{device.address}</Typography.Text>
        {device.isPrinter && (
          <Typography.Text className="text-green-600 text-xs">
            {"Impresora detectada"}
          </Typography.Text>
        )}
      </View>
      {isSelected && (
        <View className="w-6 h-6 rounded-full bg-green-500 items-center justify-center">
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
      <Typography.Text className="text-gray-500 text-center mt-4">
        {"No hay dispositivos vinculados"}
      </Typography.Text>
      <Typography.Text className="text-gray-400 text-center text-sm mt-2">
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
  const allDevices = [...printers, ...otherDevices];

  return (
    <BottomSheet.Root onClose={onClose} size="large" visible={visible}>
      <BottomSheet.Header>
        <View className="px-5 pb-3">
          <Typography.Text bold variant="subtitle">
            Seleccionar Impresora
          </Typography.Text>
          <Typography.Text className="text-gray-500 text-xs">
            Dispositivos Bluetooth vinculados
          </Typography.Text>
        </View>
      </BottomSheet.Header>

      <BottomSheet.Content scrollable>
        {devices.length === 0 && !loading ? (
          <EmptyState />
        ) : (
          <FlatList
            data={allDevices}
            keyExtractor={(item) => item.address}
            ListHeaderComponent={
              printers.length > 0 ? (
                <Typography.Text className="text-gray-600 px-4 py-2 bg-gray-50" semibold>
                  Impresoras ({printers.length})
                </Typography.Text>
              ) : null
            }
            refreshControl={<RefreshControl onRefresh={loadDevices} refreshing={loading} />}
            renderItem={({ item, index }) => (
              <>
                {index === printers.length && otherDevices.length > 0 && (
                  <Typography.Text className="text-gray-600 px-4 py-2 bg-gray-50" semibold>
                    Otros dispositivos ({otherDevices.length})
                  </Typography.Text>
                )}
                <DeviceRow
                  device={item}
                  isSelected={selectedDevice?.address === item.address}
                  onSelect={() => setSelectedDevice(item)}
                />
              </>
            )}
            scrollEnabled={false}
          />
        )}
      </BottomSheet.Content>

      <BottomSheet.Actions layout="horizontal">
        <View className="flex-1">
          <Form.Button onPress={onClose} title="Cancelar" variant="outline" />
        </View>
        {selectedDevice && (
          <View className="flex-1">
            <Form.Button
              loading={connecting}
              onPress={handleConfirm}
              title={"Conectar"}
              variant="primary"
            />
          </View>
        )}
      </BottomSheet.Actions>
    </BottomSheet.Root>
  );
}

export { BluetoothDeviceSelectorModal };
