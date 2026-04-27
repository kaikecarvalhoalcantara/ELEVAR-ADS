import { relative, sep } from "node:path";
import { getStorageRoot } from "./storage";

const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") ||
  `http://127.0.0.1:${process.env.PORT || 3000}`;

/**
 * Converte um path absoluto (em STORAGE_ROOT) numa URL HTTP servida pela
 * /api/local-video. Em produção, STORAGE_ROOT é /tmp/elevar-storage —
 * NÃO usa process.cwd() (que seria /app, fora do storage).
 */
export function localPathToHttpUrl(absPath: string): string {
  if (!absPath) return "";
  const rel = relative(getStorageRoot(), absPath);
  if (rel.startsWith("..")) return "";
  const segments = rel
    .split(sep)
    .filter(Boolean)
    .map((s) => encodeURIComponent(s));
  return `${PUBLIC_BASE_URL}/api/local-video/${segments.join("/")}`;
}
