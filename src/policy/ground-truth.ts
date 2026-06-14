export const GROUND_TRUTH_INSTRUCTION = [
  "Memory OS context is authoritative for prior decisions, project history, user preferences, and documented stable facts.",
  "Injected memory wins over assumptions.",
  "Live tool output wins for current runtime state such as files, git status, ports, tests, and builds.",
  "Official docs win for version-specific APIs and external facts.",
  "Training knowledge loses to all of the above.",
].join(" ");
