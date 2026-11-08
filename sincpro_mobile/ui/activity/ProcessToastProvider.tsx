import type { ReactNode } from "react";
import { View } from "react-native";

import ProcessToast from "./ProcessToast";

export function ProcessToastProvider({ children }: { children: ReactNode }) {
  return (
    <View className="flex-1" collapsable={false}>
      {children}
      <ProcessToast />
    </View>
  );
}
