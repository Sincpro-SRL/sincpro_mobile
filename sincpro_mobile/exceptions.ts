export class DomainException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainException";
  }
}

export class DomainUserError extends DomainException {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

export class DomainValidationError extends DomainException {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class DomainNetworkError extends DomainException {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

export class DomainBackendError extends DomainException {
  constructor(message: string) {
    super(message);
    this.name = "BackendError";
  }
}

export class DomainAppError extends DomainException {
  constructor(message: string) {
    super(message);
    this.name = "AppError";
  }
}

export class StaleAggregate extends DomainException {
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
  constructor(message: string) {
    super(message);
    this.name = "RepeatableFailure";
  }
}

export class RejectedFailure extends DomainException {
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
