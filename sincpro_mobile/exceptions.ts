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
