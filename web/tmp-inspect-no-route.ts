import { createBlockPlanForRouteCanvas } from './src/client/create/block-plan-from-intent.ts';

const routeCanvas = {
  alerts: [{
    cause: 'OTHER_CAUSE',
    descriptionText: 'Tripla stop has no service right now.',
    effect: 'NO_SERVICE',
    effectiveEndDate: 1774215000,
    effectiveStartDate: 1773401400,
    entities: [{ stopCode: 'H0059', stopId: 'HSL:TRIPLA', stopName: 'Tripla', type: 'stop' }],
    headerText: 'Tripla stop service cancelled',
    id: 'alert-no-service-tripla',
    severityLevel: 'SEVERE',
  }],
  alternatives: [{ distanceMeters: 40, stopCode: 'H0059', stopName: 'Tripla' }],
  canvasType: 'destination_route',
  degraded: true,
  policy: 'fastest',
  reason: 'service_disruption',
  state: 'no_route',
  title: "let's go to Mall of Tripla",
};

console.log(JSON.stringify(createBlockPlanForRouteCanvas(routeCanvas as any), null, 2));
