import { NextResponse } from "next/server";
import { loadDraft, saveDraft } from "../../../../../lib/drafts";
import { renderAdsInBackground } from "../../../../../lib/render-worker";

// Captura uncaughtException global pra evitar container crash quando
// Remotion gera erros assíncronos.
if (typeof process !== "undefined" && !((globalThis as Record<string, unknown>).__renderHandlersInstalled)) {
  process.on("uncaughtException", (err) => {
    console.error("[uncaughtException no render]", err);
  });
  process.on("unhandledRejection", (err) => {
    console.error("[unhandledRejection no render]", err);
  });
  (globalThis as Record<string, unknown>).__renderHandlersInstalled = true;
}

export const runtime = "nodejs";
export const maxDuration = 60; // só pra disparar worker

interface Body {
  adNumbers?: number[]; // omit = todos
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    // empty body OK
  }
  const draft = await loadDraft(id);
  if (!draft) {
    return NextResponse.json(
      { ok: false, error: "Draft não encontrado" },
      { status: 404 },
    );
  }

  const wantedNumbers =
    body.adNumbers && body.adNumbers.length > 0
      ? body.adNumbers
      : draft.ads.filter((a) => a.pages.length > 0).map((a) => a.number);

  if (wantedNumbers.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Nenhum AD com páginas pra renderizar" },
      { status: 400 },
    );
  }

  // Reset estado de rendering pra esses ads (limpa erros antigos)
  if (!draft.rendering) {
    draft.rendering = {
      status: "in_progress",
      queueAdNumbers: wantedNumbers,
      completedAdNumbers: [],
      failedAdNumbers: [],
    };
  } else {
    draft.rendering.status = "in_progress";
    draft.rendering.queueAdNumbers = wantedNumbers;
    draft.rendering.failedAdNumbers = draft.rendering.failedAdNumbers.filter(
      (f) => !wantedNumbers.includes(f.number),
    );
  }
  await saveDraft(draft);

  // Spawn worker em background — não awaita
  void renderAdsInBackground(id, wantedNumbers).catch((err) => {
    console.error(`[render-worker ${id}] uncaught:`, err);
  });

  return NextResponse.json({
    ok: true,
    message: `Renderização disparada pra ${wantedNumbers.length} anúncio${wantedNumbers.length === 1 ? "" : "s"}. Acompanhe o progresso.`,
    queueAdNumbers: wantedNumbers,
  });
}
