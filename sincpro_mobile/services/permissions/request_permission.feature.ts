import { Command } from "@sincpro/client-framework";
import type { EPermission, PermissionStatus } from "@sincpro/mobile/domain/permissions";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";
import { permissionAnswer } from "@sincpro/mobile/services/permissions/common";

export class CommandRequestPermission extends Command<PermissionStatus> {
  constructor(readonly kind: EPermission) {
    super();
  }
}

/**
 * Asks the person for a permission. It is the only way to the system's dialog, and a screen
 * runs it when the person acted, after reading what the permission is for (`PermissionCard`):
 * nothing in the background, a cron or the queue asks.
 * 1. Already granted, blocked or unavailable: no dialog — a blocked one is granted only in the
 *    system's settings (`CommandOpenPermissionSettings`).
 * 2. The system's dialog. A denial is the person's answer, not a failure: the run answers it.
 * Final: the answer is recorded for the screens, and the person is told what it means.
 */
@commonBoundedContext.feature(CommandRequestPermission)
export class RequestPermission extends Feature<CommandRequestPermission, PermissionStatus> {
  async execute(command: CommandRequestPermission): Promise<PermissionStatus> {
    const before = await this.permissions.check(command.kind);
    const asked = before === "denied";
    const status = asked ? await this.permissions.request(command.kind) : before;
    this.permissionStates.set(command.kind, status);
    this.span.set({
      "permission.kind": command.kind,
      "permission.status": status,
      "permission.asked": asked,
    });
    this.tell(command.kind, status, asked);
    return status;
  }

  private tell(kind: EPermission, status: PermissionStatus, asked: boolean): void {
    if (status !== "granted") this.logger.warn("Permission not granted", { kind, status });
    const notice = permissionAnswer(kind, status, asked);
    if (notice) this.notifier.notify(notice);
  }
}
