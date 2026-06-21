import UIPlainLayout from "@sincpro/mobile-ui/layouts/PlainLayout";
import UITabNavigatorLayout from "@sincpro/mobile-ui/layouts/TabNavigatorLayout";
import type { ComponentProps, ReactElement } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-native";

type UITabProps = ComponentProps<typeof UITabNavigatorLayout>;

/**
 * Layouts conectados a react-router. El design system (@sincpro/mobile-ui) trae
 * las versiones presentacionales (sin router); aquí el core —que sí posee el
 * router— les inyecta location/navigate/Outlet para usarse como layout routes.
 */
function TabNavigatorLayout(
  props: Omit<UITabProps, "content" | "currentPath" | "onTabPress">,
): ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <UITabNavigatorLayout
      {...props}
      content={<Outlet />}
      currentPath={location.pathname}
      onTabPress={(path: string) => navigate(path)}
    />
  );
}

TabNavigatorLayout.Tabs = UITabNavigatorLayout.Tabs;
TabNavigatorLayout.Tab = UITabNavigatorLayout.Tab;

function PlainLayout(): ReactElement {
  return (
    <UIPlainLayout>
      <Outlet />
    </UIPlainLayout>
  );
}

export { PlainLayout, TabNavigatorLayout };
