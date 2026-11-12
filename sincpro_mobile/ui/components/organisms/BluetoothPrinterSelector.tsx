import { EPermission } from "@sincpro/mobile/domain/permissions";
import { BluetoothDevice, ISelectedPrinter } from "@sincpro/mobile/domain/print";
import {
  CommandConnectPrinter,
  CommandPrinterStatus,
  CommandPrintTestPage,
  commonBoundedContext,
} from "@sincpro/mobile/services";
import { withCleanup } from "@sincpro/mobile/tools/utils/async";
import PrinterIcon from "@sincpro/mobile/ui/components/atoms/PrinterIcon";
import { BluetoothDeviceSelectorModal } from "@sincpro/mobile/ui/components/molecules/BluetoothDeviceSelectorModal";
import {
  type PermissionPrompt,
  permissionPrompt,
  usePermission,
} from "@sincpro/mobile/ui/permissions";
import { Actions } from "@sincpro/mobile-ui/Actions";
import { Display } from "@sincpro/mobile-ui/Display";
import { useTheme } from "@sincpro/mobile-ui/theme";
import { Typography } from "@sincpro/mobile-ui/Typography";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { tv } from "tailwind-variants";

interface BluetoothPrinterSelectorProps {
  onPrinterSelected?: (printer: ISelectedPrinter) => void;
  onConnectionChange?: (isConnected: boolean) => void;
  /** Render as section rows (no outer card) — use inside FormViewV2.Content.Section. */
  compact?: boolean;
}

const statusTextVariants = tv({
  variants: {
    granted: {
      true: "text-success",
      false: "text-danger",
    },
  },
});

