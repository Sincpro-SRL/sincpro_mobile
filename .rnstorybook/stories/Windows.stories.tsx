import { fromRows, resource } from "@sincpro/criteria";
import type { EventRecord } from "@sincpro/mobile/domain/events";
import { EPermission } from "@sincpro/mobile/domain/permissions";
import { ActivityStrip } from "@sincpro/mobile/ui/activity/ActivityStrip";
import EventTimelineItem from "@sincpro/mobile/ui/components/molecules/EventTimelineItem";
import { PermissionCard } from "@sincpro/mobile/ui/components/molecules/PermissionCard";
import { TimeZoneSelector } from "@sincpro/mobile/ui/components/molecules/TimeZoneSelector";
import { CrashRecovery } from "@sincpro/mobile/ui/components/organisms/CrashRecovery";
import DatabaseInfoRow from "@sincpro/mobile/ui/components/organisms/DatabaseInfoRow";
import DeadLetterQueueRow from "@sincpro/mobile/ui/components/organisms/DeadLetterQueueRow";
import EventRow from "@sincpro/mobile/ui/components/organisms/EventRow";
import { EventListHeader } from "@sincpro/mobile/ui/events/event-query-controls";
import { useEventQuery } from "@sincpro/mobile/ui/events/use-event-query";
import { ListViewV2 } from "@sincpro/mobile-ui/views/ListViewV2";
import type { Meta, StoryObj } from "@storybook/react-native";
import { useMemo } from "react";
import { View } from "react-native";

function sampleEvent(fields: Partial<EventRecord>): EventRecord {
  return {
    id: `${fields.name ?? "event"}-${fields.publishedAt ?? ""}`,
    kind: "event",
    name: "",
    label: "",
    state: "pending",
    attempts: 0,
    publishedAt: new Date().toISOString(),
    settledAt: null,
    correlationId: "flow",
    causationId: null,
    failures: [],
    error: null,
    payload: {},
    answer: null,
    ...fields,
  };
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

const EVENTS = [
  sampleEvent({
    name: "sale.order.confirmed",
    label: "Pedido confirmado",
    state: "delivered",
    attempts: 1,
    publishedAt: daysAgo(0),
  }),
  sampleEvent({
    name: "stock.picking.done",
    label: "Entrega validada",
    state: "pending",
    attempts: 0,
    publishedAt: daysAgo(3),
  }),
  sampleEvent({
    name: "account.move.posted",
    label: "Factura publicada",
    state: "set_aside",
    attempts: 4,
    error: "El servidor no respondió a tiempo",
    publishedAt: daysAgo(20),
  }),
  sampleEvent({
    name: "account.payment.posted",
    label: "Pago registrado",
    state: "set_aside",
    attempts: 0,
    publishedAt: daysAgo(40),
  }),
];

function EventBrowser({
  name,
  description,
  events,
  failedOnly = false,
  activity,
}: {
  name: string;
  description: string;
  events: EventRecord[];
  failedOnly?: boolean;
  activity?: { label: string; detail?: string; tone: "running" | "failed" };
}) {
  const inMemory = useMemo(() => resource(fromRows(events, { identity: "id" })), [events]);
  const list = useEventQuery({}, inMemory);
  return (
    <ListViewV2.Root
      description={description}
      hasMore={list.hasMore}
      items={list.visible}
      name={name}
      onBack={() => undefined}
      onLoadMore={list.loadMore}
    >
      <EventListHeader
        extraActions={
          activity ? (
            <ActivityStrip
              detail={activity.detail}
              inline
              label={activity.label}
              tone={activity.tone}
            />
          ) : undefined
        }
        list={list}
        showStatus={!failedOnly}
      />
      <ListViewV2.Content>
        {(event) =>
          failedOnly ? (
            <DeadLetterQueueRow item={event as EventRecord} onOpen={() => undefined} />
          ) : (
            <EventRow item={event as EventRecord} onOpen={() => undefined} />
          )
        }
      </ListViewV2.Content>
    </ListViewV2.Root>
  );
}

const TABLES = [
  { name: "Eventos", description: "Cola de integración" },
  { name: "Sesión", description: "Credenciales locales" },
];

const meta = {
  title: "Framework/Ventanas",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const screen = {
  layout: "fullscreen",
  ownsScroll: true,
  ownsTopInset: true,
} as const;

export const Ubicacion: Story = {
  render: () => (
    <View>
      <PermissionCard kind={EPermission.LOCATION} />
      <PermissionCard kind={EPermission.BLUETOOTH} />
    </View>
  ),
};

export const AlgoSalioMal: Story = {
  parameters: screen,
  render: () => (
    <CrashRecovery
      canSendReport
      error={new TypeError("Cannot read property 'child' of undefined")}
      onRetry={() => undefined}
      showDetails
    />
  ),
};

export const ZonaHoraria: Story = {
  render: () => <TimeZoneSelector timezone="America/La_Paz" />,
};

export const Eventos: Story = {
  parameters: screen,
  render: () => (
    <EventBrowser
      activity={{ label: "Enviando pedido", tone: "running" }}
      description="Eventos registrados"
      events={EVENTS}
      name="Eventos"
    />
  ),
};

export const EventosFallidos: Story = {
  parameters: screen,
  render: () => (
    <EventBrowser
      activity={{
        detail: "El servidor no respondió a tiempo",
        label: "Publicando factura",
        tone: "failed",
      }}
      description="Eventos que no pudieron ser procesados"
      events={EVENTS.filter((event) => event.state === "set_aside")}
      failedOnly
      name="Eventos fallidos"
    />
  ),
};

export const Tablas: Story = {
  parameters: screen,
  render: () => (
    <ListViewV2.Root items={TABLES} name="Lista de tablas" onBack={() => undefined}>
      <ListViewV2.Header variant="default" />
      <ListViewV2.Content>
        {(table) => (
          <DatabaseInfoRow
            item={table as (typeof TABLES)[number]}
            onPress={() => undefined}
          />
        )}
      </ListViewV2.Content>
    </ListViewV2.Root>
  ),
};

export const LineaDeTiempo: Story = {
  render: () => (
    <View>
      {EVENTS.map((event, index) => (
        <EventTimelineItem
          event={event}
          isLast={index === EVENTS.length - 1}
          key={event.id}
          onOpen={() => undefined}
        />
      ))}
    </View>
  ),
};
