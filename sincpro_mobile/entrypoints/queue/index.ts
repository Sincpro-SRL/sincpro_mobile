import { type BoundedContext, Subscriptions } from "@sincpro/client-framework";
import {
  ActivateDomainEvent,
  DeactivateDomainEvent,
  NewAppSettingsEvent,
  PrintImageRequestedEvent,
  WebViewMessageReceivedEvent,
} from "@sincpro/mobile/domain/events";
import {
  commonBoundedContext,
  type CommonDependencies,
} from "@sincpro/mobile/infrastructure/bounded_context";

import {
  DomainActivatedSubscriber,
  DomainDeactivatedSubscriber,
} from "./domain_activation.subscriber";
import { NewAppSettingsSubscriber } from "./new_app_settings.subscriber";
import { PrintImageSubscriber } from "./print_image.subscriber";
import { WebViewMessageSubscriber } from "./web_view_message.subscriber";

export type CommonEntrypoints = { commonBoundedContext: BoundedContext<CommonDependencies> };

/**
 * The core's subscribers: each hears one event and executes its Command on `common`. An app
 * replaces one with `commonSubscriptions.subscribe(Event, { replaces: Subscriber })(Its own)`.
 */
export const commonSubscriptions = new Subscriptions<CommonEntrypoints>(
  "common-subscriptions",
);
commonSubscriptions.addDependency("commonBoundedContext", commonBoundedContext);
commonSubscriptions.subscribe(ActivateDomainEvent)(DomainActivatedSubscriber);
commonSubscriptions.subscribe(DeactivateDomainEvent)(DomainDeactivatedSubscriber);
commonSubscriptions.subscribe(NewAppSettingsEvent)(NewAppSettingsSubscriber);
commonSubscriptions.subscribe(PrintImageRequestedEvent)(PrintImageSubscriber);
commonSubscriptions.subscribe(WebViewMessageReceivedEvent)(WebViewMessageSubscriber);
