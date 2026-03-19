import type { Coordinates } from "@client/app/app-store";

export type LocationFailureCode = "permission-denied" | "unavailable";
export type LocationPermissionState = "denied" | "granted" | "prompt" | "unavailable";

export type LocationResult =
  | { ok: true; value: Coordinates }
  | { code: LocationFailureCode; ok: false };

export interface GetCurrentPositionOptions {
  enableHighAccuracy?: boolean;
}

export interface LocationService {
  getCurrentPosition(options?: GetCurrentPositionOptions): Promise<LocationResult>;
  getPermissionState?(): Promise<LocationPermissionState>;
}

export function createBrowserLocationService(input: {
  geolocation?: Geolocation;
  permissions?: Permissions;
} = {}): LocationService {
  const geolocation = input.geolocation;
  const permissions = input.permissions;

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
          {
            enableHighAccuracy: options.enableHighAccuracy === true,
          }
        );
      });
    },
    async getPermissionState() {
      if (!permissions?.query) {
        return "unavailable";
      }

      try {
        const status = await permissions.query({
          name: "geolocation",
        } as PermissionDescriptor);
        if (status.state === "granted" || status.state === "prompt" || status.state === "denied") {
          return status.state;
        }
      } catch {
        return "unavailable";
      }

      return "unavailable";
    },
  };
}
