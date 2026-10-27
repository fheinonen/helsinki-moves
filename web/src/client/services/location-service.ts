import type { Coordinates } from "@client/app/app-store";

export type LocationFailureCode = "permission-denied" | "unavailable";

export type LocationResult =
  | { ok: true; value: Coordinates }
  | { code: LocationFailureCode; ok: false };

export interface GetCurrentPositionOptions {
  enableHighAccuracy?: boolean;
  maximumAge?: number;
}

function toPositionOptions(options: GetCurrentPositionOptions): PositionOptions {
  const positionOptions: PositionOptions = {
    enableHighAccuracy: options.enableHighAccuracy === true,
  };
  if (typeof options.maximumAge === "number") {
    positionOptions.maximumAge = options.maximumAge;
  }
  return positionOptions;
}

export interface LocationService {
  getCurrentPosition(options?: GetCurrentPositionOptions): Promise<LocationResult>;
}

export function createBrowserLocationService(input: {
  geolocation?: Geolocation;
} = {}): LocationService {
  const geolocation = input.geolocation;

  return {
    async getCurrentPosition(options = {}) {
      if (!geolocation) {
        return { code: "unavailable", ok: false };
      }

      return new Promise<LocationResult>((resolve) => {
        geolocation.getCurrentPosition(
          (position) => {
            resolve({
              ok: true,
              value: {
                lat: position.coords.latitude,
                lon: position.coords.longitude,
              },
            });
          },
          (error) => {
            if (error.code === error.PERMISSION_DENIED) {
              resolve({ code: "permission-denied", ok: false });
              return;
            }
            resolve({ code: "unavailable", ok: false });
          },
          toPositionOptions(options)
        );
      });
    },
  };
}
