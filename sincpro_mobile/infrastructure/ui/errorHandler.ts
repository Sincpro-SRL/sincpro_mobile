import { Alert } from "react-native";

import { DomainException } from "../../exceptions";

export function installGlobalErrorHandler(): void {
  const errorUtils = ErrorUtils as any;
  const defaultHandler = errorUtils.getGlobalHandler
    ? errorUtils.getGlobalHandler()
    : errorUtils._globalHandler;

  errorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    if (error instanceof DomainException) {
      Alert.alert("Error", error.message, [{ text: "OK" }], { cancelable: true });
    } else {
      defaultHandler(error, isFatal);
    }
  });
}
