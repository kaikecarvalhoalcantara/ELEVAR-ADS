import { relative, sep } from "node:path";
import { getStorageRoot } from "./storage";

const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") ||
  `http://127.0.0.1:${process.env.PORT || 3000}`;

/**
 * Converte um videoSrc do draft em URL pronta pro browser/Remotion.
 *
 * - Se já é URL HTTP (Pexels CDN, etc) → passa direto
 * - Se é filepath local (client assets uploadados) → serve via /api/local-video
 * - Vazio → retorna ""
 */
export function localPathToHttpUrl(absPath: string): string {
  if (!absPath) return "";
  // Já é URL HTTP — passa direto (Pexels CDN)
  if (absPath.startsWith("http://") || absPath.startsWith("https://")) {
    return absPath;
  }
  // Filepath local — converte pra rota /api/local-video
  const rel = relative(getStorageRoot(), absPath);
  if (rel.startsWith("..")) return "";
  const segments = rel
    .split(sep)
    .filter(Boolean)
    .map((s) => encodeURIComponent(s));
  return `${PUBLIC_BASE_URL}/api/local-video/${segments.join("/")}`;
}
