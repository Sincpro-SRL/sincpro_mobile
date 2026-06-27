export interface HasRequiresAuth {
  readonly requiresAuth: boolean;
}

export interface SyncState {
  domains: Set<string>;
  isAuthenticated: boolean;
}

export function statesAreEqual(a: SyncState | null, b: SyncState): boolean {
  if (!a) return false;
  if (a.isAuthenticated !== b.isAuthenticated) return false;
  if (a.domains.size !== b.domains.size) return false;
  for (const domain of a.domains) {
    if (!b.domains.has(domain)) return false;
  }
  return true;
}

export function calculateDesiredSubscribers<T extends HasRequiresAuth>(
  domains: Set<string>,
  isAuthenticated: boolean,
  subscribersByKey: Record<string, T[]>,
): Set<T> {
  const desired = new Set<T>();
  for (const domain of domains) {
    const domainSubscribers = subscribersByKey[domain] ?? [];
    for (const subscriber of domainSubscribers) {
      if (isAuthenticated || !subscriber.requiresAuth) {
        desired.add(subscriber);
      }
    }
  }
  return desired;
}
