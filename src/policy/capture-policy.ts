import { redactSecrets } from "./redaction.js";

export interface CaptureCandidate {
  ok: boolean;
  text?: string;
  source?: string;
  tags?: string[];
  reason?: string;
}

const MIN_LENGTH = 80;
const REDACT_THRESHOLD = 0.15;

const ACKNOWLEDGEMENT_PATTERNS = [
  /\b(thanks|thank you|ty|tysm|appreciate|grateful|cheers)\b/i,
  /\b(got it|understood|makes sense|clear|noted|sure|ok|okay|alright)\b/i,
  /\b(no problem|np|youre? welcome|my pleasure|anytime)\b/i,
  /\b(let me know|if you need|just ask|feel free|reach out)\b/i,
  /\b(good luck|gl|best of luck|have a good|enjoy|bye|see you)\b/i,
];

function isAcknowledgement(text: string): boolean {
  const trimmed = text.trim();
  const sentences = trimmed.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  return sentences.every((s) => ACKNOWLEDGEMENT_PATTERNS.some((re) => re.test(s.trim())));
}

function redactRatio(original: string, redacted: string): number {
  const origWords = original.split(/\s+/).length;
  if (origWords === 0) return 0;
  const redactedWords = redacted.split(/\s+/).length;
  const redactedTokens = (redacted.match(/\[REDACTED\]/g) || []).length;
  return redactedTokens / origWords;
}

export function buildCaptureCandidate(text: string, source: string): CaptureCandidate {
  const trimmed = text.trim();

  if (trimmed.length < MIN_LENGTH) {
    return { ok: false, reason: "too short" };
  }

  if (isAcknowledgement(trimmed)) {
    return { ok: false, reason: "acknowledgement" };
  }

  const redacted = redactSecrets(trimmed);

  if (redactRatio(trimmed, redacted) > REDACT_THRESHOLD) {
    return { ok: false, reason: "too much redacted" };
  }

  return {
    ok: true,
    text: redacted,
    source,
    tags: ["auto", "pi", "agent_end", "memory-os-capture", "source_tool:pi-memory-os"],
  };
}
