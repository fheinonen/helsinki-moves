import type { BaseComponentProps } from "@json-render/react";
import { defineRegistry, useStateValue } from "@json-render/react";
import { shadcnComponents } from "@json-render/shadcn";
import {
  createRouteCatalog,
  type DepartureRowProps,
  type ModeGroupHeaderProps,
  type RouteBlockProps,
  type StopHeaderProps,
  type SupportBlockProps,
} from "./create-route-catalog";
import type { CreateBoardMode } from "./departure-board-state";
import { describeNoRouteSupport } from "./no-route-support";
import { describeRouteAlertRenderSupport } from "./route-alert-render-support";
import type { RouteCanvasViewModel } from "./canvas-view-model";

const MODE_CLASS_NAMES: Record<CreateBoardMode, string> = {
  BUS: "bg-sky-500/18 text-sky-200 ring-sky-400/35",
  FERRY: "bg-cyan-500/18 text-cyan-100 ring-cyan-300/35",
  RAIL: "bg-violet-500/18 text-violet-100 ring-violet-400/35",
  SUBWAY: "bg-orange-500/18 text-orange-100 ring-orange-300/35",
  TRAM: "bg-emerald-500/18 text-emerald-100 ring-emerald-300/35",
};

function getMinutesLabel(minutes: number): string {
  return minutes === 0 ? "Now" : `${minutes} min`;
}

function getMinutesClassName(minutes: number): string {
  if (minutes === 0) {
    return "text-rose-300";
  }
  if (minutes <= 5) {
    return "text-amber-200";
  }
  return "text-emerald-200";
}

function StopHeader({ props }: BaseComponentProps<StopHeaderProps>) {
  return (
    <header className="create-stop-header" data-testid="stop-header">
      <div>
        <p className="create-stop-kicker">Stop</p>
        <h1 className="create-stop-title">{props.name}</h1>
      </div>
      {props.code ? <p className="create-stop-code">Stop {props.code}</p> : null}
    </header>
  );
}

function ModeGroupHeader({ props }: BaseComponentProps<ModeGroupHeaderProps>) {
  return (
    <header className="create-mode-group-header" data-testid="mode-group-header">
      <p className="create-mode-group-title">{props.label}</p>
      {props.summary ? <p className="create-mode-group-summary">{props.summary}</p> : null}
    </header>
  );
}

function DepartureRow({ props }: BaseComponentProps<DepartureRowProps>) {
  return (
    <article className="create-departure-row" data-testid="departure-row">
      <div className={`create-line-badge ring-1 ${MODE_CLASS_NAMES[props.mode]}`}>{props.line}</div>
      <div className="create-destination">
        <p className="create-destination-name">{props.destination}</p>
        <p className="create-destination-mode">
          {props.mode}
          {props.stopLabel ? ` · ${props.stopLabel}` : ""}
          {props.platformLabel ? ` · ${props.platformLabel}` : ""}
        </p>
      </div>
      <p className={`create-minutes ${getMinutesClassName(props.minutes)}`}>
        {getMinutesLabel(props.minutes)}
      </p>
    </article>
  );
}

