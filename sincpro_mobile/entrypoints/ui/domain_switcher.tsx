import { logger } from "@sincpro/client-framework";
import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

/** A domain the app can show. Which route or screen it maps to is the host's decision. */
export interface DomainEntry {
  key: string;
  name: string;
}

export interface DomainSwitcherValue {
  activeDomain: string;
  domains: DomainEntry[];
  /** Makes `key` the active domain and tells the host, which owns the navigation. */
  switchTo: (key: string) => void;
}

const DomainSwitcherContext = createContext<DomainSwitcherValue | null>(null);

interface DomainSwitcherProviderProps {
  domains: DomainEntry[];
  initialDomain: string;
  /** Host callback: map the domain to a route (`router.replace`, a navigator state…). */
  onChange?: (key: string) => void;
  children: ReactNode;
}

export function DomainSwitcherProvider({
  domains,
  initialDomain,
  onChange,
  children,
}: DomainSwitcherProviderProps) {
  const [activeDomain, setActiveDomain] = useState(initialDomain);
  const value = useMemo<DomainSwitcherValue>(
    () => ({
      activeDomain,
      domains,
      switchTo: (key) => {
        if (!domains.some((domain) => domain.key === key)) {
          logger.warn(`[DomainSwitcher] unknown domain "${key}"`);
          return;
        }
        setActiveDomain(key);
        onChange?.(key);
      },
    }),
    [activeDomain, domains, onChange],
  );

  return (
    <DomainSwitcherContext.Provider value={value}>{children}</DomainSwitcherContext.Provider>
  );
}

export function useDomainSwitcher(): DomainSwitcherValue {
  const context = useContext(DomainSwitcherContext);
  if (!context) {
    throw new Error("useDomainSwitcher must be used within AppShell");
  }
  return context;
}
