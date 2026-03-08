import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  createBrowserVoiceRecorder,
  type VoiceRecorder,
} from "@client/features/voice/browser-voice-recorder";

interface FakeTrack {
  stopped: boolean;
  stop(): void;
}

interface World {
  autoStopDelayMs?: number;
  captureError?: Error;
  getUserMediaCalls?: MediaStreamConstraints[];
  recorderRequestedMimeType?: string;
  recorderStartTimesliceMs?: number;
  recorder?: VoiceRecorder;
  result?: Awaited<ReturnType<VoiceRecorder["capture"]>>;
  supportedMimeTypes?: Set<string>;
  tracks?: FakeTrack[];
}

function getAudioConstraints(world: World): MediaTrackConstraints {
  const audio = world.getUserMediaCalls?.at(-1)?.audio;
  if (!audio || typeof audio === "boolean") {
    return {};
  }

  return audio;
}

function getConstraintIdeal<T>(constraint: T | { ideal?: T } | undefined): T | undefined {
  if (
    typeof constraint === "object" &&
    constraint !== null &&
    "ideal" in constraint
  ) {
    return constraint.ideal;
  }

  return constraint as T | undefined;
}

defineFeature<World>(
  test,
  `
Feature: Browser voice recorder

  Scenario: Browser voice recorder stops microphone tracks after capture
    Given the browser voice recorder has microphone and recorder support
    When the browser voice recorder captures audio
    Then the captured audio has content
    And all microphone tracks are stopped

  Scenario: Browser voice recorder requests preferred microphone constraints
    Given the browser voice recorder has microphone and recorder support
    When the browser voice recorder captures audio
    Then the requested microphone sample rate preference equals 16000
    And the requested microphone channel count preference equals 1
    And the requested microphone echo cancellation preference equals true
    And the requested microphone noise suppression preference equals true
    And the requested microphone auto gain control preference equals true

  Scenario: Browser voice recorder leaves enough time to begin speaking
    Given the browser voice recorder has microphone and recorder support
    When the browser voice recorder captures audio with its default stop timer
    Then the automatic stop waits at least 4000 milliseconds

  Scenario: Browser voice recorder maps denied microphone permission
    Given the browser voice recorder has denied microphone permission
    When the browser voice recorder capture fails
    Then the recorder error message is Microphone permission denied.

  Scenario: Browser voice recorder maps missing microphone hardware
    Given the browser voice recorder has no microphone available
    When the browser voice recorder capture fails
    Then the recorder error message is No microphone was found for voice location.

  Scenario: Browser voice recorder keeps Safari-compatible recording metadata
    Given the browser voice recorder has Safari-compatible recorder support
    When the browser voice recorder captures audio
    Then the captured audio mime type is audio/mp4
    And the captured audio file name is voice-query.m4a

  Scenario: Browser voice recorder keeps the final audio chunk after stop
    Given the browser voice recorder delivers audio after stop
    When the browser voice recorder captures audio
    Then the captured audio has content
    And the recorder start timeslice equals 250
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the browser voice recorder has microphone and recorder support$/,
        run: ({ world }) => {
          world.getUserMediaCalls = [];
          world.supportedMimeTypes = new Set();
          world.tracks = [
            {
              stopped: false,
              stop() {
                this.stopped = true;
              },
            },
          ];

          class FakeMediaRecorder extends EventTarget {
            static isTypeSupported(mimeType: string) {
              return (
                world.supportedMimeTypes?.has(String(mimeType || "").trim().toLowerCase()) || false
              );
            }

            mimeType = "audio/webm";
            state = "inactive";

            constructor() {
              super();
              world.recorderRequestedMimeType = "audio/webm";
            }

            start() {
              this.state = "recording";
            }

            requestData() {
              const event = new Event("dataavailable") as Event & { data?: Blob };
              event.data = new Blob(["voice"], { type: "audio/webm" });
              this.dispatchEvent(event);
            }

            stop() {
              this.requestData();
              this.state = "inactive";
              this.dispatchEvent(new Event("stop"));
            }
          }

          world.recorder = createBrowserVoiceRecorder({
            MediaRecorderCtor: FakeMediaRecorder as unknown as typeof MediaRecorder,
            captureDurationMs: 0,
            mediaDevices: {
              async getUserMedia(constraints) {
                world.getUserMediaCalls?.push(constraints);
                return {
                  getTracks() {
                    return (world.tracks || []) as unknown as MediaStreamTrack[];
                  },
                } as MediaStream;
              },
            },
          });
        },
      },
      {
        pattern: /^Given the browser voice recorder has Safari-compatible recorder support$/,
        run: ({ world }) => {
          world.getUserMediaCalls = [];
          world.supportedMimeTypes = new Set(["audio/mp4"]);
          world.tracks = [
            {
              stopped: false,
              stop() {
                this.stopped = true;
              },
            },
          ];

          class FakeMediaRecorder extends EventTarget {
            static isTypeSupported(mimeType: string) {
              return (
                world.supportedMimeTypes?.has(String(mimeType || "").trim().toLowerCase()) || false
              );
            }

            mimeType = "audio/mp4";
            state = "inactive";

            constructor(
              _stream: MediaStream,
              options?: MediaRecorderOptions
            ) {
              super();
              world.recorderRequestedMimeType = String(options?.mimeType || "");
            }

            start(timeslice?: number) {
              world.recorderStartTimesliceMs = Number(timeslice) || 0;
              this.state = "recording";
            }

            requestData() {
              const event = new Event("dataavailable") as Event & { data?: Blob };
              event.data = new Blob(["voice"], { type: "audio/mp4" });
              this.dispatchEvent(event);
            }

            stop() {
              this.requestData();
              this.state = "inactive";
              this.dispatchEvent(new Event("stop"));
            }
          }

          world.recorder = createBrowserVoiceRecorder({
            MediaRecorderCtor: FakeMediaRecorder as unknown as typeof MediaRecorder,
            captureDurationMs: 0,
            mediaDevices: {
              async getUserMedia(constraints) {
                world.getUserMediaCalls?.push(constraints);
                return {
                  getTracks() {
                    return (world.tracks || []) as unknown as MediaStreamTrack[];
                  },
                } as MediaStream;
              },
            },
          });
        },
      },
      {
        pattern: /^Given the browser voice recorder delivers audio after stop$/,
        run: ({ world }) => {
          world.getUserMediaCalls = [];
          world.supportedMimeTypes = new Set(["audio/webm"]);
          world.tracks = [
            {
              stopped: false,
              stop() {
                this.stopped = true;
              },
            },
          ];

          class FakeMediaRecorder extends EventTarget {
            static isTypeSupported(mimeType: string) {
              return (
                world.supportedMimeTypes?.has(String(mimeType || "").trim().toLowerCase()) || false
              );
            }

            mimeType = "audio/webm";
            state = "inactive";

            constructor(
              _stream: MediaStream,
              options?: MediaRecorderOptions
            ) {
              super();
              world.recorderRequestedMimeType = String(options?.mimeType || "");
            }

            start(timeslice?: number) {
              world.recorderStartTimesliceMs = Number(timeslice) || 0;
              this.state = "recording";
            }

            requestData() {}

            stop() {
              this.state = "inactive";
              this.dispatchEvent(new Event("stop"));
              queueMicrotask(() => {
                const event = new Event("dataavailable") as Event & { data?: Blob };
                event.data = new Blob(["voice"], { type: "audio/webm" });
                this.dispatchEvent(event);
              });
            }
          }

          world.recorder = createBrowserVoiceRecorder({
            MediaRecorderCtor: FakeMediaRecorder as unknown as typeof MediaRecorder,
            captureDurationMs: 0,
            mediaDevices: {
              async getUserMedia(constraints) {
                world.getUserMediaCalls?.push(constraints);
                return {
                  getTracks() {
                    return (world.tracks || []) as unknown as MediaStreamTrack[];
                  },
                } as MediaStream;
              },
            },
          });
        },
      },
      {
        pattern: /^Given the browser voice recorder has denied microphone permission$/,
        run: ({ world }) => {
          class FakeMediaRecorder extends EventTarget {}

          world.recorder = createBrowserVoiceRecorder({
            MediaRecorderCtor: FakeMediaRecorder as unknown as typeof MediaRecorder,
            mediaDevices: {
              async getUserMedia() {
                const error = new Error("denied");
                error.name = "NotAllowedError";
                throw error;
              },
            },
          });
        },
      },
      {
        pattern: /^Given the browser voice recorder has no microphone available$/,
        run: ({ world }) => {
          class FakeMediaRecorder extends EventTarget {}

          world.recorder = createBrowserVoiceRecorder({
            MediaRecorderCtor: FakeMediaRecorder as unknown as typeof MediaRecorder,
            mediaDevices: {
              async getUserMedia() {
                const error = new Error("missing");
                error.name = "NotFoundError";
                throw error;
              },
            },
          });
        },
      },
      {
        pattern: /^When the browser voice recorder captures audio with its default stop timer$/,
        run: async ({ world }) => {
          world.getUserMediaCalls = [];
          world.tracks = [
            {
              stopped: false,
              stop() {
                this.stopped = true;
              },
            },
          ];

          class FakeMediaRecorder extends EventTarget {
            static isTypeSupported() {
              return true;
            }

            mimeType = "audio/webm";
            state = "inactive";

            start() {
              this.state = "recording";
            }

            requestData() {
              const event = new Event("dataavailable") as Event & { data?: Blob };
              event.data = new Blob(["voice"], { type: "audio/webm" });
              this.dispatchEvent(event);
            }

            stop() {
              this.requestData();
              this.state = "inactive";
              this.dispatchEvent(new Event("stop"));
            }
          }

          const recorder = createBrowserVoiceRecorder({
            MediaRecorderCtor: FakeMediaRecorder as unknown as typeof MediaRecorder,
            mediaDevices: {
              async getUserMedia(constraints) {
                world.getUserMediaCalls?.push(constraints);
                return {
                  getTracks() {
                    return (world.tracks || []) as unknown as MediaStreamTrack[];
                  },
                } as MediaStream;
              },
            },
            setTimeoutImpl(
              callback: () => void,
              delay: number
            ) {
              world.autoStopDelayMs = delay;
              queueMicrotask(() => callback());
              return 1 as unknown as ReturnType<typeof setTimeout>;
            },
          });

          world.result = await recorder.capture();
        },
      },
      {
        pattern: /^When the browser voice recorder captures audio$/,
        run: async ({ world }) => {
          if (!world.recorder) {
            throw new Error("Expected browser voice recorder");
          }
          world.result = await world.recorder.capture();
        },
      },
      {
        pattern: /^When the browser voice recorder capture fails$/,
        run: async ({ world }) => {
          if (!world.recorder) {
            throw new Error("Expected browser voice recorder");
          }
          try {
            await world.recorder.capture();
          } catch (error) {
            world.captureError = error as Error;
          }
        },
      },
      {
        pattern: /^Then the automatic stop waits at least (\d+) milliseconds$/,
        run: ({ assert, args, world }) => {
          assert.equal(
            (world.autoStopDelayMs || 0) >= Number(args[0]),
            true
          );
        },
      },
      {
        pattern: /^Then the captured audio has content$/,
        run: ({ assert, world }) => {
          assert.equal(Boolean(world.result?.content), true);
        },
      },
      {
        pattern: /^Then the captured audio mime type is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.result?.mimeType, args[0]);
        },
      },
      {
        pattern: /^Then the captured audio file name is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.result?.fileName, args[0]);
        },
      },
      {
        pattern: /^Then all microphone tracks are stopped$/,
        run: ({ assert, world }) => {
          assert.equal(world.tracks?.every((track) => track.stopped), true);
        },
      },
      {
        pattern: /^Then the recorder start timeslice equals (\d+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.recorderStartTimesliceMs, Number(args[0]));
        },
      },
      {
        pattern: /^Then the recorder error message is (.+)$/,
        run: ({ assert, args, world }) => {
          assert.equal(world.captureError?.message, args[0]);
        },
      },
      {
        pattern: /^Then the requested microphone sample rate preference equals (\d+)$/,
        run: ({ assert, args, world }) => {
          assert.equal(
            getConstraintIdeal(getAudioConstraints(world).sampleRate),
            Number(args[0])
          );
        },
      },
      {
        pattern: /^Then the requested microphone channel count preference equals (\d+)$/,
        run: ({ assert, args, world }) => {
          assert.equal(
            getConstraintIdeal(getAudioConstraints(world).channelCount),
            Number(args[0])
          );
        },
      },
      {
        pattern: /^Then the requested microphone echo cancellation preference equals (true|false)$/,
        run: ({ assert, args, world }) => {
          assert.equal(
            getConstraintIdeal(getAudioConstraints(world).echoCancellation),
            args[0] === "true"
          );
        },
      },
      {
        pattern: /^Then the requested microphone noise suppression preference equals (true|false)$/,
        run: ({ assert, args, world }) => {
          assert.equal(
            getConstraintIdeal(getAudioConstraints(world).noiseSuppression),
            args[0] === "true"
          );
        },
      },
      {
        pattern: /^Then the requested microphone auto gain control preference equals (true|false)$/,
        run: ({ assert, args, world }) => {
          assert.equal(
            getConstraintIdeal(getAudioConstraints(world).autoGainControl),
            args[0] === "true"
          );
        },
      },
    ],
  }
);
