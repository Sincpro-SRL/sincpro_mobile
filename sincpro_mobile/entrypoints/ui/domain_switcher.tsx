import { createNativeStackNavigator } from "@react-navigation/native-stack";
import {
  type ComponentType,
  createContext,
  type ReactNode,
  useContext,
  useState,
} from "react";

const RootStack = createNativeStackNavigator();

export interface DomainApp {
  key: string;
  name: string;
  component: ComponentType;
}

interface DomainSwitcherValue {
  activeDomain: string;
  setActiveDomain: (key: string) => void;
  apps: DomainApp[];
}

const DomainSwitcherContext = createContext<DomainSwitcherValue | null>(null);

export function DomainSwitcherProvider(props: {
  apps: DomainApp[];
  initialDomain: string;
  children: ReactNode;
}) {
  const [activeDomain, setActiveDomain] = useState(props.initialDomain);

  return (
    <DomainSwitcherContext.Provider
      value={{ activeDomain, setActiveDomain, apps: props.apps }}
    >
      {props.children}
    </DomainSwitcherContext.Provider>
  );
}

export function useDomainSwitcher(): DomainSwitcherValue {
  const context = useContext(DomainSwitcherContext);
  if (!context) {
    throw new Error("useDomainSwitcher must be used within AppShell");
  }
  return context;
}

export function ActiveDomainApp() {
  const { activeDomain, apps } = useDomainSwitcher();
  const currentApp = apps.find((entry) => entry.key === activeDomain);
  if (!currentApp) return null;

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen component={currentApp.component} name={currentApp.key} />
    </RootStack.Navigator>
  );
}