function RouteBlock({ props }: BaseComponentProps<RouteBlockProps>) {
  const routeCanvas = useStateValue<RouteCanvasViewModel>("/routeCanvas");
  if (!routeCanvas || routeCanvas.state !== "ready") {
    return null;
  }

  const route = props.block === "primary_route" ? routeCanvas.primary : routeCanvas.backup;
  if (!route) {
    return null;
  }

  return (
    <article className={`create-route-block create-route-block-${props.slot}`} data-testid={`create-route-block-${props.slot}`}>
      <div className="create-route-block-header">
        <p className="create-route-block-kicker">{props.block === "primary_route" ? "Best route" : "Backup route"}</p>
        <p className={`create-minutes ${getMinutesClassName(route.minutes)}`}>{getMinutesLabel(route.minutes)}</p>
      </div>
      <div className="create-route-block-main">
        <div className="create-line-badge ring-1 bg-sky-500/18 text-sky-200 ring-sky-400/35">{route.line}</div>
        <div className="create-destination">
          <p className="create-destination-name">{route.destination}</p>
          <p className="create-destination-mode">
            {route.stopName}
            {route.stopCode ? ` · Stop ${route.stopCode}` : ""}
            {route.walkingMeters > 0 ? ` · ${route.walkingMeters} m walk` : ""}
          </p>
          {route.itinerarySummary || route.transfers != null ? (
            <p className="create-destination-mode" data-testid={`create-route-itinerary-${props.slot}`}>
              {route.itinerarySummary || "Direct"}
              {route.transfers != null
                ? ` · ${route.transfers} transfer${route.transfers === 1 ? "" : "s"}`
                : ""}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function SupportBlock({ props }: BaseComponentProps<SupportBlockProps>) {
  const routeCanvas = useStateValue<RouteCanvasViewModel>("/routeCanvas");
  const routePolicy = useStateValue<string>("/routePolicy");
  const onRoutePolicyChange = useStateValue<((policy: "fastest" | "fewest_transfers" | "least_walking") => void) | null>(
    "/onRoutePolicyChange"
  );
  if (!routeCanvas) {
    return null;
  }
  const routeAlertSupport = describeRouteAlertRenderSupport(routeCanvas);

  if (props.block === "route_explanation") {
    if (routeCanvas.state === "no_route") {
      const noRouteSupport = describeNoRouteSupport(routeCanvas);
      return (
        <p className="create-route-support" data-testid="create-route-explanation">
          {noRouteSupport.explanation}
        </p>
      );
    }
    if (routeCanvas.state !== "ready") {
      return null;
    }
    return (
      <p className="create-route-support" data-testid="create-route-explanation">
        {routeCanvas.primary.minutes === 0
          ? `Leave now for ${routeCanvas.title}.`
          : `Best route to ${routeCanvas.title} leaves in ${routeCanvas.primary.minutes} min from ${routeCanvas.primary.stopName}.`}
        {routeAlertSupport.explanationSuffix ? ` ${routeAlertSupport.explanationSuffix}` : ""}
      </p>
    );
  }

  if (props.block === "confidence_notice") {
    if (!routeCanvas.degraded) {
      return null;
    }
    return (
      <p className="create-route-support" data-testid="create-confidence-notice">
        Live confidence is limited for this route.
      </p>
    );
  }

  if (props.block === "disruption_notice") {
    if (!routeAlertSupport.showDisruptionNotice) {
      return null;
    }
    return (
      <p className="create-route-support" data-testid="create-disruption-notice">
        Service disruption affects this route.
      </p>
    );
  }

  if (props.block === "service_note") {
    if (!routeAlertSupport.serviceNote) {
      return null;
    }
    return (
      <p className="create-route-support" data-testid="create-service-note">
        {routeAlertSupport.serviceNote}
      </p>
    );
  }

  if (props.block === "policy_recovery") {
    if (routeCanvas.state !== "no_route" || routeCanvas.reason !== "policy_restricted") {
      return null;
    }
    const noRouteSupport = describeNoRouteSupport(routeCanvas);
    return (
      <p className="create-route-support" data-testid="create-policy-recovery">
        {noRouteSupport.policyRecovery}
      </p>
    );
  }

  if (props.block === "disruption_recovery") {
    if (routeCanvas.state !== "no_route" || routeCanvas.reason !== "service_disruption") {
      return null;
    }
    const noRouteSupport = describeNoRouteSupport(routeCanvas);
    return (
      <p className="create-route-support" data-testid="create-disruption-recovery">
        {noRouteSupport.disruptionRecovery}
      </p>
    );
  }

  if (props.block === "itinerary_details") {
    if (
      routeCanvas.state !== "ready" ||
      !routeCanvas.primary.itineraryLegs ||
      routeCanvas.primary.itineraryLegs.length === 0
    ) {
      return null;
    }
    return (
      <div className="create-route-support" data-testid="create-itinerary-details">
        {routeCanvas.primary.itineraryLegs.map((leg, index) => (
          <p key={`${leg.line}-${leg.from}-${leg.to}-${index}`} className="create-destination-mode">
            {leg.from}
            {leg.departurePlatform ? ` (Platform ${leg.departurePlatform})` : ""}
            {" to "}
            {leg.to}
            {leg.arrivalPlatform ? ` (Platform ${leg.arrivalPlatform})` : ""}
            {" on "}
            {leg.line}
            {leg.timeRangeLabel ? ` · ${leg.timeRangeLabel}` : ""}
          </p>
        ))}
        {routeCanvas.primary.interchangeStopName ? (
          <p className="create-destination-mode">Transfer at {routeCanvas.primary.interchangeStopName}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="create-route-policy-switch" data-testid="create-policy-switch">
      <button
        aria-pressed={routePolicy === "fastest" ? "true" : "false"}
        className="create-action-button create-action-button-secondary"
        data-testid="create-policy-fastest"
        onClick={() => onRoutePolicyChange?.("fastest")}
        type="button"
      >
        Fastest
      </button>
      <button
        aria-pressed={routePolicy === "least_walking" ? "true" : "false"}
        className="create-action-button create-action-button-secondary"
        data-testid="create-policy-least-walking"
        onClick={() => onRoutePolicyChange?.("least_walking")}
        type="button"
      >
        Least walking
      </button>
      <button
        aria-pressed={routePolicy === "fewest_transfers" ? "true" : "false"}
        className="create-action-button create-action-button-secondary"
        data-testid="create-policy-fewest-transfers"
        onClick={() => onRoutePolicyChange?.("fewest_transfers")}
        type="button"
      >
        Fewest transfers
      </button>
    </div>
  );
}

export const { registry: createRouteRegistry } = defineRegistry(createRouteCatalog, {
  components: {
    Card: shadcnComponents.Card,
    DepartureRow,
    ModeGroupHeader,
    RouteBlock,
    Stack: shadcnComponents.Stack,
    StopHeader,
    SupportBlock,
  },
});
