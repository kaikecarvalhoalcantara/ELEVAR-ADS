import { NextResponse } from "next/server";
import { isInLibrary, saveExternalToLibrary } from "../../../lib/client-assets";
import { getStorageRoot } from "../../../lib/storage";

export const runtime = "nodejs";

/**
 * V86: Salva na biblioteca permanente um arquivo que JÁ EXISTE em
 * outro lugar do storage (tipicamente /data/video-cache/* do Pexels).
 *
 * Body: { sourcePath: string, filename?: string }
 *
 * Restringe a sourcePath dentro do STORAGE_ROOT — bloqueia acesso a
 * arquivos arbitrários do filesystem.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const sourcePath = String(body.sourcePath ?? "");
    const filename = body.filename ? String(body.filename) : undefined;
    if (!sourcePath) {
      return NextResponse.json(
        { ok: false, error: "sourcePath ausente" },
        { status: 400 },
      );
    }
    const root = getStorageRoot();
    // Sanity check: o path tem que estar DENTRO do storage root pra
    // bloquear traversal pra ler arquivos do sistema.
    const normSrc = sourcePath.replace(/\\/g, "/");
    const normRoot = root.replace(/\\/g, "/");
    if (!normSrc.startsWith(normRoot)) {
      return NextResponse.json(
        { ok: false, error: "sourcePath fora do storage root permitido" },
        { status: 400 },
      );
    }
    const asset = await saveExternalToLibrary({ sourcePath, filename });
    return NextResponse.json({ ok: true, asset });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}

/**
 * GET ?path=<filepath> — retorna { inLibrary: boolean }. Usado pelo UI
 * pra decidir se mostra o botão "Salvar na biblioteca" ou o indicador
 * "✓ na biblioteca".
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const path = url.searchParams.get("path");
  if (!path) {
    return NextResponse.json(
      { ok: false, error: "path ausente" },
      { status: 400 },
    );
  }
  const inLibrary = await isInLibrary(path);
  return NextResponse.json({ ok: true, inLibrary });
}
