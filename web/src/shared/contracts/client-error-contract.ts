export interface ClientErrorPayload {
  context?: Record<string, unknown>;
  message: string;
  type: "error" | "metric";
}

export interface ClientErrorAcceptedResponse {
  accepted: true;
}

export interface ClientErrorRejectedResponse {
  error: string;
}
