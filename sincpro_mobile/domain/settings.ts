import { DomainEvent } from "./event";

export const enum ECommonSetting {
  SELECTED_PRINTER = "common.selected_printer",
}

export interface ISetting {
  key: string;
  value: unknown;
}

export class NewAppSettingsEvent extends DomainEvent {
  static readonly name = "common.settings.v2.added_new_settings";
  static readonly label = "Nuevas configuraciones";
  static readonly requiresNetwork = false;

  public readonly name = NewAppSettingsEvent.name;
  public readonly label = NewAppSettingsEvent.label;
  public readonly requiresNetwork = NewAppSettingsEvent.requiresNetwork;

  public settings: ISetting[] = [];
}
