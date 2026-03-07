import type { TestInfo } from "@playwright/test";
import { parseFeature, type AssertApi } from "@tests/helpers/bdd-runner";

const FAIL_FIRST_PROBE_ERROR = "__playwright_bdd_fail_first_probe__";

interface ParsedScenario {
  name: string;
  steps: Array<{
    phrase: string;
  }>;
}

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

type StepDefinition<World> =
  | [pattern: RegExp | string, run: (context: StepContext<World>) => void | Promise<void>]
  | {
      pattern: RegExp | string;
      run: (context: StepContext<World>) => void | Promise<void>;
    };

interface NormalizedStepDefinition<World> {
  pattern: RegExp | string;
  run: (context: StepContext<World>) => void | Promise<void>;
}

function normalizeStepDefinitions<World>(
  stepDefinitions: StepDefinition<World>[]
): NormalizedStepDefinition<World>[] {
  if (!Array.isArray(stepDefinitions) || stepDefinitions.length === 0) {
    throw new Error("Step definitions are required");
  }

  return stepDefinitions.map((definition, index) => {
    if (!definition || (typeof definition !== "object" && !Array.isArray(definition))) {
      throw new Error(`Invalid step definition at index ${index}`);
    }

    const pattern = Array.isArray(definition) ? definition[0] : definition.pattern;
    const run = Array.isArray(definition) ? definition[1] : definition.run;
    if (!(typeof pattern === "string" || pattern instanceof RegExp)) {
      throw new Error(`Step definition ${index} has invalid pattern`);
    }
    if (typeof run !== "function") {
      throw new Error(`Step definition ${index} has invalid run function`);
    }

    return { pattern, run };
  });
}

function resolveStep<World>(
  step: { phrase: string },
  stepDefinitions: NormalizedStepDefinition<World>[]
): {
  args: string[];
  definition: NormalizedStepDefinition<World>;
} {
  const matches: Array<{
    args: string[];
    definition: NormalizedStepDefinition<World>;
  }> = [];

  for (const definition of stepDefinitions) {
    const { pattern } = definition;
    if (typeof pattern === "string") {
      if (pattern.toLowerCase() === step.phrase.toLowerCase()) {
        matches.push({ definition, args: [] });
      }
      continue;
    }

    const regex = new RegExp(pattern.source, pattern.flags);
    const match = step.phrase.match(regex);
    if (match) {
      matches.push({ definition, args: match.slice(1) });
    }
  }

  if (matches.length === 0) {
    throw new Error(`Missing step definition for: "${step.phrase}"`);
  }
  if (matches.length > 1) {
    throw new Error(`Ambiguous step definition for: "${step.phrase}"`);
  }
  return matches[0];
}

function createFailFirstProbeAssert(): AssertApi {
  return {
    equal() {
      throw new Error(FAIL_FIRST_PROBE_ERROR);
    },
    match() {
      throw new Error(FAIL_FIRST_PROBE_ERROR);
    },
  };
}

async function executeScenario<World>(input: {
  assertionApi?: AssertApi;
  fixtures: Fixtures;
  scenario: ParsedScenario;
  stepDefinitions: NormalizedStepDefinition<World>[];
  world: World;
}): Promise<void> {
  const { assertionApi = createFailFirstProbeAssert(), fixtures, scenario, stepDefinitions, world } = input;
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
  stepDefinitions: NormalizedStepDefinition<World>[];
  testInfo: TestInfo;
}): Promise<void> {
  const { createWorld, fixtures, scenario, stepDefinitions, testInfo } = input;
  try {
    await executeScenario({
      assertionApi: createFailFirstProbeAssert(),
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

const defaultAssert: AssertApi = {
  equal(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message || `Expected ${String(actual)} to equal ${String(expected)}`);
    }
  },
  match(actual, expected, message) {
    if (!expected.test(actual)) {
      throw new Error(message || `Expected "${actual}" to match ${String(expected)}`);
    }
  },
};

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
    stepDefinitions: StepDefinition<World>[];
  }
): void {
  const { createWorld, failFirstProbe = false, stepDefinitions } = input;
  const normalizedDefinitions = normalizeStepDefinitions(stepDefinitions);
  const scenarios = parseFeature(featureText) as ParsedScenario[];

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
