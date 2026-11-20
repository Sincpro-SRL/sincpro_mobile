import { EPrintJobScope, type PrintJobOffer } from "@sincpro/mobile/domain/print";
import { printJobPrompt } from "@sincpro/mobile/infrastructure/print/print_job_prompt";
import {
  CommandCancelPrintJob,
  CommandPrintJobPages,
  commonBoundedContext,
} from "@sincpro/mobile/services";
import { Actions } from "@sincpro/mobile-ui/Actions";
import Sheet from "@sincpro/mobile-ui/Dialog/Sheet";
import { Display } from "@sincpro/mobile-ui/Display";
import { Typography } from "@sincpro/mobile-ui/Typography";
import { useState, useSyncExternalStore } from "react";
import { View } from "react-native";

const PREVIEW_HEIGHT = 240;

export interface PrintJobSheetViewProps {
  /** The job waiting for the person; `null` closes the sheet. */
  offer: PrintJobOffer | null;
  /** A choice is being sent: the buttons wait. */
  busy?: boolean;
  onPrint: (scope: EPrintJobScope) => void;
  onCancel: () => void;
}

function pagesLabel(count: number): string {
  return count === 1 ? "1 página" : `${count} páginas`;
}

/**
 * A print of N pages in front of the person: first every page or one at a time, then the next
 * one, the rest, or stop. It never closes on a swipe — a job left behind is a ticket not
 * handed over —, only when the job ends or the person cancels it.
 */
export function PrintJobSheetView({
  offer,
  busy = false,
  onPrint,
  onCancel,
}: PrintJobSheetViewProps) {
  const [shown, setShown] = useState(offer);
  if (offer && offer !== shown) setShown(offer);
  if (!shown) return null;

  const { job, next } = shown;
  const left = job.total - job.printed;
  const choosing = job.printed === 0;
  const footer = choosing ? (
    <View className="gap-2">
      <Actions.Button
        disabled={busy}
        onPress={() => onPrint(EPrintJobScope.REST)}
        testID="print-job-all"
        title={`Imprimir todo (${job.total})`}
        variant="cta"
      />
      <Actions.Button
        disabled={busy}
        onPress={() => onPrint(EPrintJobScope.NEXT)}
        testID="print-job-step"
        title="Uno por uno"
        variant="secondary"
      />
      <Actions.Button
        confirm={`No se imprimirá ninguna de las ${pagesLabel(job.total)}.`}
        disabled={busy}
        onPress={onCancel}
        testID="print-job-cancel"
        title="Cancelar"
        variant="link"
      />
    </View>
  ) : (
    <View className="gap-2">
      <Actions.Button
        disabled={busy}
        onPress={() => onPrint(EPrintJobScope.NEXT)}
        testID="print-job-next"
        title="Siguiente"
        variant="cta"
      />
      {left > 1 ? (
        <Actions.Button
          disabled={busy}
          onPress={() => onPrint(EPrintJobScope.REST)}
          testID="print-job-rest"
          title={`Imprimir las ${left} restantes`}
          variant="secondary"
        />
      ) : null}
      <Actions.Button
        confirm={`No se imprimirán las ${pagesLabel(left)} que faltan.`}
        disabled={busy}
        onPress={onCancel}
        testID="print-job-cancel"
        title={`Cancelar ${left > 1 ? `las ${left} restantes` : "la última"}`}
        variant="link"
      />
    </View>
  );

  return (
    <Sheet
      dismissible={false}
      footer={footer}
      onClose={() => undefined}
      onClosed={() => {
        if (!offer) setShown(null);
      }}
      scrollable
      snapPoints={["62%", "90%"]}
      testID="print-job-sheet"
      title={job.title || "Impresión"}
      visible={offer !== null}
    >
      <View className="gap-3 pb-2">
        <Typography.Text className="text-text-secondary" variant="bodySmall">
          {choosing
            ? `${pagesLabel(job.total)} para imprimir`
            : `Página ${job.printed + 1} de ${job.total} · ${job.printed} impresas`}
        </Typography.Text>
        {next ? (
          <View className="items-center rounded-xl bg-bg-muted p-2">
            <Display.Image
              accessibilityLabel={`Página ${job.printed + 1}`}
              contentFit="contain"
              height={PREVIEW_HEIGHT}
              source={{ uri: `data:image/png;base64,${next.image}` }}
              width="100%"
            />
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

/**
 * The sheet of the print jobs waiting for the person, mounted once by the AppShell: it follows
 * `printJobPrompt` and each choice is a Command of `commonBoundedContext`.
 */
export function PrintJobSheet() {
  const offer = useSyncExternalStore(
    printJobPrompt.subscribe,
    printJobPrompt.current,
    printJobPrompt.current,
  );
  const [busy, setBusy] = useState(false);

  const run = (command: CommandPrintJobPages | CommandCancelPrintJob) => {
    setBusy(true);
    // The run records and tells its failure; a second tap on a page that went is refused.
    commonBoundedContext
      .execute(command)
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };

  return (
    <PrintJobSheetView
      busy={busy}
      offer={offer}
      onCancel={() => {
        if (offer) run(new CommandCancelPrintJob(offer.job.id));
      }}
      onPrint={(scope) => {
        if (offer) run(new CommandPrintJobPages(offer.job.id, scope));
      }}
    />
  );
}
