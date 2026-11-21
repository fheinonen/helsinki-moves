import type { TestInfo } from "@playwright/test";
import {
  assertStepDefinitionsUsed,
  createFailFirstProbeAssert,
  defaultAssert,
  normalizeStepDefinitions,
  parseFeature,
  resolveStep,
  type AssertApi,
  type NormalizedStepDefinition,
  type ParsedScenario,
  type StepDefinition,
} from "@tests/helpers/bdd-runner";

const FAIL_FIRST_PROBE_ERROR = "__playwright_bdd_fail_first_probe__";

interface Fixtures {
  browser: unknown;
  context: unknown;
  page: unknown;
  request: unknown;
}

interface StepContext<World> {
  args: string[];
  assert: AssertApi;
  fixtures: Fixtures;
  scenario: ParsedScenario;
  world: World;
}

async function executeScenario<World>(input: {
  assertionApi?: AssertApi;
  fixtures: Fixtures;
  scenario: ParsedScenario;
  stepDefinitions: NormalizedStepDefinition<StepContext<World>>[];
  world: World;
}): Promise<void> {
  const { assertionApi = defaultAssert, fixtures, scenario, stepDefinitions, world } = input;
  for (const step of scenario.steps) {
    const match = resolveStep(step, stepDefinitions);
    await match.definition.run({
      args: match.args,
      assert: assertionApi,
      fixtures,
      scenario,
      world,
    });
  }
}

async function assertFailFirstProbe<World>(input: {
  createWorld: (input: { fixtures: Fixtures; probe: boolean; testInfo: TestInfo }) => Promise<World> | World;
  fixtures: Fixtures;
  scenario: ParsedScenario;
  stepDefinitions: NormalizedStepDefinition<StepContext<World>>[];
  testInfo: TestInfo;
}): Promise<void> {
  const { createWorld, fixtures, scenario, stepDefinitions, testInfo } = input;
  try {
    await executeScenario({
      assertionApi: createFailFirstProbeAssert(FAIL_FIRST_PROBE_ERROR),
      fixtures,
      scenario,
      stepDefinitions,
      world: await createWorld({ fixtures, probe: true, testInfo }),
    });
  } catch (error) {
    if (error instanceof Error && error.message === FAIL_FIRST_PROBE_ERROR) {
      return;
    }
    throw error;
  }

  throw new Error(`Fail-first probe did not hit any assertions in scenario "${scenario.name}"`);
}

export function definePlaywrightFeature<World>(
  testFn: (
    name: string,
    implementation: (
      fixtures: { browser: unknown; context: unknown; page: unknown; request: unknown },
      testInfo: TestInfo
    ) => void | Promise<void>
  ) => void,
  featureText: string,
  input: {
    createWorld: (input: { fixtures: Fixtures; probe?: boolean; testInfo: TestInfo }) => Promise<World> | World;
    failFirstProbe?: boolean;
    stepDefinitions: StepDefinition<StepContext<World>>[];
  }
): void {
  const { createWorld, failFirstProbe = false, stepDefinitions } = input;
  const normalizedDefinitions = normalizeStepDefinitions(stepDefinitions);
  const scenarios = parseFeature(featureText);
  assertStepDefinitionsUsed(scenarios, normalizedDefinitions);

  for (const scenario of scenarios) {
    testFn(
      scenario.name,
      async ({ browser, context, page, request }, testInfo) => {
        const fixtures: Fixtures = { browser, context, page, request };
        if (failFirstProbe) {
          await assertFailFirstProbe({
            createWorld,
            fixtures,
            scenario,
            stepDefinitions: normalizedDefinitions,
            testInfo,
          });
        }

        await executeScenario({
          assertionApi: defaultAssert,
          fixtures,
          scenario,
          stepDefinitions: normalizedDefinitions,
          world: await createWorld({ fixtures, testInfo }),
        });
      }
    );
  }
}
