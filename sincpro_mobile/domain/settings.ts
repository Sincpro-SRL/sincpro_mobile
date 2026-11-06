export enum ECommonSetting {
  SELECTED_PRINTER = "common.selected_printer",
  UI_QUEUE = "ui.queue",
  UI_CRON = "ui.cron",
  UI_DEVICE = "ui.device",
}

export interface ISetting {
  key: string;
  value: unknown;
}
