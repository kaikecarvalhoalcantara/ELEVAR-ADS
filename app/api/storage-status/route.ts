import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import { getStorageInfo, getStorageRoot, storagePath } from "../../../lib/storage";

export const runtime = "nodejs";

/**
 * V77: Endpoint de diagnóstico do storage.
 *
 * Retorna:
 * - path: onde os arquivos estão sendo salvos
 * - persistent: se os arquivos persistem em redeploy/restart
 * - reason: explicação curta
 * - subdirs: tamanho/contagem dos subdirs (client-assets, video-cache, generated, drafts)
 *
 * Mostrado no banner do editor pra deixar visível se o storage tá em /tmp
 * (volátil) e o user precisa configurar volume em /data.
 */
export async function GET() {
  const info = getStorageInfo();
  const root = getStorageRoot();

  const subdirs: Record<string, { fileCount: number; totalBytes: number }> = {};
  for (const sub of ["client-assets", "video-cache", "generated", "drafts"]) {
    try {
      const dir = storagePath(sub);
      let fileCount = 0;
      let totalBytes = 0;
      const walk = async (d: string): Promise<void> => {
        const entries = await fs.readdir(d, { withFileTypes: true }).catch(() => []);
        for (const e of entries) {
          if (e.name.startsWith(".")) continue;
          const p = `${d}/${e.name}`;
          if (e.isFile()) {
            try {
              const stat = await fs.stat(p);
              fileCount++;
              totalBytes += stat.size;
            } catch {
              // ignore
            }
          } else if (e.isDirectory()) {
            await walk(p);
          }
        }
      };
      await walk(dir);
      subdirs[sub] = { fileCount, totalBytes };
    } catch {
      subdirs[sub] = { fileCount: 0, totalBytes: 0 };
    }
  }

  return NextResponse.json({
    ok: true,
    storage: {
      path: info.path,
      persistent: info.persistent,
      reason: info.reason,
      root,
    },
    subdirs,
    env: {
      STORAGE_DIR: process.env.STORAGE_DIR ?? null,
      NODE_ENV: process.env.NODE_ENV ?? null,
      RAILWAY_PROJECT_ID: process.env.RAILWAY_PROJECT_ID ? "set" : null,
    },
  });
}
