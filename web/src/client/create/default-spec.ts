import type { Spec } from "@json-render/react";

export const defaultSpec: Spec = {
  root: "board",
  elements: {
    board: {
      children: ["departure-list"],
      props: {
        centered: false,
        maxWidth: "full",
        title: null,
      },
      type: "Card",
    },
    "departure-list": {
      children: ["mode-group-header", "departure-row"],
      props: {
        align: "stretch",
        direction: "vertical",
        gap: "sm",
      },
      repeat: {
        key: "id",
        statePath: "/departures",
      },
      type: "Stack",
    },
    "mode-group-header": {
      props: {
        label: { $item: "modeGroupLabel" },
        summary: { $item: "modeGroupSummary" },
      },
      type: "ModeGroupHeader",
      visible: {
        $item: "groupStart",
        eq: true,
      },
    },
    "departure-row": {
      props: {
        destination: { $item: "destination" },
        groupStart: { $item: "groupStart" },
        line: { $item: "line" },
        minutes: { $item: "minutes" },
        mode: { $item: "mode" },
        modeGroupLabel: { $item: "modeGroupLabel" },
        modeGroupSummary: { $item: "modeGroupSummary" },
        platformLabel: { $item: "platformLabel" },
        stopLabel: { $item: "stopLabel" },
      },
      type: "DepartureRow",
    },
  },
} as Spec;
