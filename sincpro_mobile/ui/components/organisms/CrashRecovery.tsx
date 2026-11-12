import { Debug } from "@sincpro/mobile/infrastructure/debug";
import { processObservability } from "@sincpro/mobile/infrastructure/observability";
import { CommandSendErrorReport, commonBoundedContext } from "@sincpro/mobile/services";
import { withCleanup } from "@sincpro/mobile/tools/utils/async";
import { Actions } from "@sincpro/mobile-ui/Actions";
import { Display } from "@sincpro/mobile-ui/Display";
import { useTheme } from "@sincpro/mobile-ui/theme";
import { Typography } from "@sincpro/mobile-ui/Typography";
import { useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface CrashRecoveryProps {
  error: Error;
  /** Mounts the app's screens again, from the start. */
  onRetry: () => void;
  /** The error's name and message under the text; by default, while debug mode is on. */
  showDetails?: boolean;
  /** «Enviar reporte»; by default, when this build sends its log lines somewhere. */
  canSendReport?: boolean;
}

/**
 * What the person sees when a screen broke while drawing, in place of a blank one: «Algo salió
 * mal», «Reintentar» (the screens mount again) and «Enviar reporte» (what the app logged leaves
 * now). The error was already logged and reported when it happened; with debug mode on it is
 * shown too. It owns its four edges: no header nor tabs are drawn above it.
 */
export function CrashRecovery({
  error,
  onRetry,
  showDetails = Debug.isEnabled(),
  canSendReport = processObservability()?.telemetry !== undefined,
}: CrashRecoveryProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [sending, setSending] = useState(false);

  function sendReport() {
    setSending(true);
    // The run tells the person whether it left; a failure is recorded by it.
    return withCleanup(
      () => commonBoundedContext.execute(new CommandSendErrorReport()).catch(() => undefined),
      () => setSending(false),
    );
  }

  return (
    <View
      className="flex-1 items-center justify-center gap-4 bg-bg-page"
      style={{
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        paddingLeft: insets.left + 24,
        paddingRight: insets.right + 24,
      }}
      testID="crash-recovery"
    >
      <Display.Icon color={theme.danger} name="error" size={48} />
      <Typography.Text align="center" semibold variant="h4">
        Algo salió mal
      </Typography.Text>
      <Typography.Text align="center" className="text-text-secondary">
        Esta pantalla se cerró por un error. Puedes reintentar; si vuelve a pasar, envía el
        reporte.
      </Typography.Text>
      {showDetails ? (
        <Typography.Text align="center" className="text-text-tertiary" variant="caption">
          {`${error.name}: ${error.message}`}
        </Typography.Text>
      ) : null}
      <View className="w-full gap-2">
        <Actions.Button onPress={onRetry} title="Reintentar" variant="cta" />
        {canSendReport ? (
          <Actions.Button
            loading={sending}
            onPress={sendReport}
            title="Enviar reporte"
            variant="secondary"
          />
        ) : null}
      </View>
    </View>
  );
}
