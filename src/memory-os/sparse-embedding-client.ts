import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 5000;

export interface SparseEmbeddingOptions {
  dockerDir: string | null;
  python: string;
  timeoutMs?: number;
}

export interface SparseVector {
  indices: number[];
  values: number[];
}

const PYTHON_SNIPPET = String.raw`
import json
import sys
from fastembed.sparse import SparseTextEmbedding

text = sys.argv[1]
model = SparseTextEmbedding(model_name="Qdrant/bm25")
sparse = list(model.embed([text]))[0]
print(json.dumps({"indices": sparse.indices.tolist(), "values": sparse.values.tolist()}))
`;

function parseSparseVector(stdout: string): SparseVector | null {
  const parsed = JSON.parse(stdout) as unknown;
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record.indices) || !Array.isArray(record.values)) return null;
  const indices = record.indices.map(Number).filter((value) => Number.isInteger(value));
  const values = record.values.map(Number).filter((value) => Number.isFinite(value));
  if (!indices.length || indices.length !== values.length) return null;
  return { indices, values };
}

export async function embedSparseText(text: string, options: SparseEmbeddingOptions): Promise<SparseVector | null> {
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const args = options.dockerDir
    ? ["compose", "exec", "-T", "worker", options.python, "-c", PYTHON_SNIPPET, text]
    : ["-c", PYTHON_SNIPPET, text];
  const command = options.dockerDir ? "docker" : options.python;
  const result = await execFileAsync(command, args, {
    cwd: options.dockerDir ?? undefined,
    timeout,
    maxBuffer: 1024 * 1024,
  });
  const stdout = typeof result === "string" ? result : result.stdout;
  return parseSparseVector(stdout);
}
