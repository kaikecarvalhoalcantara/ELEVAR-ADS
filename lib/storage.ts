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
 * Resolve a raiz de storage com testes reais de uso.
 *
 * Ordem:
 *  1. STORAGE_DIR (ex: /data no Railway) — se passar no teste de subpasta
 *  2. /tmp/elevar-storage — fallback ephemeral (perde em redeploy)
 *  3. process.cwd() — último recurso
 */
function resolveStorageRoot(): string {
  const explicit = process.env.STORAGE_DIR;
  if (explicit) {
    if (isDirectoryFullyUsable(explicit)) {
      console.log(`[storage] ✓ STORAGE_DIR=${explicit} validado (persistente)`);
      return resolve(explicit);
    }
    console.error(
      `[storage] ✗ STORAGE_DIR=${explicit} NÃO consegue criar subpastas. Tentando fallback /tmp/elevar-storage…`,
    );
  }
  const fallback = "/tmp/elevar-storage";
  if (isDirectoryFullyUsable(fallback)) {
    console.warn(
      `[storage] ⚠️ Usando fallback ${fallback} — drafts NÃO persistem em redeploy. Configure volume em ${explicit ?? "STORAGE_DIR"}.`,
    );
    return fallback;
  }
  const cwdPath = process.cwd();
  console.warn(`[storage] ⚠️ /tmp também falhou. Usando cwd: ${cwdPath}`);
  return cwdPath;
}

const STORAGE_ROOT = resolveStorageRoot();

export function storagePath(...segments: string[]): string {
  return resolve(STORAGE_ROOT, ...segments);
}

export function getStorageRoot(): string {
  return STORAGE_ROOT;
}
