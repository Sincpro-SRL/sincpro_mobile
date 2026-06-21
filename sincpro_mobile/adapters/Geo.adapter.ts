import { Coordinates } from "@sincpro/mobile/domain/connectivity";
import * as Location from "expo-location";

export const GeoAdapter = {
  async requestPermission(): Promise<boolean> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === Location.PermissionStatus.GRANTED;
  },

  async hasPermission(): Promise<boolean> {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === Location.PermissionStatus.GRANTED;
  },

  async getCurrentLocation(): Promise<Coordinates> {
    const { coords } = await Location.getCurrentPositionAsync({});
    return {
      latitude: coords.latitude,
      longitude: coords.longitude,
    };
  },

  async watchLocation(
    onUpdate: (coords: Coordinates) => void,
  ): Promise<Location.LocationSubscription> {
    return await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
        distanceInterval: 10,
      },
      (location) => {
        onUpdate({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      },
    );
  },
};
