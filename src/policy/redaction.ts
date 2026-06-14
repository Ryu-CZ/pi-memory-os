const SECRET_ASSIGNMENT = /\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS)[A-Z0-9_]*)\s*=\s*([^\s]+)/gi;
const PASSWORD_FIELD = /\b(password|api_key|token|secret)\s*:\s*([^\n,]+)/gi;
const DIRECTIVE_WORDS = /\b(ignore|forget|disregard|override|replace|pretend|act as|you are|you must|you will|you shall)\b/gi;
const INVISIBLE_CHARS = /[\u200b-\u200f\u2028-\u202f\u2060-\u2064\ufeff]/g;

export function redactSecrets(text: string): string {
  return text
    .replace(SECRET_ASSIGNMENT, "$1=[REDACTED]")
    .replace(PASSWORD_FIELD, "$1: [REDACTED]");
}

export function sanitizeMemoryText(text: string, maxLen = 600): string {
  try {
    const original = String(text);
    const directiveCount = original.match(DIRECTIVE_WORDS)?.length ?? 0;
    if (directiveCount >= 3 && directiveCount / Math.max(original.length, 1) > 0.02) {
      return "[SANITIZED]";
    }

    return redactSecrets(original)
      .replace(/\bignore\s+(?:all\s+)?(?:previous|prior)\s+(?:instructions|directives|commands|messages|prompts|context)\b/gi, "[REDACTED]")
      .replace(/\bdisregard\s+(?:all\s+)?(?:previous|prior)\s+(?:instructions|directives|commands|messages|prompts|context)\b/gi, "[REDACTED]")
      .replace(/\breveal\s+secrets?\b/gi, "[REDACTED]")
      .replace(/\byou\s+(?:are|will)\s+now\b.*?\b(?:become|act|acting as)\b.*?\b(?:ai assistant|assistant|ai|agent|llm|chatbot|model|system)\b/gi, "[REDACTED]")
      .replace(/\bnew\s+(?:instructions|directives|commands)\s+(?:(?:follow\s+)?(?:above|below)|follow)\b/gi, "[REDACTED]")
      .replace(/\{\{[\s\S]*?\}\}/g, "[REDACTED]")
      .replace(/\$\{[\s\S]*?\}/g, "[REDACTED]")
      .replace(/```/g, "[code]")
      .replace(/\b(?:javascript|data)\s*:/gi, "sanitized:")
      .replace(/<\s*(?:script|iframe)/gi, "[sanitized]")
      .replace(/\bon\w+\s*=/gi, "[sanitized]")
      .replace(/\[(?:IMPORTANT|SYSTEM|OVERRIDE):[^\]]*\]/gi, "[REDACTED]")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
      .replace(INVISIBLE_CHARS, "")
      .replace(/\n{4,}/g, "\n\n\n")
      .replace(/[ \t]{8,}/g, " ")
      .trim()
      .slice(0, maxLen);
  } catch {
    return String(text).slice(0, maxLen);
  }
}
