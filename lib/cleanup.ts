import { promises as fs } from "node:fs";
import { join } from "node:path";
import { storagePath } from "./storage";

const OUTPUT_ROOT = storagePath("generated");

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export interface CleanupResult {
  deletedCount: number;
  freedBytes: number;
  scanned: number;
  errors: string[];
}

/**
 * Apaga MP4s renderizados mais velhos que `maxAgeMs` (default 24h).
 * Usa mtime do arquivo. Volume Railway é 500MB, então cleanup
 * agressivo é vital — sem ele 1-2 lotes de 10 ads enchem o disco.
 *
 * Passa `maxAgeMs = 0` pra apagar TUDO (botão manual).
 */
export async function cleanOldRenders(
  maxAgeMs: number = TWENTY_FOUR_HOURS_MS,
): Promise<CleanupResult> {
  const result: CleanupResult = {
    deletedCount: 0,
    freedBytes: 0,
    scanned: 0,
    errors: [],
  };

  try {
    await fs.mkdir(OUTPUT_ROOT, { recursive: true });
    const entries = await fs.readdir(OUTPUT_ROOT, { withFileTypes: true });
    const now = Date.now();

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      // Apaga MP4s e qualquer chunk órfão (.chunk-*.mp4 ou .concat.txt)
      const isRender =
        entry.name.endsWith(".mp4") ||
        entry.name.endsWith(".concat.txt") ||
        /\.chunk-\d+\.mp4$/.test(entry.name);
      if (!isRender) continue;
      result.scanned++;
      const filepath = join(OUTPUT_ROOT, entry.name);
      try {
        const stat = await fs.stat(filepath);
        const ageMs = now - stat.mtimeMs;
        if (ageMs >= maxAgeMs) {
          result.freedBytes += stat.size;
          await fs.unlink(filepath);
          result.deletedCount++;
          console.log(
            `[cleanup] apagado ${entry.name} (${(stat.size / 1024 / 1024).toFixed(1)}MB, ${(ageMs / 3600000).toFixed(1)}h velho)`,
          );
        }
      } catch (err) {
        result.errors.push(`${entry.name}: ${(err as Error).message}`);
      }
    }
    console.log(
      `[cleanup] varreu ${result.scanned}, apagou ${result.deletedCount}, liberou ${(result.freedBytes / 1024 / 1024).toFixed(1)}MB`,
    );
  } catch (err) {
    result.errors.push(`readdir: ${(err as Error).message}`);
    console.error(`[cleanup] erro: ${(err as Error).message}`);
  }

  return result;
}

/**
 * Apaga TODOS os MP4s renderizados (manual, força bruta).
 */
export async function cleanAllRenders(): Promise<CleanupResult> {
  return cleanOldRenders(0);
}

/**
 * Estatísticas do diretório de outputs — útil pra mostrar no UI
 * quanto tá ocupado e quantos arquivos pendentes existem.
 */
export async function getOutputStats(): Promise<{
  fileCount: number;
  totalBytes: number;
  oldestAgeMs: number;
}> {
  let fileCount = 0;
  let totalBytes = 0;
  let oldest = 0;
  try {
    await fs.mkdir(OUTPUT_ROOT, { recursive: true });
    const entries = await fs.readdir(OUTPUT_ROOT, { withFileTypes: true });
    const now = Date.now();
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".mp4")) continue;
      fileCount++;
      try {
        const stat = await fs.stat(join(OUTPUT_ROOT, entry.name));
        totalBytes += stat.size;
        const age = now - stat.mtimeMs;
        if (age > oldest) oldest = age;
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return { fileCount, totalBytes, oldestAgeMs: oldest };
}
