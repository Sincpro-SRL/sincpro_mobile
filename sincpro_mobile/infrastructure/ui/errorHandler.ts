import { DomainException } from "@sincpro/mobile/exceptions";
import { Alert } from "react-native";

export function installGlobalErrorHandler(): void {
  const errorUtils = (globalThis as any).ErrorUtils;
  if (!errorUtils?.setGlobalHandler) {
    return;
  }

  const defaultHandler = errorUtils.getGlobalHandler
    ? errorUtils.getGlobalHandler()
    : errorUtils._globalHandler;

  errorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    if (error instanceof DomainException) {
      Alert.alert("Error", error.message, [{ text: "OK" }], { cancelable: true });
      return;
    }
    if (typeof defaultHandler === "function") {
      defaultHandler(error, isFatal);
    }
  });
}
