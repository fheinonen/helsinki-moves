export interface SpeechTranscribeRequest {
  content: string;
  fileName?: string;
  mimeType?: string;
}

export interface SpeechTranscribeSuccessResponse {
  transcript: string;
}

export interface SpeechTranscribeErrorResponse {
  error: string;
}
