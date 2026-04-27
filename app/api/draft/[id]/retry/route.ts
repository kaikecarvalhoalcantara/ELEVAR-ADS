import { NextResponse } from "next/server";
import { loadDraft } from "../../../../../lib/drafts";
import { processDraftAds } from "../../../../../lib/process-ads";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const draft = await loadDraft(id);
  if (!draft) {
    return NextResponse.json({ ok: false, error: "Draft não encontrado" }, { status: 404 });
  }
  if (!draft.processing || draft.processing.status === "complete") {
    return NextResponse.json({ ok: true, alreadyComplete: true });
  }
  // Re-dispara o worker em background. Idempotente — só processa ads vazios.
  void processDraftAds(id).catch((err) => {
    console.error(`[retry processDraftAds ${id}]`, err);
  });
  return NextResponse.json({ ok: true, retriggered: true });
}
