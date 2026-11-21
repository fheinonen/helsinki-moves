const PROD_IMPORT_PATTERN =
  /from\s+["'](@client\/|@server\/|@shared\/|\.\.\/\.\.\/api\/|\.\.\/\.\.\/tools\/)|import\(\s*["']\.\.\/\.\.\/api\//;
const DISABLED_JS_TEST_PATTERN =
  /\b(?:failFirstProbe\s*:\s*false|(?:test|it|describe)\.(?:skip|todo|only)\b)/;
const NOOP_STEP_PATTERN =
  /\b(?:run\s*:\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{\s*\}|(?:async\s+)?run\s*\([^)]*\)\s*\{\s*\})/;
const BROKEN_AND_PATTERN = /pattern\s*:\s*\/\^(?:And|But)\s|pattern\s*:\s*\/\^\(\?:[^/]*\|(?:And|But)\)/;
const CLI_DOC_SCRAPE_PATTERN = /README\.md|test-ci\.sh/;
const SCREENSHOT_CALL_PATTERN = /toHaveScreenshot\(\s*["']([^"']+)["']/g;
const PACKAGE_TEST_REF_PATTERN = /\btests\/[^\s"'&|;]+/g;

function findMatchingDelimiter(source, startIndex, quoteChar) {
  for (let i = startIndex + 1; i < source.length; i += 1) {
    if (source[i] === "\\") {
      i += 1;
      continue;
    }
    if (source[i] === quoteChar) {
      return i;
    }
  }
  return source.length - 1;
}

function findRegexEnd(source, startIndex) {
  let inCharClass = false;
  for (let i = startIndex + 1; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "\\") {
      i += 1;
      continue;
    }
    if (ch === "[") {
      inCharClass = true;
    } else if (ch === "]") {
      inCharClass = false;
    } else if (ch === "/" && !inCharClass) {
      let end = i;
      while (end + 1 < source.length && /[gimsuy]/.test(source[end + 1])) {
        end += 1;
      }
      return end;
    }
  }
  return startIndex;
}

function scanCodeTokens(source) {
  let codeOnly = "";
  const patterns = [];
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "`" || ch === '"' || ch === "'") {
      const end = findMatchingDelimiter(source, i, ch);
      codeOnly += ch + ch;
      i = end;
      continue;
    }
    const patternMatch = source.slice(i).match(/^pattern\s*:\s*(\/|")/);
    if (patternMatch) {
      const tokenStart = i + patternMatch[0].length - 1;
      const tokenEnd =
        patternMatch[1] === "/"
          ? findRegexEnd(source, tokenStart)
          : findMatchingDelimiter(source, tokenStart, '"');
      const rawPattern = source.slice(tokenStart, tokenEnd + 1);
      patterns.push(rawPattern);
      codeOnly += `pattern: ${rawPattern}`;
      i = tokenEnd;
      continue;
    }
    codeOnly += ch;
  }
  return { codeOnly, patterns };
}

function parseGherkinPhrases(featureText) {
  const phrases = [];
  let previous = "Given";
  for (const rawLine of featureText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^Scenario:/i.test(line)) {
      previous = "Given";
      continue;
    }
    const match = line.match(/^(Given|When|Then|And|But)\s+(.+)$/i);
    if (!match) {
      continue;
    }
    const keyword = /^(?:and|but)$/i.test(match[1])
      ? previous
      : match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
    previous = keyword;
    phrases.push(`${keyword} ${match[2].trim()}`);
  }
  return phrases;
}

function extractTopLevelFeatureBlock(source) {
  const callRegex = /\bdefine(?:Playwright)?Feature(?:<[^>]+>)?\s*\(/g;
  const masked = [];
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "`" || ch === '"' || ch === "'") {
      const end = findMatchingDelimiter(source, i, ch);
      masked.push([i, end]);
      i = end;
    }
  }
  const insideString = (pos) => masked.some(([start, end]) => pos >= start && pos <= end);

  for (const match of source.matchAll(callRegex)) {
    if (insideString(match.index)) {
      continue;
    }
    const afterCall = source.slice(match.index);
    const featureMatch = afterCall.match(/,\s*`([^`]*Feature:[^`]*)`\s*,\s*\{([\s\S]*)\}\s*\)/);
    if (featureMatch) {
      return {
        featureText: featureMatch[1],
        optionsBody: featureMatch[2],
      };
    }
  }
  return null;
}

