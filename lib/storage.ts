import { resolve } from "node:path";
import { mkdirSync, accessSync, constants } from "node:fs";

/**
 * Resolve a raiz de storage com fallback resiliente.
 *
 * Ordem:
 *  1. STORAGE_DIR (ex: /data no Railway) — se existir e for writable
 *  2. /tmp/elevar-storage — fallback ephemeral (perde em redeploy)
 *  3. process.cwd() — último recurso (dev local)
 */
function resolveStorageRoot(): string {
  const explicit = process.env.STORAGE_DIR;
  if (explicit) {
    try {
      mkdirSync(explicit, { recursive: true });
      accessSync(explicit, constants.W_OK);
      return resolve(explicit);
    } catch (err) {
      console.error(
        `[storage] STORAGE_DIR=${explicit} indisponível (${(err as Error).message}). Tentando fallback /tmp/elevar-storage…`,
      );
      const fallback = "/tmp/elevar-storage";
      try {
        mkdirSync(fallback, { recursive: true });
        accessSync(fallback, constants.W_OK);
        console.warn(
          `[storage] USANDO FALLBACK ${fallback} — drafts/cache NÃO persistem em redeploy. Configure o volume em ${explicit}.`,
        );
        return fallback;
      } catch (err2) {
        console.error(
          `[storage] /tmp também falhou: ${(err2 as Error).message}. Usando cwd.`,
        );
      }
    }
  }
  return process.cwd();
}

const STORAGE_ROOT = resolveStorageRoot();
console.log(`[storage] Raiz de storage: ${STORAGE_ROOT}`);

export function storagePath(...segments: string[]): string {
  return resolve(STORAGE_ROOT, ...segments);
}

export function getStorageRoot(): string {
  return STORAGE_ROOT;
}
