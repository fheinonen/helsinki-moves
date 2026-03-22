import { createDigitransitService } from './src/server/services/digitransit/client.ts';

const service = createDigitransitService();

async function testAlerts(routeIds: string[], stopIds: string[]) {
  try {
    const alerts = await service.getAlerts({ routeIds, stopIds });
    
    console.log(`=== TEST: route=${routeIds}, stop=${stopIds} ===`);
    console.log('Count:', alerts.length);
    
    if (alerts.length > 0) {
      console.log('\nFirst alert sample:');
      const a = alerts[0];
      console.log('  id:', a.id);
      console.log('  headerText:', a.headerText);
      console.log('  descriptionText:', a.descriptionText?.substring(0, 100));
      console.log('  effect:', a.effect);
      console.log('  cause:', a.cause);
      console.log('  severityLevel:', a.severityLevel);
      console.log('  effectiveStartDate:', a.effectiveStartDate);
      console.log('  effectiveEndDate:', a.effectiveEndDate);
      console.log('  entities:', a.entities.map(e => ({ type: e.type, ...(e.routeShortName ? {routeShortName: e.routeShortName} : {}), ...(e.stopName ? {stopName: e.stopName} : {}) })));
      
      console.log('\nAll unique effects seen:', new Set(alerts.map(a => a.effect)));
      console.log('All unique severityLevels:', new Set(alerts.map(a => a.severityLevel)));
      console.log('All unique entity types:', new Set(alerts.flatMap(a => a.entities.map(e => e.type))));
    } else {
      console.log('  (no alerts)');
    }
    console.log('');
    return alerts;
  } catch (err) {
    console.error('Error:', err.message);
    return [];
  }
}

// Test various routes
await testAlerts(['HSL:57'], ['HSL:1250401']); // 57 and Kamppi
await testAlerts(['HSL:1', 'HSL:2', 'HSL:3'], []); // Some tram lines
await testAlerts([], ['HSL:1220411']); // Some stop
await testAlerts(['HSL:1010'], ['HSL:1450201']); // Rautatientori stop
