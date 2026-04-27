import { resolve } from "node:path";

/**
 * Raiz pra dados persistentes (drafts, video-cache, generated, client-assets).
 * Em dev: usa cwd. Em produção (Railway): aponta pra volume montado em /data.
 */
const STORAGE_ROOT = process.env.STORAGE_DIR
  ? resolve(process.env.STORAGE_DIR)
  : process.cwd();

export function storagePath(...segments: string[]): string {
  return resolve(STORAGE_ROOT, ...segments);
}

export function getStorageRoot(): string {
  return STORAGE_ROOT;
}
