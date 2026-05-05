import { NextResponse } from "next/server";
import { loadDraft, saveDraft } from "../../../../../lib/drafts";
import { processDraftAds } from "../../../../../lib/process-ads";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  // V76: aceita ?adNumber=X pra regenerar UM AD específico (limpa pages
  // dele pra forçar re-processamento). Sem param, retoma todos pendentes.
  const adNumberStr = url.searchParams.get("adNumber");
  const adNumber = adNumberStr ? parseInt(adNumberStr, 10) : null;

  const draft = await loadDraft(id);
  if (!draft) {
    return NextResponse.json({ ok: false, error: "Draft não encontrado" }, { status: 404 });
  }
  if (adNumber !== null && !isNaN(adNumber)) {
    // Regenerar UM AD: limpa pages e ressuscita processing
    const ad = draft.ads.find((a) => a.number === adNumber);
    if (!ad) {
      return NextResponse.json(
        { ok: false, error: `AD ${adNumber} não encontrado` },
        { status: 404 },
      );
    }
    ad.pages = []; // limpa pra forçar re-processamento
    if (!draft.processing) {
      return NextResponse.json(
        { ok: false, error: "Draft sem processing state — não dá pra regenerar" },
        { status: 400 },
      );
    }
    draft.processing.status = "pending";
    draft.processing.message = `Re-gerando AD ${adNumber}…`;
    await saveDraft(draft);
  } else {
    if (!draft.processing || draft.processing.status === "complete") {
      return NextResponse.json({ ok: true, alreadyComplete: true });
    }
  }
  // Dispara o worker. Idempotente — só processa ads com pages vazias.
  void processDraftAds(id).catch((err) => {
    console.error(`[retry processDraftAds ${id}]`, err);
  });
  return NextResponse.json({ ok: true, retriggered: true });
}
