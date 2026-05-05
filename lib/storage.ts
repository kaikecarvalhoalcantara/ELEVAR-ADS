import { resolve, join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";

/**
 * Testa de verdade se o diretório suporta criação de subpastas E
 * escrita. Não basta `mkdirSync(/data)` (no-op se existe).
 */
function isDirectoryFullyUsable(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true });
    const testSubdir = join(dir, `.storage-test-${process.pid}-${Date.now()}`);
    mkdirSync(testSubdir, { recursive: true });
    rmSync(testSubdir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * V77: Resolve a raiz de storage com fallback EXPLÍCITO E AUTOMÁTICO.
 *
 * Ordem de prioridade:
 *  1. STORAGE_DIR (env var explícita) — se passar no teste de subpasta
 *  2. /data (Railway/Docker volume convencional) — tentado AUTOMATICAMENTE
 *     mesmo sem env var setada. Resolve caso user tenha montado o volume
 *     mas esquecido de setar STORAGE_DIR.
 *  3. /tmp/elevar-storage — fallback ephemeral (perde em redeploy)
 *  4. process.cwd() — último recurso
 */
let STORAGE_RESOLVED_INFO: {
  path: string;
  persistent: boolean;
  reason: string;
} = {
  path: "",
  persistent: false,
  reason: "not-resolved",
};

function resolveStorageRoot(): string {
  const explicit = process.env.STORAGE_DIR;
  if (explicit) {
    if (isDirectoryFullyUsable(explicit)) {
      console.log(`[storage] ✓ STORAGE_DIR=${explicit} validado (persistente)`);
      STORAGE_RESOLVED_INFO = {
        path: resolve(explicit),
        persistent: true,
        reason: `STORAGE_DIR env var: ${explicit}`,
      };
      return resolve(explicit);
    }
    console.error(
      `[storage] ✗ STORAGE_DIR=${explicit} NÃO consegue criar subpastas.`,
    );
  }
  // V77: tenta /data automaticamente — Railway/Docker convention
  const railwayVolume = "/data";
  if (isDirectoryFullyUsable(railwayVolume)) {
    console.log(
      `[storage] ✓ /data detectado e validado (persistente — provavelmente volume Railway)`,
    );
    STORAGE_RESOLVED_INFO = {
      path: railwayVolume,
      persistent: true,
      reason: "/data automaticamente detectado (volume Railway)",
    };
    return railwayVolume;
  }
  const fallback = "/tmp/elevar-storage";
  if (isDirectoryFullyUsable(fallback)) {
    console.warn(
      `[storage] ⚠️ Usando fallback ${fallback} — VOLÁTIL, drafts e uploads NÃO persistem em redeploy. Configure volume em /data.`,
    );
    STORAGE_RESOLVED_INFO = {
      path: fallback,
      persistent: false,
      reason: "FALLBACK /tmp — volátil, perde em redeploy",
    };
    return fallback;
  }
  const cwdPath = process.cwd();
  console.warn(`[storage] ⚠️ /tmp também falhou. Usando cwd: ${cwdPath}`);
  STORAGE_RESOLVED_INFO = {
    path: cwdPath,
    persistent: false,
    reason: "FALLBACK cwd — último recurso, instável",
  };
  return cwdPath;
}

const STORAGE_ROOT = resolveStorageRoot();

export function storagePath(...segments: string[]): string {
  return resolve(STORAGE_ROOT, ...segments);
}

export function getStorageRoot(): string {
  return STORAGE_ROOT;
}

/**
 * V77: Info do storage pra mostrar no UI (banner de aviso se volátil).
 */
export function getStorageInfo(): {
  path: string;
  persistent: boolean;
  reason: string;
} {
  return { ...STORAGE_RESOLVED_INFO };
}
