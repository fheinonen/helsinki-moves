export interface VoiceCapability {
  available: boolean;
}

export type VoiceAvailability = "available" | "checking" | "unavailable";
export type VoicePhase = "idle" | "listening" | "processing";

interface DetectVoiceCapabilityOptions {
  mediaDevices?: {
    getUserMedia?: ((constraints?: MediaStreamConstraints) => Promise<MediaStream>) | undefined;
  } | null;
  MediaRecorderCtor?: unknown;
}

export function detectVoiceCapability(
  options: DetectVoiceCapabilityOptions
): VoiceCapability {
  const hasRecorder = typeof options.MediaRecorderCtor === "function";
  const hasGetUserMedia = typeof options.mediaDevices?.getUserMedia === "function";

  return {
    available: hasRecorder && hasGetUserMedia,
  };
}

export function getVoiceActionLabel(input: {
  availability: VoiceAvailability;
  phase: VoicePhase;
}): string {
  if (input.phase === "listening") {
    return "Listening...";
  }
  if (input.phase === "processing") {
    return "Transcribing...";
  }
  if (input.availability === "unavailable") {
    return "Voice Unavailable";
  }
  if (input.availability === "available") {
    return "Voice Search";
  }
  return "Checking Voice...";
}
