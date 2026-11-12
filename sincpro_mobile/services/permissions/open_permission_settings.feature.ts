import { Command } from "@sincpro/client-framework";
import type { EPermission } from "@sincpro/mobile/domain/permissions";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

export class CommandOpenPermissionSettings extends Command<void> {
  constructor(readonly kind: EPermission) {
    super();
  }
}

/**
 * Opens this app's page in the system's settings, where a blocked permission is granted. The
 * screen reads it again when the app comes back to the foreground (`usePermission`).
 */
@commonBoundedContext.feature(CommandOpenPermissionSettings)
export class OpenPermissionSettings extends Feature<CommandOpenPermissionSettings, void> {
  async execute(command: CommandOpenPermissionSettings): Promise<void> {
    this.span.set({ "permission.kind": command.kind });
    await this.permissions.openSettings();
  }
}
