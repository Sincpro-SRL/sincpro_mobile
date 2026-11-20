import { EPrintJobScope, type PrintJobOffer } from "@sincpro/mobile/domain/print";
import { PrintJobSheetView } from "@sincpro/mobile/ui/printer";
import { Actions } from "@sincpro/mobile-ui/Actions";
import { Typography } from "@sincpro/mobile-ui/Typography";
import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";

const TICKET =
  "iVBORw0KGgoAAAANSUhEUgAAADYAAAAeCAAAAABC0bJaAAAANElEQVR4nGP4TxZgoLc2BpIBZdpIdOBI0UZsGA5Fv5GpbTRIMLSNBgk1tJEKKNFGDiBTGwA4/cF3CchlLwAAAABJRU5ErkJggg==";

function offerAt(printed: number, total: number): PrintJobOffer {
  return {
    job: { id: "story", title: "Punto de venta tickets", total, printed },
    next: { image: TICKET, width: 544, height: 300 },
  };
}

/** The sheet as a person goes through it: each choice moves the job as the use cases do. */
function Walkthrough({ total, printed: start }: { total: number; printed: number }) {
  const [printed, setPrinted] = useState(start);
  const [open, setOpen] = useState(true);
  const [log, setLog] = useState<string[]>([]);

  const print = (scope: EPrintJobScope) => {
    const to = scope === EPrintJobScope.NEXT ? printed + 1 : total;
    setLog((lines) => [...lines, `Impresas ${printed + 1}–${to} de ${total}`]);
    setPrinted(to);
    if (to === total) setOpen(false);
  };

  return (
    <View className="flex-1 gap-3 p-4">
      <Actions.Button
        onPress={() => {
          setPrinted(start);
          setLog([]);
          setOpen(true);
        }}
        title="Empezar de nuevo"
        variant="secondary"
      />
      {log.map((line) => (
        <Typography.Text key={line} variant="bodySmall">
          {line}
        </Typography.Text>
      ))}
      <PrintJobSheetView
        offer={open ? offerAt(printed, total) : null}
        onCancel={() => {
          setLog((lines) => [...lines, `Cancelada con ${printed} de ${total} impresas`]);
          setOpen(false);
        }}
        onPrint={print}
      />
    </View>
  );
}

const meta = {
  title: "Framework/Impresión por páginas",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Elegir: Story = {
  render: () => <Walkthrough printed={0} total={10} />,
};

export const UnoPorUno: Story = {
  render: () => <Walkthrough printed={3} total={10} />,
};

export const UltimaPagina: Story = {
  render: () => <Walkthrough printed={9} total={10} />,
};

export const Enviando: Story = {
  render: () => (
    <View className="flex-1">
      <PrintJobSheetView
        busy
        offer={offerAt(3, 10)}
        onCancel={() => undefined}
        onPrint={() => undefined}
      />
    </View>
  ),
};
