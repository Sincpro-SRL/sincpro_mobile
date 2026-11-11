/** What turns a module's domain on or off: the orchestrator. */
export type DomainSwitch = {
  enableDomain(key: string): Promise<void>;
  disableDomain(key: string): Promise<void>;
};
