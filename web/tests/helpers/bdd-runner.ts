const STEP_PATTERN = /^(Given|When|Then|And|But)\s+(.+)$/i;
const SCENARIO_PATTERN = /^Scenario:\s+(.+)$/i;
const FAIL_FIRST_PROBE_ERROR = "__bdd_fail_first_probe__";

export interface AssertApi {
  equal(actual: unknown, expected: unknown, message?: string): void;
  match(actual: string, expected: RegExp, message?: string): void;
}

interface ParsedStep {
  keyword: "Given" | "When" | "Then";
  lineNumber: number;
  phrase: string;
  rawKeyword: string;
  text: string;
}

interface ParsedScenario {
  name: string;
  steps: ParsedStep[];
}

interface StepContext<World> {
  args: string[];
  assert: AssertApi;
  scenario: ParsedScenario;
  step: ParsedStep;
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

export function parseFeature(featureText: string): ParsedScenario[] {
  const scenarios: ParsedScenario[] = [];
  const lines = String(featureText || "").split(/\r?\n/);
  let currentScenario: ParsedScenario | null = null;
  let previousKeyword: ParsedStep["keyword"] = "Given";

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const rawLine = lines[index];
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || /^Feature:/i.test(line)) {
      continue;
    }

    const scenarioMatch = line.match(SCENARIO_PATTERN);
    if (scenarioMatch) {
      currentScenario = {
        name: scenarioMatch[1].trim(),
        steps: [],
      };
      previousKeyword = "Given";
      scenarios.push(currentScenario);
      continue;
    }

    const stepMatch = line.match(STEP_PATTERN);
    if (!stepMatch) {
      throw new Error(`Invalid feature syntax at line ${lineNumber}: ${rawLine}`);
    }
    if (!currentScenario) {
      throw new Error(`Step before Scenario at line ${lineNumber}: ${rawLine}`);
    }

    const rawKeyword = stepMatch[1];
    const stepText = stepMatch[2].trim();
    const keyword: ParsedStep["keyword"] =
      /^and$/i.test(rawKeyword) || /^but$/i.test(rawKeyword)
        ? previousKeyword
        : normalizeKeyword(rawKeyword);
    previousKeyword = keyword;

    currentScenario.steps.push({
      keyword,
      lineNumber,
      phrase: `${keyword} ${stepText}`,
      rawKeyword,
      text: stepText,
    });
  }

  if (scenarios.length === 0) {
    throw new Error("Feature does not contain any Scenario sections");
  }
  for (const scenario of scenarios) {
    if (scenario.steps.length === 0) {
      throw new Error(`Scenario "${scenario.name}" does not contain steps`);
    }
  }
  return scenarios;
}

function normalizeKeyword(keyword: string): ParsedStep["keyword"] {
  const normalized = String(keyword || "").toLowerCase();
  if (normalized === "given") return "Given";
  if (normalized === "when") return "When";
  if (normalized === "then") return "Then";
  throw new Error(`Unsupported step keyword: ${keyword}`);
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
  step: ParsedStep,
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
  scenario: ParsedScenario;
  stepDefinitions: NormalizedStepDefinition<World>[];
  world: World;
}): Promise<void> {
  const { assertionApi = defaultAssert, scenario, stepDefinitions, world } = input;
  for (const step of scenario.steps) {
    const match = resolveStep(step, stepDefinitions);
    await match.definition.run({
      args: match.args,
      assert: assertionApi,
      scenario,
      step,
      world,
    });
  }
}

async function assertFailFirstProbe<World>(input: {
  createWorld: () => World;
  scenario: ParsedScenario;
  stepDefinitions: NormalizedStepDefinition<World>[];
}): Promise<void> {
  const { createWorld, scenario, stepDefinitions } = input;
  try {
    await executeScenario({
      assertionApi: createFailFirstProbeAssert(),
      scenario,
      stepDefinitions,
      world: createWorld(),
    });
  } catch (error) {
    if (error instanceof Error && error.message === FAIL_FIRST_PROBE_ERROR) {
      return;
    }
    throw error;
  }

  throw new Error(`Fail-first probe did not hit any assertions in scenario "${scenario.name}"`);
}

export function defineFeature<World>(
  testFn: (
    name: string,
    implementation: () => void | Promise<void>
  ) => void,
  featureText: string,
  input: {
    createWorld: () => World;
    failFirstProbe?: boolean;
    stepDefinitions: StepDefinition<World>[];
  }
): void {
  const { createWorld, failFirstProbe = true, stepDefinitions } = input;
  const normalizedDefinitions = normalizeStepDefinitions(stepDefinitions);
  const scenarios = parseFeature(featureText);

  for (const scenario of scenarios) {
    testFn(scenario.name, async () => {
      if (failFirstProbe) {
        await assertFailFirstProbe({
          createWorld,
          scenario,
          stepDefinitions: normalizedDefinitions,
        });
      }

      await executeScenario({
        scenario,
        stepDefinitions: normalizedDefinitions,
        world: createWorld(),
      });
    });
  }
}
