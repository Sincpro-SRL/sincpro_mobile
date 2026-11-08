import { EEventStatus, IntegrationEvent } from "@sincpro/mobile/domain/events";
import { ActivityStrip } from "@sincpro/mobile/ui/activity/ActivityStrip";
import EventTimelineItem from "@sincpro/mobile/ui/components/molecules/EventTimelineItem";
import DeadLetterQueueRow from "@sincpro/mobile/ui/components/organisms/DeadLetterQueueRow";
import EventRow from "@sincpro/mobile/ui/components/organisms/EventRow";
import { EventListHeader } from "@sincpro/mobile/ui/events/event-query-controls";
import { useEventQuery } from "@sincpro/mobile/ui/events/use-event-query";
import { Typography } from "@sincpro/mobile-ui/Typography";
import { ListViewV2 } from "@sincpro/mobile-ui/views/ListViewV2";
import type { Meta, StoryObj } from "@storybook/react-native";
import type { ReactNode } from "react";
import { View } from "react-native";

const ERROR_LIMIT = 150;

function sampleEvent(fields: Partial<IntegrationEvent>): IntegrationEvent {
  const event = IntegrationEvent.create();
  Object.assign(event, fields);
  return event;
}

function clip(detail: string): string {
  return detail.length > ERROR_LIMIT ? `${detail.slice(0, ERROR_LIMIT)}...` : detail;
}

function Scene({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children?: ReactNode;
}) {
  return (
    <View className="mb-6 gap-2">
      <Typography.Text semibold>{title}</Typography.Text>
      {note ? (
        <Typography.Text className="text-text-tertiary" variant="bodySmall">
          {note}
        </Typography.Text>
      ) : null}
      {children}
    </View>
  );
}

const LONG_ERROR =
  "El servidor de Odoo cerró la conexión mientras se publicaba la factura. El reintento agotó el tiempo de espera y la cola dejó el evento en fallidos para revisarlo a mano.";

