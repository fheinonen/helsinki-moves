export const APP_ERROR_CODES = [
  "invalid coordinates",
  "invalid payload",
  "invalid query",
  "invalid type",
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export interface AppErrorDetail {
  code: AppErrorCode;
  message: string;
}

export function isAppErrorCode(value: unknown): value is AppErrorCode {
  return typeof value === "string" && APP_ERROR_CODES.includes(value as AppErrorCode);
}
