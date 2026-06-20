import * as Linking from "expo-linking";
import { Platform } from "react-native";

export const openMapWithRoute = async (destination: {
  latitude: number;
  longitude: number;
}) => {
  const { latitude, longitude } = destination;

  const url =
    Platform.OS === "ios"
      ? `http://maps.apple.com/?daddr=${latitude},${longitude}`
      : `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      console.error("No se puede abrir la URL del mapa:", url);
    }
  } catch (error) {
    console.error("Error al abrir la URL del mapa:", error);
  }
};
