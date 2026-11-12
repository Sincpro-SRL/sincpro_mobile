import { Command } from "@sincpro/client-framework";
import type { EPermission, PermissionStatus } from "@sincpro/mobile/domain/permissions";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

export class CommandCheckPermission extends Command<PermissionStatus> {
  constructor(readonly kind: EPermission) {
    super();
  }
}

/** Where a permission stands, never asking: what a screen shows, and the app follows. */
@commonBoundedContext.feature(CommandCheckPermission)
export class CheckPermission extends Feature<CommandCheckPermission, PermissionStatus> {
  async execute(command: CommandCheckPermission): Promise<PermissionStatus> {
    const status = await this.permissions.check(command.kind);
    this.permissionStates.set(command.kind, status);
    this.span.set({ "permission.kind": command.kind, "permission.status": status });
    return status;
  }
}
