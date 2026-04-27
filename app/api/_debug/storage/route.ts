import { NextResponse } from "next/server";
import { promises as fs, existsSync, accessSync, constants } from "node:fs";
import { join } from "node:path";
import { getStorageRoot } from "../../../../lib/storage";

export const runtime = "nodejs";

/**
 * Endpoint de debug — retorna o estado real de storage em runtime.
 * Útil pra diagnosticar discrepâncias entre boot e request.
 */
export async function GET() {
  const root = getStorageRoot();
  const explicit = process.env.STORAGE_DIR;

  async function probe(path: string) {
    const result: Record<string, unknown> = { path };
    try {
      result.exists = existsSync(path);
    } catch (err) {
      result.existsError = (err as Error).message;
    }
    try {
      accessSync(path, constants.W_OK);
      result.writable = true;
    } catch (err) {
      result.writable = false;
      result.writableError = (err as Error).message;
    }
    try {
      const testPath = join(path, `.runtime-test-${Date.now()}`);
      await fs.mkdir(testPath, { recursive: true });
      await fs.rmdir(testPath);
      result.subdirCreate = "ok";
    } catch (err) {
      result.subdirCreate = (err as Error).message;
    }
    return result;
  }

  const data = await probe(root);
  const dataExplicit = explicit ? await probe(explicit) : null;
  const dataTmp = await probe("/tmp/elevar-storage");

  return NextResponse.json({
    storageRoot: root,
    envStorageDir: explicit ?? null,
    probes: {
      currentRoot: data,
      ...(dataExplicit ? { envSpecified: dataExplicit } : {}),
      tmpFallback: dataTmp,
    },
    pid: process.pid,
    nodeVersion: process.version,
  });
}
