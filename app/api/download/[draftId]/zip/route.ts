import { promises as fs, createReadStream } from "node:fs";
import { Readable } from "node:stream";
import archiver from "archiver";
import { loadDraft } from "../../../../../lib/drafts";
import { buildProjectName, mp4PathForAd } from "../../../../../lib/render";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Empacota TODOS os MP4s renderizados do draft num único ZIP.
 * Stream — não carrega tudo em memória.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const { draftId } = await params;
  const draft = await loadDraft(draftId);
  if (!draft) return new Response("Draft não encontrado", { status: 404 });

  const projectName = buildProjectName({
    cliente: draft.cliente,
    nicho: draft.nicho,
    nome: draft.nome,
    date: new Date(draft.createdAt),
  });

  // Lista os MP4s que existem
  const existing: { number: number; path: string; name: string }[] = [];
  for (const ad of draft.ads) {
    const path = mp4PathForAd(projectName, ad.number);
    try {
      await fs.access(path);
      existing.push({
        number: ad.number,
        path,
        name: `AD ${String(ad.number).padStart(2, "0")}.mp4`,
      });
    } catch {
      // skip — não renderizado ainda
    }
  }

  if (existing.length === 0) {
    return new Response(
      "Nenhum MP4 renderizado ainda. Renderize antes de baixar o ZIP.",
      { status: 404 },
    );
  }

  const archive = archiver("zip", { zlib: { level: 6 } });
  for (const item of existing) {
    archive.append(createReadStream(item.path), { name: item.name });
  }
  archive.finalize();

  const zipFilename = `${projectName}.zip`.replace(/"/g, "");
  const webStream = Readable.toWeb(archive as unknown as Readable) as ReadableStream;

  return new Response(webStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipFilename}"`,
    },
  });
}