const meta = {
  title: "Framework/Actividad",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const screen = {
  layout: "fullscreen",
  ownsScroll: true,
  ownsTopInset: true,
} as const;

function EventList({
  name,
  description,
  events,
}: {
  name: string;
  description: string;
  events: IntegrationEvent[];
}) {
  const list = useEventQuery(events);
  return (
    <ListViewV2.Root
      description={description}
      hasMore={list.hasMore}
      items={list.visible}
      name={name}
      onBack={() => undefined}
      onLoadMore={list.loadMore}
    >
      <EventListHeader list={list} />
      <ListViewV2.Content>
        {(event) => <EventRow item={event as IntegrationEvent} onOpen={() => undefined} />}
      </ListViewV2.Content>
    </ListViewV2.Root>
  );
}

export const Procesos: Story = {
  render: () => (
    <View>
      <Scene
        note="Mientras se envía, solo queda esta línea. Tocar no abre nada."
        title="Cola trabajando"
      >
        <ActivityStrip inline label="Creando orden de venta" tone="running" />
      </Scene>
      <Scene
        note="El fallo ocupa el mismo lugar. Tocar muestra el detalle."
        title="Cola falló"
      >
        <ActivityStrip
          detail="El servidor no respondió a tiempo"
          inline
          label="Creando orden de venta"
          tone="failed"
        />
      </Scene>
      <Scene note="El detalle se corta a 150 caracteres." title="Error largo">
        <ActivityStrip
          detail={clip(LONG_ERROR)}
          inline
          label="Publicando factura"
          tone="failed"
        />
      </Scene>
      <Scene
        note="Cuando termina, la línea desaparece. No queda un aviso de éxito."
        title="Cola terminada"
      />
      <Scene
        note="Imprimir sigue en la línea. El aviso de la impresora no se queda encima."
        title="Proceso y dispositivo"
      >
        <ActivityStrip inline label="Imprimiendo..." tone="running" />
      </Scene>
      <Scene
        note="Con el canal de cola apagado no se muestra nada."
        title="Cola silenciada"
      />
    </View>
  ),
};

export const Crons: Story = {
  render: () => (
    <View>
      <Scene note="Sin una cola activa, el primer cron usa la misma línea." title="Un cron">
        <ActivityStrip inline label="Sincronizando distribución" tone="running" />
      </Scene>
      <Scene
        note="Hay dos crons en curso. La línea muestra solo el primero."
        title="Varios crons"
      >
        <ActivityStrip inline label="Sincronizando clientes" tone="running" />
      </Scene>
      <Scene
        note="Si la cola y un cron corren juntos, la línea es de la cola."
        title="La cola gana"
      >
        <ActivityStrip inline label="Creando orden de venta" tone="running" />
      </Scene>
      <Scene note="Tocar la línea abre el detalle, sin una tarjeta." title="Cron falló">
        <ActivityStrip
          detail="No hay red para bajar el catálogo"
          inline
          label="Sincronizando catálogo"
          tone="failed"
        />
      </Scene>
      <Scene
        note="Un cron sin etiqueta no llega a la línea, aunque esté declarado."
        title="Cron sin texto"
      />
    </View>
  ),
};

export const Pendiente: Story = {
  parameters: screen,
  render: () => (
    <EventList
      description="Esperando salida"
      events={[
        sampleEvent({
          name: "sale.order.confirmed",
          label: "Pedido confirmado",
          status: EEventStatus.PENDING,
          attempts: 0,
          sequence: 1,
        }),
      ]}
      name="Eventos"
    />
  ),
};

export const Procesando: Story = {
  parameters: screen,
  render: () => (
    <EventList
      description="En camino al servidor"
      events={[
        sampleEvent({
          name: "sale.order.confirmed",
          label: "Pedido confirmado",
          status: EEventStatus.PROCESSING,
          attempts: 1,
          sequence: 2,
        }),
      ]}
      name="Eventos"
    />
  ),
};

export const Reconocido: Story = {
  parameters: screen,
  render: () => (
    <EventList
      description="El servidor ya lo aceptó"
      events={[
        sampleEvent({
          name: "sale.order.confirmed",
          label: "Pedido confirmado",
          status: EEventStatus.ACKNOWLEDGED,
          attempts: 1,
          sequence: 3,
        }),
      ]}
      name="Eventos"
    />
  ),
};

export const Fallido: Story = {
  parameters: screen,
  render: () => (
    <EventList
      description="Se puede volver a disparar"
      events={[
        sampleEvent({
          name: "account.move.posted",
          label: "Factura publicada",
          status: EEventStatus.FAILED,
          attempts: 2,
          errorMessage: "El servidor no respondió a tiempo",
          sequence: 4,
        }),
      ]}
      name="Eventos"
    />
  ),
};

export const Cancelado: Story = {
  parameters: screen,
  render: () => (
    <EventList
      description="Se detuvo antes de salir"
      events={[
        sampleEvent({
          name: "stock.picking.done",
          label: "Entrega cancelada",
          status: EEventStatus.CANCELLED,
          attempts: 0,
          sequence: 5,
        }),
      ]}
      name="Eventos"
    />
  ),
};

export const ConInternet: Story = {
  parameters: screen,
  render: () => (
    <EventList
      description="Este evento espera red"
      events={[
        sampleEvent({
          name: "sale.order.confirmed",
          label: "Pedido confirmado",
          status: EEventStatus.PENDING,
          attempts: 0,
          requiresNetwork: true,
          sequence: 6,
        }),
      ]}
      name="Eventos"
    />
  ),
};

export const SinEventos: Story = {
  parameters: screen,
  render: () => <EventList description="Nada en la cola" events={[]} name="Eventos" />,
};

export const VidaDelPedido: Story = {
  render: () => {
    const life = [
      sampleEvent({
        name: "sale.order.confirmed",
        label: "Pedido confirmado",
        status: EEventStatus.PENDING,
        attempts: 0,
        sequence: 1,
      }),
      sampleEvent({
        name: "sale.order.confirmed",
        label: "Pedido en proceso",
        status: EEventStatus.PROCESSING,
        attempts: 1,
        sequence: 2,
      }),
      sampleEvent({
        name: "sale.order.confirmed",
        label: "Pedido aceptado",
        status: EEventStatus.ACKNOWLEDGED,
        attempts: 1,
        sequence: 3,
      }),
      sampleEvent({
        name: "sale.order.confirmed",
        label: "Pedido fallido",
        status: EEventStatus.FAILED,
        attempts: 3,
        sequence: 4,
      }),
    ];
    return (
      <View>
        {life.map((event, index) => (
          <EventTimelineItem
            event={event}
            isLast={index === life.length - 1}
            key={event.uuid}
            onOpen={() => undefined}
          />
        ))}
      </View>
    );
  },
};

export const ColaMuerta: Story = {
  render: () => (
    <View>
      <DeadLetterQueueRow
        item={sampleEvent({
          name: "sale.order.confirmed",
          label: "Pedido confirmado",
          status: EEventStatus.FAILED,
          attempts: 1,
          errorMessage: "Tiempo de espera agotado",
          sequence: 1,
        })}
        onOpen={() => undefined}
      />
      <DeadLetterQueueRow
        item={sampleEvent({
          name: "account.move.posted",
          label: "Factura publicada",
          status: EEventStatus.FAILED,
          attempts: 4,
          errorMessage: LONG_ERROR,
          requiresNetwork: true,
          sequence: 8,
        })}
        onOpen={() => undefined}
      />
    </View>
  ),
};
