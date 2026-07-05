import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const foundationDir = join(root, "tests", "foundation");
const textNormalizer = pathToFileURL(
  join(root, "scripts", "testing", "foundation-text-normalizer.mjs"),
).href;
const testFiles = readdirSync(foundationDir)
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => join(foundationDir, name));

const child = spawn(process.execPath, ["--import", textNormalizer, "--test", ...testFiles], {
  cwd: root,
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});

const stdoutChunks = [];
const stderrChunks = [];

child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
child.stderr.on("data", (chunk) => stderrChunks.push(chunk));

function printLine(line) {
  const maxLineLength = 500;
  console.error(
    line.length > maxLineLength ? `${line.slice(0, maxLineLength)} ...[truncated]` : line,
  );
}

child.on("close", (code) => {
  const stdout = Buffer.concat(stdoutChunks).toString("utf8");
  const stderr = Buffer.concat(stderrChunks).toString("utf8");
  const output = `${stdout}${stderr ? `\n${stderr}` : ""}`;
  const lines = output.split(/\r?\n/);
  const summary = lines.filter((line) =>
    /^# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b/.test(line),
  );

  if (code === 0) {
    console.log("Foundation tests passed.");
    for (const line of summary) {
      console.log(line);
    }
    process.exit(0);
  }

  console.error("Foundation tests failed.");
  let printed = 0;

  for (let index = 0; index < lines.length; index += 1) {
    if (!/^(not ok \d+ -|✖ )/.test(lines[index])) {
      continue;
    }

    printed += 1;
    console.error("");
    printLine(lines[index]);

    let blockLines = 0;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];

      if (/^(ok \d+ -|not ok \d+ -|# Subtest: |✖ |✔ |﹣ |ℹ |1\.\.)/.test(line)) {
        break;
      }

      blockLines += 1;

      if (blockLines > 40) {
        console.error("  ...[failure block truncated]");
        break;
      }

      printLine(line);
    }
  }

  if (printed === 0) {
    console.error(output);
  }

  if (summary.length > 0) {
    console.error("");
    for (const line of summary) {
      console.error(line);
    }
  }

  process.exit(code ?? 1);
});
