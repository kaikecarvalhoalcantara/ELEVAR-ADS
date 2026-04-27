import { relative, sep } from "node:path";

const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:3000";

export function localPathToHttpUrl(absPath: string): string {
  if (!absPath) return "";
  const rel = relative(process.cwd(), absPath);
  if (rel.startsWith("..")) return "";
  const segments = rel
    .split(sep)
    .filter(Boolean)
    .map((s) => encodeURIComponent(s));
  return `${PUBLIC_BASE_URL}/api/local-video/${segments.join("/")}`;
}
