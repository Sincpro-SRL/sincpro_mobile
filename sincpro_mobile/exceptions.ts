/**
 * The errors of the mobile stack. Each declares the backend's failure kind (`failureKind`, read by
 * `failureOf` from @sincpro/client-framework), so retrying, setting aside, reporting and what a
 * screen shows follow from what the error is — never from its class name:
 *
 *     UserError, RejectedFailure  domain       the business refused: never retried, not reported
 *     ValidationError, ChecksFailed  invalid   the input is wrong: fix it, never retried
 *     StaleAggregate               conflict    refresh and retry
 *     NetworkError, RepeatableFailure  unavailable  retried after a wait
 *     PrinterUnavailable           unavailable  the printer is off or out of reach: retried
 *     PrinterNotSelected           domain       no printer chosen: set aside until one is
 *     BluetoothPermissionDenied    permission_denied  the person has not granted Bluetooth
 *     BackendError, AppError       internal    a fault: reported
 *
 * A bare `DomainException` declares nothing: an unexpected failure, reported.
 */
export class DomainException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainException";
  }
}

export class DomainUserError extends DomainException {
  static readonly failureKind = "domain";
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

export class DomainValidationError extends DomainException {
  static readonly failureKind = "invalid";
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class DomainNetworkError extends DomainException {
  static readonly failureKind = "unavailable";
  /** What the delivery reads to mark the phone offline (`NETWORK_DOWN`). */
  static readonly reason = "NETWORK_DOWN";
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

export class DomainBackendError extends DomainException {
  static readonly failureKind = "internal";
  constructor(message: string) {
    super(message);
    this.name = "BackendError";
  }
}

export class DomainAppError extends DomainException {
  static readonly failureKind = "internal";
  constructor(message: string) {
    super(message);
    this.name = "AppError";
  }
}

export class StaleAggregate extends DomainException {
  static readonly failureKind = "conflict";
  constructor(message: string) {
    super(message);
    this.name = "StaleAggregate";
  }
}

export class ChecksFailed extends DomainValidationError {
  constructor(readonly failures: { rule: string; message: string; path: string[] }[]) {
    super(
      failures
        .map((failure) =>
          failure.path.length > 0
            ? `${failure.path.join(".")}: ${failure.message}`
            : failure.message,
        )
        .join("; "),
    );
    this.name = "ChecksFailed";
  }
}

export class RepeatableFailure extends DomainException {
  static readonly failureKind = "unavailable";
  constructor(message: string) {
    super(message);
    this.name = "RepeatableFailure";
  }
}

/** The printer is off, out of reach or lost its link: a retry may print. */
export class PrinterUnavailable extends DomainException {
  static readonly failureKind = "unavailable";
  static readonly reason = "PRINTER_UNAVAILABLE";
  constructor(message: string) {
    super(message);
    this.name = "PrinterUnavailable";
  }
}

/** The Bluetooth permission is not granted: the person grants it, then retries. */
export class BluetoothPermissionDenied extends DomainException {
  static readonly failureKind = "permission_denied";
  static readonly reason = "BLUETOOTH_PERMISSION_DENIED";
  constructor(message: string) {
    super(message);
    this.name = "BluetoothPermissionDenied";
  }
}

/** No printer was chosen: nothing prints until the person picks one and retries. */
export class PrinterNotSelected extends DomainException {
  static readonly failureKind = "domain";
  static readonly reason = "PRINTER_NOT_SELECTED";
  constructor(message: string) {
    super(message);
    this.name = "PrinterNotSelected";
  }
}

export class RejectedFailure extends DomainException {
  static readonly failureKind = "domain";
  constructor(message: string) {
    super(message);
    this.name = "RejectedFailure";
  }
}

export const ValidationError = (message: string): never => {
  // setTimeout(() => {
  //   throw new DomainValidationError(message);
  // }, 0);
  throw new DomainValidationError(message);
};

export const UserError = (message: string): never => {
  // setTimeout(() => {
  //   throw new DomainUserError(message);
  // }, 0);
  throw new DomainUserError(message);
};

export const BackendError = (message: string): never => {
  // setTimeout(() => {
  //   throw new DomainBackendError(message);
  // }, 0);
  throw new DomainBackendError(message);
};

export const AppError = (message: string): never => {
  // setTimeout(() => {
  //   throw new DomainAppError(message);
  // }, 0);
  throw new DomainAppError(message);
};