function matchesAnyPhrase(rawPattern, phrases) {
  if (rawPattern.startsWith("/")) {
    const lastSlash = rawPattern.lastIndexOf("/");
    const regex = new RegExp(rawPattern.slice(1, lastSlash), rawPattern.slice(lastSlash + 1));
    return phrases.some((phrase) => regex.test(phrase));
  }
  const literal = rawPattern.slice(1, -1).toLowerCase();
  return phrases.some((phrase) => phrase.toLowerCase() === literal);
}

function auditBddPatterns(file, violations) {
  const block = extractTopLevelFeatureBlock(file.content);
  if (!block) {
    return;
  }
  const { codeOnly, patterns } = scanCodeTokens(block.optionsBody);
  if (NOOP_STEP_PATTERN.test(codeOnly)) {
    violations.push({
      code: "noop-or-broken-step",
      file: file.path,
      message: "contains a no-op/empty BDD step definition",
    });
  }
  if (BROKEN_AND_PATTERN.test(codeOnly)) {
    violations.push({
      code: "noop-or-broken-step",
      file: file.path,
      message: "contains an unmatchable ^And/^But or dead |And step regex",
    });
  }
  const phrases = parseGherkinPhrases(block.featureText);
  for (const rawPattern of patterns) {
    if (!matchesAnyPhrase(rawPattern, phrases)) {
      violations.push({
        code: "unused-step-definition",
        file: file.path,
        message: `unused step definition ${rawPattern}`,
      });
    }
  }
}

function auditWebUnitFile(file, violations) {
  if (!file.path.endsWith(".bdd.test.ts")) {
    violations.push({
      code: "legacy-test-file",
      file: file.path,
      message: "unit test must use the .bdd.test.ts convention",
    });
    return;
  }
  const code = scanCodeTokens(file.content).codeOnly;
  if (!code.includes("defineFeature")) {
    violations.push({
      code: "missing-bdd-runner",
      file: file.path,
      message: "unit test must use defineFeature",
    });
  }
  if (!PROD_IMPORT_PATTERN.test(file.content)) {
    violations.push({
      code: "no-production-import",
      file: file.path,
      message: "unit test does not import any production or tooling module",
    });
  }
  if (DISABLED_JS_TEST_PATTERN.test(code)) {
    violations.push({
      code: "disabled-or-skipped-test",
      file: file.path,
      message: "disables failFirstProbe or uses skipped/todo/only tests",
    });
  }
  auditBddPatterns(file, violations);
}

function auditPlaywrightFile(file, violations) {
  if (!file.path.endsWith(".spec.ts")) {
    violations.push({
      code: "legacy-test-file",
      file: file.path,
      message: "Playwright test must use the .spec.ts convention",
    });
    return;
  }
  const code = scanCodeTokens(file.content).codeOnly;
  if (!code.includes("definePlaywrightFeature")) {
    violations.push({
      code: "missing-bdd-runner",
      file: file.path,
      message: "Playwright test must use definePlaywrightFeature",
    });
  }
  if (DISABLED_JS_TEST_PATTERN.test(code)) {
    violations.push({
      code: "disabled-or-skipped-test",
      file: file.path,
      message: "disables failFirstProbe or uses skipped/todo/only tests",
    });
  }
  auditBddPatterns(file, violations);
}

