import readline from "node:readline";

const suppressedPatterns = [
  /^\s*$/,
  /^\s*✓\s/,
  /^\s*↓\s/,
  /^ RUN /,
  /^ PASS /,
  /^\s*Test Files\s+/,
  /^\s*Tests\s+/,
  /^\s*Start at\s+/,
  /^\s*Duration\s+/,
  /^\s*Coverage enabled with /,
  /^\s*HTML report is generated in /,
];

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on("line", (line) => {
  if (suppressedPatterns.some((pattern) => pattern.test(line))) {
    return;
  }
  process.stdout.write(`${line}\n`);
});
