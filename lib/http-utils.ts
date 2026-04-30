import { relative, sep } from "node:path";
import { getStorageRoot } from "./storage";

const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") ||
  `http://127.0.0.1:${process.env.PORT || 3000}`;

// V32: subdirectories conhecidos onde o storage guarda arquivos.
// Usados pra extrair o path relativo mesmo se o STORAGE_DIR mudou
// (ex: drafts antigos com path /tmp/elevar-storage/client-assets/...
// continuam acessíveis mesmo agora que STORAGE_DIR=/data).
const KNOWN_SUBDIRS = ["client-assets", "video-cache", "generated", "drafts", "my_videos"];

/**
 * Converte um videoSrc do draft em URL pronta pro browser/Remotion.
 *
 * - Se já é URL HTTP (Pexels CDN, etc) → passa direto
 * - Se é filepath local (client assets uploadados) → serve via /api/local-video
 * - Vazio → retorna ""
 *
 * V32: Resiliente a mudança de STORAGE_DIR. Se o path antigo aponta
 * pra /tmp/elevar-storage/X mas agora STORAGE_DIR=/data, ainda extrai
 * o subpath conhecido (X em /api/local-video/X). Útil pra drafts
 * criados antes de configurar volume persistente.
 */
export function localPathToHttpUrl(absPath: string): string {
  if (!absPath) return "";
  // Já é URL HTTP — passa direto (Pexels CDN)
  if (absPath.startsWith("http://") || absPath.startsWith("https://")) {
    return absPath;
  }

  // Tentativa 1: caminho relativo ao STORAGE_DIR atual
  const rel = relative(getStorageRoot(), absPath);
  if (!rel.startsWith("..")) {
    return buildUrl(rel);
  }

  // Tentativa 2 (V32 fallback): extrai subpath conhecido (client-assets/...,
  // video-cache/..., etc). Resolve drafts com paths legados.
  const normalizedPath = absPath.replace(/\\/g, "/");
  for (const subdir of KNOWN_SUBDIRS) {
    const idx = normalizedPath.lastIndexOf(`/${subdir}/`);
    if (idx >= 0) {
      const relativePath = normalizedPath.substring(idx + 1); // remove leading "/"
      return buildUrl(relativePath);
    }
  }

  return "";
}

function buildUrl(relativePath: string): string {
  const segments = relativePath
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .map((s) => encodeURIComponent(s));
  return `${PUBLIC_BASE_URL}/api/local-video/${segments.join("/")}`;
}
