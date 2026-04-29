import { NextResponse } from "next/server";
import { deleteDraft, loadDraft, saveDraft } from "../../../../lib/drafts";
import { localPathToHttpUrl } from "../../../../lib/http-utils";
import type { ProjectDraft } from "../../../../lib/types";

function enrichDraft(draft: ProjectDraft) {
  return {
    ...draft,
    ads: draft.ads.map((ad) => ({
      ...ad,
      pages: ad.pages.map((p) => ({
        ...p,
        videoUrl: localPathToHttpUrl(p.videoSrc),
      })),
    })),
  };
}

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const draft = await loadDraft(id);
    if (!draft) {
      return NextResponse.json({ ok: false, error: "Draft não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, draft: enrichDraft(draft) });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}

/**
 * V28: DELETE — apaga o draft (Postgres + arquivo). Usado pela aba
 * "Projetos salvos" da home pra remover projetos antigos.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await deleteDraft(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let patch: Partial<ProjectDraft>;
  try {
    patch = (await request.json()) as Partial<ProjectDraft>;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }
  try {
    const cur = await loadDraft(id);
    if (!cur) {
      return NextResponse.json({ ok: false, error: "Draft não encontrado" }, { status: 404 });
    }
    const updated: ProjectDraft = {
      ...cur,
      ...patch,
      id: cur.id,
      createdAt: cur.createdAt,
    };
    await saveDraft(updated);
    return NextResponse.json({ ok: true, draft: enrichDraft(updated) });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
