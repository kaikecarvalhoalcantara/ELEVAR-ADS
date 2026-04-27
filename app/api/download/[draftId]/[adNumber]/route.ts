import { promises as fs } from "node:fs";
import { loadDraft } from "../../../../../lib/drafts";
import { buildProjectName, mp4PathForAd } from "../../../../../lib/render";

export const runtime = "nodejs";

/**
 * Baixa o MP4 já renderizado de um anúncio específico do draft.
 * Content-Disposition: attachment força o navegador a fazer download
 * (igual quando você baixa do Canva).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ draftId: string; adNumber: string }> },
) {
  const { draftId, adNumber } = await params;
  const draft = await loadDraft(draftId);
  if (!draft) return new Response("Draft não encontrado", { status: 404 });

  const projectName = buildProjectName({
    cliente: draft.cliente,
    nicho: draft.nicho,
    nome: draft.nome,
    date: new Date(draft.createdAt),
  });
  const adNum = parseInt(adNumber, 10);
  if (isNaN(adNum)) return new Response("AD inválido", { status: 400 });
  const filename = `${projectName} - AD ${String(adNum).padStart(2, "0")}.mp4`;
  const filepath = mp4PathForAd(projectName, adNum);

  try {
    const buffer = await fs.readFile(filepath);
    return new Response(buffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch {
    return new Response(
      "MP4 ainda não foi renderizado — clica em 'Baixar este AD' no editor primeiro",
      { status: 404 },
    );
  }
}