function auditSnapshotDirs(snapshotDirs, e2eFiles, violations) {
  const e2eByPath = new Map(e2eFiles.map((file) => [file.path, file.content]));
  for (const dir of snapshotDirs) {
    const specPath = dir.path.replace(/-snapshots$/, "");
    const specContent = e2eByPath.get(specPath);
    if (!specContent) {
      violations.push({
        code: "orphaned-snapshot",
        file: dir.path,
        message: `snapshot directory has no matching spec file (${specPath})`,
      });
      continue;
    }
    const stems = [...specContent.matchAll(SCREENSHOT_CALL_PATTERN)].map((match) =>
      match[1].replace(/\.png$/i, "")
    );
    for (const fileName of dir.files) {
      const referenced = stems.some((stem) => fileName.startsWith(`${stem}-`));
      if (!referenced) {
        violations.push({
          code: "orphaned-snapshot",
          file: `${dir.path}/${fileName}`,
          message: `snapshot is not referenced by toHaveScreenshot() in ${specPath}`,
        });
      }
    }
  }
}

function auditUnusedHelpers(helperFiles, allWebFiles, violations) {
  for (const helper of helperFiles) {
    const stem = helper.path.split("/").pop()?.replace(/\.ts$/, "") ?? "";
    const isReferenced = allWebFiles.some(
      (candidate) => candidate.path !== helper.path && candidate.content.includes(`helpers/${stem}`)
    );
    if (!isReferenced) {
      violations.push({
        code: "unused-helper",
        file: helper.path,
        message: "test helper is not imported by any test or helper",
      });
    }
  }
}

function auditPackageScripts(packageScripts, allWebPaths, violations) {
  for (const [name, command] of Object.entries(packageScripts)) {
    for (const match of command.matchAll(PACKAGE_TEST_REF_PATTERN)) {
      const targetPath = `web/${match[0]}`;
      if (!allWebPaths.has(targetPath)) {
        violations.push({
          code: "broken-script-reference",
          file: "web/package.json",
          message: `script "${name}" references missing test file ${match[0]}`,
        });
      }
    }
  }
}

function auditCliBddFiles(cliBddFiles, violations) {
  const cliPaths = new Set(cliBddFiles.map((file) => file.path));
  for (const file of cliBddFiles) {
    if (file.path.endsWith(".bdd_test.go")) {
      const pair = file.path.replace(/\.bdd_test\.go$/, ".scenarios.txt");
      if (!cliPaths.has(pair)) {
        violations.push({
          code: "unpaired-cli-bdd",
          file: file.path,
          message: `missing matching scenarios file ${pair}`,
        });
      }
      if (CLI_DOC_SCRAPE_PATTERN.test(file.content)) {
        violations.push({
          code: "no-production-import",
          file: file.path,
          message: "CLI BDD test scrapes README.md or shells out to test-ci.sh",
        });
      }
      if (file.content.includes("t.Skip(")) {
        violations.push({
          code: "disabled-or-skipped-test",
          file: file.path,
          message: "CLI BDD test calls t.Skip()",
        });
      }
      continue;
    }
    if (file.path.endsWith(".scenarios.txt")) {
      const pair = file.path.replace(/\.scenarios\.txt$/, ".bdd_test.go");
      if (!cliPaths.has(pair)) {
        violations.push({
          code: "unpaired-cli-bdd",
          file: file.path,
          message: `orphaned scenarios file without matching ${pair}`,
        });
      }
      continue;
    }
    violations.push({
      code: "legacy-test-file",
      file: file.path,
      message: "cli/tests/bdd may only contain paired .bdd_test.go and .scenarios.txt files",
    });
  }
}

export function auditTestHygiene(snapshot) {
  const violations = [];
  for (const file of snapshot.unitFiles) {
    auditWebUnitFile(file, violations);
  }
  for (const file of [...snapshot.e2eFiles, ...snapshot.smokeFiles]) {
    auditPlaywrightFile(file, violations);
  }
  auditSnapshotDirs(snapshot.snapshotDirs, snapshot.e2eFiles, violations);
  const allWebFiles = [
    ...snapshot.unitFiles,
    ...snapshot.e2eFiles,
    ...snapshot.smokeFiles,
    ...snapshot.helperFiles,
  ];
  auditUnusedHelpers(snapshot.helperFiles, allWebFiles, violations);
  auditPackageScripts(
    snapshot.packageScripts,
    new Set(allWebFiles.map((file) => file.path)),
    violations
  );
  auditCliBddFiles(snapshot.cliBddFiles, violations);
  return { violations };
}