function PermissionRequired({
  prompt,
  loading,
  onAct,
}: {
  prompt: PermissionPrompt;
  loading: boolean;
  onAct: () => void;
}) {
  return (
    <>
      <Typography.Text className={statusTextVariants({ granted: false })}>
        {prompt.message}
      </Typography.Text>
      {prompt.actionLabel ? (
        <Actions.Button
          className="mt-2"
          loading={loading}
          onPress={onAct}
          size="small"
          title={prompt.actionLabel}
          variant="cta"
        />
      ) : null}
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
    <View className="mt-3">
      <Typography.Text className="text-text-primary" semibold>
        {printer.name}
      </Typography.Text>
      <Typography.Text className="text-text-tertiary">{printer.address}</Typography.Text>

      <View className="flex-row gap-2 mt-2">
        {!isConnected ? (
          <Actions.Button
            loading={loading}
            onPress={onConnect}
            size="small"
            title="Conectar"
            variant="cta"
          />
        ) : (
          <Actions.Button
            loading={loading}
            onPress={onTestPrint}
            size="small"
            title="Imprimir Prueba"
            variant="secondary"
          />
        )}
        <Actions.Button
          onPress={onChangePrinter}
          size="small"
          title="Cambiar"
          variant="outline"
        />
      </View>

      {isConnected && (
        <View className="flex-row items-center mt-2">
          <View className="w-2 h-2 rounded-full bg-success mr-2" />
          <Typography.Text className="text-success">Conectado</Typography.Text>
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
    <Actions.Button
      loading={loading}
      onPress={onSelectPrinter}
      size="small"
      title="Seleccionar Impresora"
      variant="cta"
    />
  );
}

function BluetoothPrinterSelector({
  onPrinterSelected,
  onConnectionChange,
  compact = false,
}: BluetoothPrinterSelectorProps) {
  const theme = useTheme();
  const bluetooth = usePermission(EPermission.BLUETOOTH);
  const prompt = permissionPrompt(EPermission.BLUETOOTH, bluetooth.status);
  const [selectedPrinter, setSelectedPrinter] = useState<ISelectedPrinter | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectorVisible, setSelectorVisible] = useState(false);

  const checkStatus = useCallback(async () => {
    const status = await commonBoundedContext.execute(new CommandPrinterStatus());
    setSelectedPrinter(status.selected);
    setIsConnected(status.connected);
  }, []);

  useEffect(() => {
    // Async side effect on mount — checkStatus does sync setState internally,
    // which is the documented React 19 pattern for on-mount async work.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkStatus();
  }, [checkStatus]);

  // El driver avisa cuando la impresora se conecta, se desconecta o se pierde el enlace
  // (apagada o fuera de rango), así el estado mostrado no queda congelado.
  useEffect(
    () =>
      commonBoundedContext.deps.printer.onConnectionChange((connection) => {
        setIsConnected(connection.state === "CONNECTED");
      }),
    [],
  );

  useEffect(() => {
    onConnectionChange?.(isConnected);
  }, [isConnected, onConnectionChange]);

  /** Asks for Bluetooth, or opens the settings when it is blocked; the run tells the answer. */
  function handlePermission() {
    if (prompt.action) void bluetooth.act(prompt.action).catch(() => undefined);
  }

  async function handleConnect() {
    if (!selectedPrinter) return;

    setLoading(true);
    return withCleanup(
      async () => {
        // A failure was already told to the person and recorded by its run.
        const connected = await commonBoundedContext
          .execute(new CommandConnectPrinter(selectedPrinter.address, selectedPrinter.name))
          .then(
            () => true,
            () => false,
          );
        setIsConnected(connected);
      },
      () => setLoading(false),
    );
  }

  async function handleTestPrint() {
    setLoading(true);
    return withCleanup(
      async () => {
        // The use case tells the person whether it printed, and its run records why not.
        await commonBoundedContext.execute(new CommandPrintTestPage()).catch(() => undefined);
      },
      () => setLoading(false),
    );
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

  const granted = bluetooth.granted;

  const modal = (
    <BluetoothDeviceSelectorModal
      onClose={() => setSelectorVisible(false)}
      onSelect={handleDeviceSelected}
      visible={selectorVisible}
    />
  );

  if (compact) {
    if (bluetooth.status === undefined) {
      return (
        <>
          <Display.MenuButton
            description="Verificando permisos..."
            icon={PrinterIcon}
            label="Impresora Bluetooth"
            showDivider={false}
          />
          {modal}
        </>
      );
    }

    if (!granted) {
      return (
        <>
          <Display.MenuButton
            description={prompt.message}
            icon={PrinterIcon}
            label="Impresora Bluetooth"
            onPress={prompt.action && !bluetooth.busy ? handlePermission : undefined}
            showDivider={false}
          />
          {modal}
        </>
      );
    }

    if (!selectedPrinter) {
      return (
        <>
          <Display.MenuButton
            description="No configurada"
            icon={PrinterIcon}
            label="Impresora Bluetooth"
            onPress={() => setSelectorVisible(true)}
            showDivider={false}
          />
          {modal}
        </>
      );
    }

    return (
      <>
        <Display.MenuButton
          description={
            loading
              ? "Conectando..."
              : isConnected
                ? "Conectado"
                : "Sin conexión — toca para conectar"
          }
          icon={PrinterIcon}
          label={selectedPrinter.name}
          onPress={!isConnected && !loading ? handleConnect : undefined}
        />
        <Display.MenuButton
          description="Seleccionar otro dispositivo"
          icon={PrinterIcon}
          label="Cambiar impresora"
          onPress={() => setSelectorVisible(true)}
          showDivider={false}
        />
        {modal}
      </>
    );
  }

  return (
    <Display.Card className="my-2.5">
      <View className="flex-row items-start">
        <PrinterIcon color={granted ? theme.success : theme.danger} size={24} />
        <View className="ml-2.5 flex-1">
          <Typography.Text className="mb-1" semibold>
            Impresora Bluetooth
          </Typography.Text>

          {bluetooth.status === undefined ? (
            <Typography.Text className="text-text-secondary">
              Verificando permisos...
            </Typography.Text>
          ) : !granted ? (
            <PermissionRequired
              loading={bluetooth.busy}
              onAct={handlePermission}
              prompt={prompt}
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
    </Display.Card>
  );
}

export { BluetoothPrinterSelector };
