#!/usr/bin/env node
// Smoke test: run Pi through prompts that exercise the extension lifecycle.
// Usage: node scripts/smoke-pi-lifecycle.mjs
// Requires: pi on PATH, extension enabled, and Memory OS env configured.

import { spawn } from "node:child_process";

const prompts = [
  "README.md",
  "what did we decide about pi-memory-os boundaries?",
];

function runPi(prompt) {
  return new Promise((resolve, reject) => {
    console.log();
    console.log(`$ pi -p ${JSON.stringify(prompt)}`);
    const child = spawn("pi", ["-p", prompt], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`pi exited with code ${code}`));
    });
  });
}

async function main() {
  console.log("Pi Lifecycle Smoke");
  console.log("==================");
  console.log("Expected checks:");
  console.log("- README.md should complete without visible memory plumbing errors.");
  console.log("- Boundary prompt should run with Memory OS context available when relevant.");
  console.log("- No default memory_os_* tools should be required.");

  for (const prompt of prompts) {
    await runPi(prompt);
  }
}

main().catch((err) => {
  console.error(`Pi lifecycle smoke failed: ${err.message}`);
  process.exit(1);
});
