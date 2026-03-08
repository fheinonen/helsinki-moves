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
  recorder?: VoiceRecorder;
  result?: Awaited<ReturnType<VoiceRecorder["capture"]>>;
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
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the browser voice recorder has microphone and recorder support$/,
        run: ({ world }) => {
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
        pattern: /^Then all microphone tracks are stopped$/,
        run: ({ assert, world }) => {
          assert.equal(world.tracks?.every((track) => track.stopped), true);
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
