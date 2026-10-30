import { test, type Page } from "@playwright/test";
import { definePlaywrightFeature } from "@tests/helpers/playwright-bdd-runner";
import { installFixedNow } from "@tests/helpers/install-fixed-now";

const FIXED_NOW_MS = Date.parse("2026-03-07T10:00:00.000Z");

interface StrokeSocket {
  send(data: string): void;
}

interface World {
  page?: Page;
  socket?: StrokeSocket;
}

function boardPayload() {
  const rows = [
    ["Kamppi", "550", "trip-kamppi", "2026-03-07T10:02:00.000Z"],
    ["Pasila", "510", "trip-pasila", "2026-03-07T10:12:00.000Z"],
    ["Eira", "18", "trip-eira", "2026-03-07T10:18:00.000Z"],
    ["Kallio", "65", "trip-kallio", "2026-03-07T10:24:00.000Z"],
  ] as const;
  return {
    filterOptions: {
      destinations: rows.map(([value]) => ({ count: 1, value })),
      lines: rows.map(([, value]) => ({ count: 1, value })),
    },
    mode: "BUS",
    selectedStopId: "HSL:STOP_A",
    station: {
      departures: rows.map(([destination, line, tripId, departureIso]) => ({
        departureIso,
        destination,
        line,
        stopId: "HSL:STOP_A",
        tripId,
      })),
      distanceMeters: 80,
      stopCode: "A1",
      stopCodes: ["A1"],
      stopName: "Kamppi",
      type: "stop",
    },
    stops: [
      {
        code: "A1",
        distanceMeters: 80,
        id: "HSL:STOP_A",
        memberStopIds: ["HSL:STOP_A"],
        name: "Kamppi",
        stopCodes: ["A1"],
      },
    ],
  };
}

async function openBoard(page: Page, world: World): Promise<void> {
  await installFixedNow(page, FIXED_NOW_MS);
  let socket: StrokeSocket | null = null;
  const opened = new Promise<void>((resolve) => {
    void page.routeWebSocket(/departures-live/, (route) => {
      socket = route;
      resolve();
    });
  });
  await page.route("**/api/v1/departures**", async (route) => {
    await route.fulfill({
      body: JSON.stringify(boardPayload()),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.setViewportSize({ height: 900, width: 480 });
  await page.goto("/");
  await page.waitForSelector(".departure-card");
  await opened;
  if (!socket) {
    throw new Error("Expected a live departure socket");
  }
  world.page = page;
  world.socket = socket;
}

async function longestStrokeGap(page: Page): Promise<number> {
  const shot = await page.locator(".app-shell").screenshot();
  const url = `data:image/png;base64,${shot.toString("base64")}`;
  return page.evaluate(async (imageUrl) => {
    const image = new Image();
    image.src = imageUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      return 999;
    }
    context.drawImage(image, 0, 0);
    const { data, width } = context.getImageData(0, 0, canvas.width, canvas.height);
    const scale = image.naturalWidth / document.documentElement.clientWidth;
    const cells = [...document.querySelectorAll(".departure-card__line")]
      .map((cell) => {
        const rect = cell.getBoundingClientRect();
        const shell = document.querySelector(".app-shell")?.getBoundingClientRect();
        return {
          bottom: rect.bottom - (shell?.top ?? 0),
          height: rect.height,
          left: rect.left - (shell?.left ?? 0),
          top: rect.top - (shell?.top ?? 0),
        };
      })
      .filter((cell) => cell.height > 1);
    if (cells.length === 0) {
      return 999;
    }
    const sampleX = Math.round((cells[0].left + 2) * scale);
    const start = Math.round(Math.min(...cells.map((cell) => cell.top)) * scale);
    const end = Math.round(Math.max(...cells.map((cell) => cell.bottom)) * scale);
    const chroma = (y: number) => {
      const index = (y * width + sampleX) * 4;
      const red = data[index] ?? 0;
      const green = data[index + 1] ?? 0;
      const blue = data[index + 2] ?? 0;
      return Math.max(red, green, blue) - Math.min(red, green, blue);
    };
    let longest = 0;
    let gap = 0;
    let seen = false;
    for (let y = start; y < end; y += 1) {
      if (chroma(y) > 70) {
        if (seen) {
          longest = Math.max(longest, gap);
        }
        seen = true;
        gap = 0;
      } else if (seen) {
        gap += 1;
      }
    }
    return longest;
  }, url);
}

definePlaywrightFeature<World>(
  test,
  `
Feature: Destination strokes stay continuous

  Scenario: A changing departure time keeps the destination strokes continuous
    Given several departures are on the board
    When one departure time is changing
    Then the destination strokes have no break

  Scenario: A departing line keeps the destination strokes continuous
    Given several departures are on the board
    When one departure is leaving the board
    Then the destination strokes have no break
  `,
  {
    createWorld: async () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given several departures are on the board$/,
        run: async ({ fixtures, world }) => {
          await openBoard(fixtures.page as Page, world);
        },
      },
      {
        pattern: /^When one departure time is changing$/,
        run: async ({ world }) => {
          world.socket?.send(
            JSON.stringify({
              departureIso: "2026-03-07T10:09:00.000Z",
              stopId: "HSL:STOP_A",
              tripId: "trip-pasila",
              type: "departure-time",
            }),
          );
          const page = world.page;
          if (!page) {
            throw new Error("Expected the board");
          }
          await page.waitForSelector(".departure-card__time-previous");
          await page.evaluate(() => {
            for (const animation of document.getAnimations()) {
              animation.pause();
              const duration = animation.effect?.getComputedTiming().duration;
              if (typeof duration === "number") {
                animation.currentTime = duration * 0.35;
              }
            }
          });
        },
      },
      {
        pattern: /^When one departure is leaving the board$/,
        run: async ({ world }) => {
          const page = world.page;
          if (!page) {
            throw new Error("Expected the board");
          }
          await page.evaluate((now) => {
            const observer = new MutationObserver(() => {
              if (!document.querySelector(".departure-leave-ghost")) {
                return;
              }
              observer.disconnect();
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  for (const animation of document.getAnimations()) {
                    animation.pause();
                    const duration = animation.effect?.getComputedTiming().duration;
                    if (typeof duration === "number") {
                      animation.currentTime = duration * 0.35;
                    }
                  }
                  document.documentElement.dataset.strokeHeld = "1";
                });
              });
            });
            observer.observe(document.body, { childList: true, subtree: true });
            Date.now = () => now;
          }, FIXED_NOW_MS + 3 * 60_000);
          await page.waitForFunction(() => document.documentElement.dataset.strokeHeld === "1");
        },
      },
      {
        pattern: /^Then the destination strokes have no break$/,
        run: async ({ assert, world }) => {
          const page = world.page;
          if (!page) {
            throw new Error("Expected the board");
          }
          const gap = await longestStrokeGap(page);
          assert.equal(gap, 0);
        },
      },
    ],
  },
);
