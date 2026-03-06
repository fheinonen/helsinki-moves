import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";

(() => {
  const app = window.HMApp || (window.HMApp = {});
  const azureSpeech = app.azureSpeech || (app.azureSpeech = {});

  function closeRecognizer(recognizer) {
    try {
      recognizer?.close?.();
    } catch {
      // Ignore recognizer cleanup failures after a terminal result.
    }
  }

  function createRecognizer({ token, region, language }) {
    const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region);
    speechConfig.speechRecognitionLanguage = String(language || "fi-FI").trim() || "fi-FI";
    const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
    return new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
  }

  function recognizeOnce({ token, region, language }) {
    return new Promise((resolve, reject) => {
      const recognizer = createRecognizer({ token, region, language });

      recognizer.recognizeOnceAsync(
        (result) => {
          try {
            if (result?.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
              resolve({
                reason: "recognized",
                transcript: String(result.text || "").trim(),
              });
              return;
            }

            if (result?.reason === SpeechSDK.ResultReason.NoMatch) {
              resolve({ reason: "no-match" });
              return;
            }

            const details = SpeechSDK.CancellationDetails.fromResult(result);
            resolve({
              reason: "canceled",
              errorDetails: String(details?.errorDetails || "").trim(),
              cancellationReason: String(details?.reason || "").trim(),
            });
          } finally {
            closeRecognizer(recognizer);
          }
        },
        (error) => {
          closeRecognizer(recognizer);
          reject(error);
        }
      );
    });
  }

  Object.assign(azureSpeech, {
    recognizeOnce,
  });
})();
