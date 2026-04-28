"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Player, type PlayerRef } from "@remotion/player";
import { AdComposition, type AdProps } from "../../../remotion/AdComposition";
import {
  buildTextShadow,
  computeFitFontSize,
  normalizePageText,
} from "../../../lib/text-utils";
import { COLOR_FILTER_LABELS, colorFilterCss } from "../../../lib/color-filters";
import { ICON_LIST, iconSvgString } from "../../../lib/icons";
import {
  createElement,
  elementStyle,
  elementSupportsText,
  elementTextStyle,
} from "../../../lib/elements";
import type {
  AdDraft,
  Align,
  AnimationKind,
  ColorFilter,
  ElementShape,
  EntryAnimation,
  IconName,
  PageDraft,
  PageElement,
  ProcessingState,
  ProjectDraft,
  ProjectStyle,
  RenderProgress,
  TextSegment,
} from "../../../lib/types";

const ANIMATIONS: AnimationKind[] = ["teclado", "subir", "deslocar", "mesclar", "bloco"];
const FRAMES_PER_BEAT = 48;
const FPS = 24;

interface EnrichedPage extends PageDraft {
  videoUrl: string;
}
interface EnrichedAd extends Omit<AdDraft, "pages"> {
  pages: EnrichedPage[];
}
interface EnrichedDraft extends Omit<ProjectDraft, "ads"> {
  ads: EnrichedAd[];
}

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = (params?.id as string) ?? "";

  const [draft, setDraft] = useState<EnrichedDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedAd, setSelectedAd] = useState(0);
  const [selectedPage, setSelectedPage] = useState(0);
  const [savingTimer, setSavingTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [renderStatus, setRenderStatus] = useState<string | null>(null);
  const [showAnimPreview, setShowAnimPreview] = useState(false);
  // V8: multi-select via Set
  const [selectedElementIds, setSelectedElementIds] = useState<Set<string>>(new Set());
  const selectedElementId = selectedElementIds.size === 1
    ? Array.from(selectedElementIds)[0]!
    : null;
  function setSelectedElementId(id: string | null) {
    setSelectedElementIds(id ? new Set([id]) : new Set());
  }
  function toggleElementSelection(id: string, multi: boolean) {
    setSelectedElementIds((prev) => {
      const next = new Set(prev);
      if (multi) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else {
        next.clear();
        next.add(id);
      }
      return next;
    });
  }
  const [elementClipboard, setElementClipboard] = useState<PageElement | null>(null);

  // Undo/redo (V7): stacks de snapshots + estado de disponibilidade pra UI
  const undoStack = useRef<EnrichedDraft[]>([]);
  const redoStack = useRef<EnrichedDraft[]>([]);
  const lastSnapshotTime = useRef(0);
  const [historyVersion, setHistoryVersion] = useState(0); // pra forçar re-render dos botões
  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;

  // limpa seleção ao trocar de página/anúncio
  useEffect(() => {
    setSelectedElementId(null);
  }, [selectedAd, selectedPage]);

  // Ctrl/Cmd+C copia elemento selecionado, Ctrl/Cmd+V cola na página atual
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // ignora se o foco está num input/textarea (deixa o navegador copiar texto)
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || (e.target as HTMLElement | null)?.isContentEditable) {
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (!draft) return;
      const ad = draft.ads[selectedAd];
      if (!ad) return;
      if ((e.key === "z" || e.key === "Z") && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (
        (e.key === "z" || e.key === "Z") && e.shiftKey
      ) {
        e.preventDefault();
        redo();
      } else if (e.key === "y" || e.key === "Y") {
        e.preventDefault();
        redo();
      } else if (e.key === "c" || e.key === "C") {
        const el = ad.pages[selectedPage]?.elements?.find(
          (x) => x.id === selectedElementId,
        );
        if (el) {
          e.preventDefault();
          setElementClipboard(el);
        }
      } else if (e.key === "v" || e.key === "V") {
        if (!elementClipboard) return;
        e.preventDefault();
        const newId = Math.random().toString(36).slice(2, 10);
        const pasted: PageElement = {
          ...elementClipboard,
          id: newId,
          x: Math.min(0.95, elementClipboard.x + 0.03),
          y: Math.min(0.95, elementClipboard.y + 0.03),
        };
        const cur = ad.pages[selectedPage];
        if (!cur) return;
        updatePage(selectedAd, selectedPage, {
          elements: [...(cur.elements ?? []), pasted],
        });
        setSelectedElementId(newId);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedElementIds.size === 0) return;
        e.preventDefault();
        const cur = ad.pages[selectedPage];
        if (!cur) return;
        updatePage(selectedAd, selectedPage, {
          elements: (cur.elements ?? []).filter((el) => !selectedElementIds.has(el.id)),
        });
        setSelectedElementIds(new Set());
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, selectedAd, selectedPage, selectedElementId, elementClipboard]);

  // load fonts
  useEffect(() => {
    if (!draft) return;
    const fonts = [draft.fontHook, draft.fontTransition].map((f) => f.replace(/\s+/g, "+"));
    const url = `https://fonts.googleapis.com/css2?${fonts
      .map((f) => `family=${f}:wght@400;700;900`)
      .join("&")}&display=swap`;
    const linkId = "google-fonts-link";
    let link = document.getElementById(linkId) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = url;
  }, [draft?.fontHook, draft?.fontTransition]);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/draft/${id}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Erro");
      setDraft(data.draft as EnrichedDraft);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    if (id) reload();
  }, [id, reload]);

  // Enquanto draft.processing != complete, fica polling a cada 3s
  useEffect(() => {
    if (!draft) return;
    const status = draft.processing?.status;
    if (!status || status === "complete") return;
    const t = setInterval(() => {
      reload();
    }, 3000);
    return () => clearInterval(t);
  }, [draft?.processing?.status, draft?.processing?.currentAdIndex, reload]);

  // Enquanto draft.rendering.status === "in_progress", polling a cada 3s
  // pra atualizar fila/completos/erros e fazer aparecer botão verde de cada AD
  useEffect(() => {
    if (!draft) return;
    const status = draft.rendering?.status;
    if (status !== "in_progress") return;
    const t = setInterval(() => {
      reload();
    }, 3000);
    return () => clearInterval(t);
  }, [
    draft?.rendering?.status,
    draft?.rendering?.currentAdNumber,
    draft?.rendering?.completedAdNumbers?.length,
    draft?.rendering?.failedAdNumbers?.length,
    reload,
  ]);

  // Sincroniza renderStatus textual com o estado do draft.rendering
  useEffect(() => {
    if (!draft?.rendering) return;
    const r = draft.rendering;
    if (r.status === "in_progress") {
      const cur = r.currentAdNumber;
      const done = r.completedAdNumbers.length;
      const total = r.queueAdNumbers.length;
      setRenderStatus(
        cur != null
          ? `Renderizando AD ${String(cur).padStart(2, "0")}… (${done}/${total} prontos)`
          : `Iniciando renderização… (${done}/${total} prontos)`,
      );
    } else if (r.status === "complete") {
      const done = r.completedAdNumbers.length;
      const total = r.queueAdNumbers.length;
      const fails = r.failedAdNumbers;
      if (fails.length === 0) {
        setRenderStatus(`✓ Renderizado ${done}/${total}. Clique abaixo pra baixar.`);
      } else {
        const errors = fails
          .map((f) => `AD ${String(f.number).padStart(2, "0")}: ${f.error}`)
          .join(" | ");
        setRenderStatus(
          `Renderizado ${done}/${total}. ❌ ERROS: ${errors}`,
        );
      }
    }
  }, [
    draft?.rendering?.status,
    draft?.rendering?.currentAdNumber,
    draft?.rendering?.completedAdNumbers?.length,
    draft?.rendering?.failedAdNumbers?.length,
    draft?.rendering?.queueAdNumbers?.length,
  ]);

  function scheduleSave(next: EnrichedDraft, fromHistory = false) {
    if (!fromHistory && draft) {
      // Snapshot no undo stack — debounced 500ms pra slider não criar 100 entries
      const now = Date.now();
      if (now - lastSnapshotTime.current > 500) {
        undoStack.current.push(JSON.parse(JSON.stringify(draft)));
        if (undoStack.current.length > 50) undoStack.current.shift();
        redoStack.current = []; // edição nova invalida o redo
        lastSnapshotTime.current = now;
        setHistoryVersion((v) => v + 1);
      }
    }
    setDraft(next);
    setSaveStatus("saving");
    if (savingTimer) clearTimeout(savingTimer);
    const t = setTimeout(async () => {
      try {
        const adsForSave = next.ads.map((ad) => ({
          ...ad,
          pages: ad.pages.map(({ videoUrl: _omit, ...rest }) => rest),
        }));
        const projectFields: Partial<ProjectStyle> = {
          baseColor: next.baseColor,
          accentColor: next.accentColor,
          baseFontSize: next.baseFontSize,
          baseLetterSpacing: next.baseLetterSpacing,
          baseLineHeight: next.baseLineHeight,
          baseShadowBlur: next.baseShadowBlur,
          baseShadowOpacity: next.baseShadowOpacity,
          baseOverlayOpacity: next.baseOverlayOpacity,
          baseAlign: next.baseAlign,
        };
        const res = await fetch(`/api/draft/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ads: adsForSave, ...projectFields }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 1200);
      } catch (e) {
        setError((e as Error).message);
        setSaveStatus("idle");
      }
    }, 600);
    setSavingTimer(t);
  }

  function undo() {
    if (undoStack.current.length === 0 || !draft) return;
    const prev = undoStack.current.pop()!;
    redoStack.current.push(JSON.parse(JSON.stringify(draft)));
    setHistoryVersion((v) => v + 1);
    scheduleSave(prev, true);
  }

  function redo() {
    if (redoStack.current.length === 0 || !draft) return;
    const next = redoStack.current.pop()!;
    undoStack.current.push(JSON.parse(JSON.stringify(draft)));
    setHistoryVersion((v) => v + 1);
    scheduleSave(next, true);
  }

  function updatePage(adIdx: number, pageIdx: number, patch: Partial<EnrichedPage>) {
    if (!draft) return;
    const next: EnrichedDraft = {
      ...draft,
      ads: draft.ads.map((ad, i) =>
        i !== adIdx
          ? ad
          : { ...ad, pages: ad.pages.map((p, j) => (j !== pageIdx ? p : { ...p, ...patch })) },
      ),
    };
    scheduleSave(next);
  }

  function updateProject(patch: Partial<ProjectStyle>) {
    if (!draft) return;
    scheduleSave({ ...draft, ...patch });
  }

  function bulkApplyFromCurrent(scope: "this-ad" | "all-ads") {
    if (!draft) return;
    const ad = draft.ads[selectedAd];
    const src = ad?.pages[selectedPage];
    if (!ad || !src) return;
    const fields: Partial<PageDraft> = {
      fontSize: src.fontSize,
      color: src.color,
      letterSpacing: src.letterSpacing,
      lineHeight: src.lineHeight,
      textShadowBlur: src.textShadowBlur,
      textShadowOpacity: src.textShadowOpacity,
      overlayOpacity: src.overlayOpacity,
      align: src.align,
    };
    const next: EnrichedDraft = {
      ...draft,
      ads: draft.ads.map((a, i) => {
        if (scope === "this-ad" && i !== selectedAd) return a;
        return { ...a, pages: a.pages.map((p) => ({ ...p, ...fields })) };
      }),
    };
    scheduleSave(next);
  }

  async function cleanupRenders(all: boolean) {
    const label = all ? "TODOS os vídeos renderizados" : "vídeos com mais de 24h";
    if (!confirm(`Apagar ${label}? Você perde a possibilidade de re-baixar.`)) return;
    setRenderStatus("Limpando renders…");
    try {
      const res = await fetch(`/api/cleanup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Falha");
      setRenderStatus(
        `🧹 Limpo: ${data.deletedCount} arquivos, liberou ${data.freedMB}MB.`,
      );
    } catch (e) {
      setRenderStatus(`Falha no cleanup: ${(e as Error).message}`);
    }
  }

  async function renderAds(adNumbers: number[] | null) {
    // Bloqueia se já tem render rodando
    if (draft?.rendering?.status === "in_progress") {
      setRenderStatus("Já tem renderização rodando, aguarde…");
      return;
    }
    setRenderStatus("Disparando renderização…");
    try {
      const res = await fetch(`/api/draft/${id}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adNumbers }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      // Worker tá rodando em background — o polling do useEffect
      // atualiza draft.rendering e os botões verdes aparecem sozinhos
      const queue = (data.queueAdNumbers as number[] | undefined) ?? [];
      setRenderStatus(
        `Renderização iniciada pra ${queue.length} anúncio${queue.length === 1 ? "" : "s"}. Aguarde…`,
      );
      // Força reload imediato pra polling pegar o estado novo rápido
      reload();
    } catch (e) {
      setRenderStatus(`Falha: ${(e as Error).message}`);
    }
  }

  if (error) {
    return (
      <main className="p-8">
        <div className="text-red-400">Erro: {error}</div>
        <button onClick={() => router.push("/")} className="mt-3 underline text-purple-400">
          voltar
        </button>
      </main>
    );
  }
  if (!draft) {
    return <main className="p-8 text-neutral-400">Carregando rascunho…</main>;
  }
  // Tela de progresso enquanto processing != complete
  if (draft.processing && draft.processing.status !== "complete") {
    return <ProcessingScreen draft={draft} draftId={id} onRefresh={reload} />;
  }
  const ad = draft.ads[selectedAd];
  if (!ad) return <main className="p-8 text-neutral-400">Anúncio inválido</main>;
  const page = ad.pages[selectedPage] ?? null;

  return (
    <main className="h-screen flex flex-col bg-neutral-950 text-neutral-100 overflow-hidden">
      <header className="px-4 py-2.5 border-b border-neutral-800 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="text-xs text-neutral-400 hover:text-neutral-200">
            ← voltar
          </button>
          <h1 className="text-sm font-semibold truncate max-w-md">
            {draft.cliente} — {draft.nicho} — {draft.nome}
          </h1>
          <div className="flex items-center gap-1">
            <button
              key={`undo-${historyVersion}`}
              onClick={undo}
              disabled={!canUndo}
              title="Desfazer (Ctrl+Z)"
              className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-sm disabled:opacity-30"
            >
              ↶
            </button>
            <button
              key={`redo-${historyVersion}`}
              onClick={redo}
              disabled={!canRedo}
              title="Refazer (Ctrl+Shift+Z)"
              className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-sm disabled:opacity-30"
            >
              ↷
            </button>
          </div>
          <span className="text-xs text-neutral-500">
            {saveStatus === "saving" ? "salvando…" : saveStatus === "saved" ? "✓ salvo" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedAd}
            onChange={(e) => {
              setSelectedAd(Number(e.target.value));
              setSelectedPage(0);
            }}
            className="rounded bg-neutral-900 border border-neutral-700 px-2 py-1 text-sm"
          >
            {draft.ads.map((a, i) => (
              <option key={a.number} value={i}>
                AD {String(a.number).padStart(2, "0")} — {a.padrao} ({a.pages.length}p)
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowAnimPreview(true)}
            className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-sm border border-neutral-600"
            title="Pré-visualizar com animação rodando"
          >
            ▶ Animação
          </button>
          <button
            onClick={() => renderAds([ad.number])}
            disabled={draft.rendering?.status === "in_progress"}
            className="px-3 py-1 rounded bg-purple-600 hover:bg-purple-500 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Baixar este AD
          </button>
          <button
            onClick={() => renderAds(null)}
            disabled={draft.rendering?.status === "in_progress"}
            className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-sm border border-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Baixar todos ({draft.ads.length})
          </button>
          <button
            onClick={() => cleanupRenders(true)}
            disabled={draft.rendering?.status === "in_progress"}
            className="px-2 py-1 rounded bg-neutral-900 hover:bg-red-900 text-sm border border-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Apaga TODOS os MP4s renderizados pra liberar disco. Volume Railway é 500MB."
          >
            🗑️
          </button>
        </div>
      </header>

      <RenderStatusBar draft={draft} draftId={id} renderStatus={renderStatus} />


      <div className="flex flex-1 min-h-0">
        {/* CENTER: editable canvas */}
        <section className="flex-1 flex items-center justify-center p-4 bg-neutral-950 overflow-hidden">
          {page ? (
            <EditableCanvas
              key={`${selectedAd}-${selectedPage}`}
              page={page}
              draft={draft}
              onUpdate={(patch) => updatePage(selectedAd, selectedPage, patch)}
              selectedElementIds={selectedElementIds}
              onSelectElement={(id, multi) => {
                if (id === null) setSelectedElementIds(new Set());
                else toggleElementSelection(id, multi);
              }}
            />
          ) : (
            <div className="text-sm text-neutral-500">selecione uma página</div>
          )}
        </section>

        {/* RIGHT: control panel */}
        <aside className="w-80 border-l border-neutral-800 overflow-y-auto bg-neutral-950">
          {page ? (
            <ControlPanel
              page={page}
              draft={draft}
              onUpdatePage={(patch) => updatePage(selectedAd, selectedPage, patch)}
              onUpdateProject={updateProject}
              onBulkApply={bulkApplyFromCurrent}
              format={draft.format}
              selectedElementId={selectedElementId}
              selectedElementIds={selectedElementIds}
              onSelectElement={setSelectedElementId}
              onApplyElementToAllPages={(el) => {
                if (!draft) return;
                const next: EnrichedDraft = {
                  ...draft,
                  ads: draft.ads.map((a, i) =>
                    i !== selectedAd
                      ? a
                      : {
                          ...a,
                          pages: a.pages.map((p, j) => {
                            if (j === selectedPage) return p;
                            const existing = p.elements ?? [];
                            // se já tem elemento com esse id, atualiza; senão, adiciona
                            const filtered = existing.filter((e) => e.id !== el.id);
                            return { ...p, elements: [...filtered, el] };
                          }),
                        },
                  ),
                };
                scheduleSave(next);
              }}
            />
          ) : null}
        </aside>
      </div>

      {/* BOTTOM: page strip (Canva-like) */}
      <PageStrip
        pages={ad.pages}
        selectedIndex={selectedPage}
        onSelect={setSelectedPage}
        onSwap={(targetIdx, path, url) => updatePage(selectedAd, targetIdx, { videoSrc: path, videoUrl: url })}
      />

      {/* MODAL: animated preview */}
      {showAnimPreview && (
        <AnimationPreview
          ad={ad}
          draft={draft}
          startPage={selectedPage}
          onClose={() => setShowAnimPreview(false)}
        />
      )}
    </main>
  );
}

/* ---------------- Editable Canvas (vídeo + texto editável + drag-handle) ---------------- */

function EditableCanvas({
  page,
  draft,
  onUpdate,
  selectedElementIds,
  onSelectElement,
}: {
  page: EnrichedPage;
  draft: EnrichedDraft;
  onUpdate: (patch: Partial<EnrichedPage>) => void;
  selectedElementIds: Set<string>;
  onSelectElement: (id: string | null, multi: boolean) => void;
}) {
  const dims = dimsFor(draft.format);
  const previewW = dims.width >= dims.height ? 600 : 420;
  const scale = previewW / dims.width;

  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState(false);
  const [draftText, setDraftText] = useState(page.text);
  const dragRef = useRef<{ startY: number; startSize: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeGuides, setActiveGuides] = useState<AlignGuide[]>([]);
  const multiDragStartRef = useRef<Map<string, { x: number; y: number }> | null>(null);
  const [videoSelected, setVideoSelected] = useState(false);

  // Click no canvas vazio: deseleciona tudo
  function clearSelection() {
    setSelected(false);
    setEditing(false);
    onSelectElement(null, false);
    setVideoSelected(false);
  }

  useEffect(() => {
    setDraftText(page.text);
    setEditing(false);
  }, [page.text]);

  function commitText() {
    setEditing(false);
    // Substitui \n por " / " e aplica normalizePageText (auto-split de linhas longas)
    const fromTextarea = draftText.replace(/\r\n?/g, "\n").replace(/\n+/g, " / ");
    const cleaned = normalizePageText(fromTextarea);
    if (cleaned !== page.text) onUpdate({ text: cleaned });
  }

  function startResize(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const fs = page.fontSize && page.fontSize > 0 ? page.fontSize : 90;
    dragRef.current = { startY: e.clientY, startSize: fs };
    window.addEventListener("mousemove", onResize);
    window.addEventListener("mouseup", endResize);
  }

  function onResize(e: MouseEvent) {
    if (!dragRef.current) return;
    const dy = dragRef.current.startY - e.clientY; // arrasta pra cima = aumenta
    const next = Math.max(40, Math.min(280, Math.round(dragRef.current.startSize + dy * 1.2)));
    onUpdate({ fontSize: next });
  }
  function endResize() {
    dragRef.current = null;
    window.removeEventListener("mousemove", onResize);
    window.removeEventListener("mouseup", endResize);
  }

  // resolve display style (per-page > project default)
  const style = useMemo(() => ({
    color: page.color ?? draft.baseColor,
    align: page.align ?? draft.baseAlign,
    letterSpacing: page.letterSpacing ?? draft.baseLetterSpacing,
    lineHeight: page.lineHeight ?? draft.baseLineHeight,
    shadowBlur: page.textShadowBlur ?? draft.baseShadowBlur,
    shadowOpacity: page.textShadowOpacity ?? draft.baseShadowOpacity,
    overlayOpacity: page.overlayOpacity ?? draft.baseOverlayOpacity,
  }), [page, draft]);

  const isHook = page.weight === "hook" || page.weight === "punch";
  const fontFamily = isHook ? draft.fontHook : draft.fontTransition;
  const fontWeight = isHook ? 900 : 400;
  const textTransform = isHook ? "uppercase" : "none";

  // Mesmas regras do BeatScene (renderizador final): normaliza + auto-split + computeFit
  const normalizedText = useMemo(() => normalizePageText(page.text), [page.text]);
  const lines = normalizedText.split(" / ").map((s) => s.trim()).filter(Boolean);
  const fontSize =
    page.fontSize && page.fontSize > 0
      ? page.fontSize
      : computeFitFontSize(lines, isHook, dims.width);
  const filterCss = colorFilterCss(draft.colorFilter);
  const textShadowValue = buildTextShadow({
    shadowBlur: style.shadowBlur,
    shadowOpacity: style.shadowOpacity,
    scale,
  });
  const iconAboveSvg = iconSvgString(page.iconAbove);
  const iconBelowSvg = iconSvgString(page.iconBelow);
  const shadowOffsetY = Math.max(2, Math.round(style.shadowBlur / 6));

  return (
    <div
      ref={containerRef}
      className="relative shadow-2xl"
      style={{
        width: previewW,
        height: previewW * (dims.height / dims.width),
        background: "#000",
      }}
      onClick={clearSelection}
    >
      {/* Background — preto sólido atrás (caso o vídeo não cubra todo canvas) */}
      <div className="absolute inset-0 bg-black" />
      {/* Vídeo de fundo posicionável (V9) */}
      {page.videoUrl && (
        <VideoLayer
          src={page.videoUrl}
          filterCss={filterCss}
          zoom={page.videoZoom ?? 1}
          flipH={page.videoFlipH ?? false}
          flipV={page.videoFlipV ?? false}
          trimStart={page.videoTrimStart ?? 0}
          x={page.videoX ?? 0}
          y={page.videoY ?? 0}
          w={page.videoW ?? 1}
          h={page.videoH ?? 1}
          selected={videoSelected}
          containerRef={containerRef}
          onSelect={() => {
            setVideoSelected(true);
            onSelectElement(null, false);
          }}
          onChange={(patch) => onUpdate(patch)}
        />
      )}
      {/* Overlay darkening */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, rgba(0,0,0,${style.overlayOpacity * 0.6}) 0%, rgba(0,0,0,${style.overlayOpacity}) 100%)`,
        }}
      />

      {/* Elements layer (entre overlay e texto) */}
      {(page.elements ?? []).map((el) => (
        <ElementOnCanvas
          key={el.id}
          element={el}
          selected={selectedElementIds.has(el.id)}
          allSelectedIds={selectedElementIds}
          allElements={page.elements ?? []}
          containerRef={containerRef}
          scale={scale}
          otherElements={(page.elements ?? []).filter((e) => e.id !== el.id)}
          onSelect={(multi) => onSelectElement(el.id, multi)}
          onChange={(patch) =>
            onUpdate({
              elements: (page.elements ?? []).map((e) =>
                e.id === el.id ? { ...e, ...patch } : e,
              ),
            })
          }
          onMultiMove={(dx, dy) => {
            // Aplica delta a TODOS os selecionados
            onUpdate({
              elements: (page.elements ?? []).map((e) => {
                if (!selectedElementIds.has(e.id)) return e;
                const start = multiDragStartRef.current?.get(e.id);
                if (!start) return e;
                return {
                  ...e,
                  x: clamp(start.x + dx, -0.5, 1),
                  y: clamp(start.y + dy, -0.5, 1),
                };
              }),
            });
          }}
          onMultiDragStart={(startMap) => {
            multiDragStartRef.current = startMap;
          }}
          onGuides={setActiveGuides}
        />
      ))}

      {/* Alignment guides (linhas roxas durante drag) */}
      {activeGuides.map((g, i) => (
        <div
          key={i}
          className="absolute pointer-events-none"
          style={
            g.axis === "v"
              ? {
                  left: `${g.pos * 100}%`,
                  top: 0,
                  bottom: 0,
                  width: 1,
                  background: "#a855f7",
                  boxShadow: "0 0 4px rgba(168,85,247,0.8)",
                  zIndex: 25,
                }
              : {
                  top: `${g.pos * 100}%`,
                  left: 0,
                  right: 0,
                  height: 1,
                  background: "#a855f7",
                  boxShadow: "0 0 4px rgba(168,85,247,0.8)",
                  zIndex: 25,
                }
          }
        />
      ))}

      {/* Editable text overlay (escondido se hideText) */}
      {!page.hideText && (
        <div
          className="absolute inset-0 flex"
          style={{
            alignItems: "center",
            justifyContent: style.align === "center" ? "center" : style.align === "left" ? "flex-start" : "flex-end",
          }}
        >
        <div
          onClick={(e) => {
            e.stopPropagation();
            setSelected(true);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setSelected(true);
            setEditing(true);
          }}
          className={`relative cursor-text px-[6%] ${selected ? "outline outline-2 outline-purple-500/70 outline-offset-4" : ""}`}
          style={{ width: "100%" }}
        >
          {editing ? (
            <textarea
              autoFocus
              value={draftText.replace(/ \/ /g, "\n")}
              onChange={(e) => setDraftText(e.target.value.split("\n").slice(0, 2).join("\n"))}
              onBlur={commitText}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setDraftText(page.text);
                  setEditing(false);
                }
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) commitText();
              }}
              rows={2}
              className="w-full bg-transparent border-none outline-none resize-none text-center"
              style={{
                fontFamily: `"${fontFamily}", system-ui, sans-serif`,
                fontWeight,
                color: style.color,
                textAlign: style.align,
                textTransform,
                lineHeight: style.lineHeight,
                letterSpacing: `${style.letterSpacing}em`,
                fontSize: fontSize * scale,
                textShadow: textShadowValue,
                padding: 0,
              }}
            />
          ) : (
            <div
              style={{
                fontFamily: `"${fontFamily}", system-ui, sans-serif`,
                fontWeight,
                color: style.color,
                textAlign: style.align,
                textTransform,
                lineHeight: style.lineHeight,
                letterSpacing: `${style.letterSpacing}em`,
                fontSize: fontSize * scale,
                textShadow: textShadowValue,
              }}
            >
              {iconAboveSvg && (
                <div
                  className="mx-auto mb-2"
                  style={{
                    width: fontSize * scale * 0.6,
                    height: fontSize * scale * 0.6,
                    color: page.iconColor ?? style.color,
                  }}
                  dangerouslySetInnerHTML={{ __html: iconAboveSvg }}
                />
              )}
              {lines.map((l, i) => (
                <div key={i} style={{ whiteSpace: "nowrap" }}>
                  {page.segments?.[i] && page.segments[i]!.length > 0 ? (
                    page.segments[i]!.map((seg, j) => (
                      <span
                        key={j}
                        style={{ color: seg.color ?? style.color }}
                      >
                        {seg.text}
                      </span>
                    ))
                  ) : (
                    l
                  )}
                </div>
              ))}
              {iconBelowSvg && (
                <div
                  className="mx-auto mt-2"
                  style={{
                    width: fontSize * scale * 0.6,
                    height: fontSize * scale * 0.6,
                    color: page.iconColor ?? style.color,
                  }}
                  dangerouslySetInnerHTML={{ __html: iconBelowSvg }}
                />
              )}
            </div>
          )}

          {selected && !editing && (
            <>
              {/* Drag handle bottom-right (pinça) */}
              <div
                onMouseDown={startResize}
                className="absolute -right-3 -bottom-3 w-6 h-6 rounded-full bg-purple-600 border-2 border-white cursor-ns-resize flex items-center justify-center text-[10px] font-bold"
                title="Arraste pra cima/baixo pra resize a fonte"
              >
                ↕
              </div>
              <div className="absolute -top-7 left-0 text-[10px] text-purple-300">
                clique 2x pra editar · arraste a bolinha pra mudar tamanho
              </div>
            </>
          )}
        </div>
        </div>
      )}

      {page.hideText && (
        <div className="absolute top-2 left-2 text-[10px] text-white/70 bg-black/50 px-1.5 py-0.5 rounded">
          texto oculto (vídeo fala por si)
        </div>
      )}

      {/* Frame indicator */}
      <div className="absolute bottom-2 left-2 text-[10px] text-white/60 bg-black/40 px-1.5 py-0.5 rounded">
        {page.weight} · {page.animation} · {Math.round(fontSize)}px
      </div>
    </div>
  );
}

/* ---------------- Processing screen (V11) ---------------- */

function ProcessingScreen({
  draft,
  draftId,
  onRefresh,
}: {
  draft: { processing?: ProcessingState; cliente: string; nicho: string; nome: string };
  draftId: string;
  onRefresh: () => void;
}) {
  const p = draft.processing!;
  const pct = p.totalAds > 0 ? Math.round((p.currentAdIndex / p.totalAds) * 100) : 0;
  const isError = p.status === "error";
  const isPending = p.status === "pending" || p.status === "in_progress";

  async function retry() {
    try {
      await fetch(`/api/draft/${draftId}/retry`, { method: "POST" });
      setTimeout(onRefresh, 1000);
    } catch {
      // ignore
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 bg-neutral-950 border border-neutral-800 rounded-lg p-6">
        <div>
          <div className="text-xs uppercase text-neutral-500">Gerando draft</div>
          <h1 className="text-lg font-semibold mt-1 truncate">
            {draft.cliente} — {draft.nicho} — {draft.nome}
          </h1>
        </div>

        <div className="space-y-2">
          <div className="text-sm text-neutral-300">
            {p.message || "Processando…"}
          </div>
          <div className="w-full h-2 bg-neutral-800 rounded overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                isError ? "bg-red-500" : "bg-purple-500"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="text-xs text-neutral-500 flex justify-between">
            <span>
              {p.currentAdIndex} / {p.totalAds} anúncios
            </span>
            <span>{pct}%</span>
          </div>
        </div>

        {p.errors && p.errors.length > 0 && (
          <div className="text-xs text-amber-400 bg-amber-950/30 border border-amber-900 rounded p-2 max-h-32 overflow-y-auto">
            <div className="font-semibold mb-1">{p.errors.length} avisos:</div>
            <ul className="space-y-0.5">
              {p.errors.slice(-5).map((e, i) => (
                <li key={i} className="break-all">• {e}</li>
              ))}
            </ul>
          </div>
        )}

        {isPending && (
          <p className="text-xs text-neutral-500">
            Pode fechar a aba e voltar depois — o processamento continua no
            servidor. Atualiza sozinho a cada 3s.
          </p>
        )}

        {isError && (
          <button
            onClick={retry}
            className="w-full px-4 py-2 rounded bg-purple-600 hover:bg-purple-500 font-semibold"
          >
            Tentar de novo
          </button>
        )}

        {!isPending && !isError && (
          <button
            onClick={retry}
            className="w-full px-4 py-2 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-sm"
          >
            Re-disparar processamento
          </button>
        )}
      </div>
    </main>
  );
}

/* ---------------- Render status bar (botões verdes progressivos) ---------------- */

function RenderStatusBar({
  draft,
  draftId,
  renderStatus,
}: {
  draft: { rendering?: RenderProgress };
  draftId: string;
  renderStatus: string | null;
}) {
  const r = draft.rendering;
  // Mostra a barra se: (a) tem renderStatus textual (acabou de disparar)
  // OU (b) tem rendering state com algo relevante
  const hasState =
    r &&
    (r.status === "in_progress" ||
      r.status === "complete" ||
      r.completedAdNumbers.length > 0 ||
      r.failedAdNumbers.length > 0);
  if (!renderStatus && !hasState) return null;

  const completed = r?.completedAdNumbers ?? [];
  const failed = r?.failedAdNumbers ?? [];
  const inProgress = r?.status === "in_progress";
  const currentAd = r?.currentAdNumber;
  const queue = r?.queueAdNumbers ?? [];

  return (
    <div className="px-4 py-1.5 text-xs text-neutral-300 bg-neutral-900 border-b border-neutral-800 flex items-center gap-3 flex-wrap">
      {inProgress && (
        <span className="inline-block w-3 h-3 rounded-full bg-purple-500 animate-pulse" />
      )}
      <span>{renderStatus}</span>

      {/* Fila visual: pendente / atual / completo / erro */}
      {queue.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {queue.map((n) => {
            const isDone = completed.includes(n);
            const isFail = failed.find((f) => f.number === n);
            const isCurrent = currentAd === n;
            const label = `AD ${String(n).padStart(2, "0")}`;
            if (isDone) {
              return (
                <a
                  key={n}
                  href={`/api/download/${draftId}/${n}`}
                  download
                  className="px-2 py-0.5 rounded bg-green-700 hover:bg-green-600 text-white text-[11px] font-semibold"
                  title="Baixar"
                >
                  ⬇ {label}
                </a>
              );
            }
            if (isFail) {
              return (
                <span
                  key={n}
                  className="px-2 py-0.5 rounded bg-red-900 text-red-200 text-[11px] font-semibold"
                  title={isFail.error}
                >
                  ✗ {label}
                </span>
              );
            }
            if (isCurrent) {
              return (
                <span
                  key={n}
                  className="px-2 py-0.5 rounded bg-purple-700 text-white text-[11px] font-semibold animate-pulse"
                >
                  ▶ {label}
                </span>
              );
            }
            return (
              <span
                key={n}
                className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-500 text-[11px]"
              >
                {label}
              </span>
            );
          })}
        </div>
      )}

      {/* ZIP — só quando tem 2+ ads completos */}
      {completed.length >= 2 && (
        <a
          href={`/api/download/${draftId}/zip`}
          download
          className="px-2 py-0.5 rounded bg-purple-700 hover:bg-purple-600 text-white text-[11px] font-semibold ml-auto"
        >
          ⬇ Todos prontos (ZIP) — {completed.length}
        </a>
      )}
    </div>
  );
}

/* ---------------- Element on canvas (drag/resize handles) ---------------- */

interface AlignGuide {
  axis: "v" | "h"; // vertical line (across height) ou horizontal line (across width)
  pos: number;     // 0-1 (fração do canvas)
}

function ElementOnCanvas({
  element,
  selected,
  allSelectedIds,
  allElements,
  containerRef,
  scale,
  otherElements,
  onSelect,
  onChange,
  onMultiMove,
  onMultiDragStart,
  onGuides,
}: {
  element: PageElement;
  selected: boolean;
  allSelectedIds: Set<string>;
  allElements: PageElement[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  scale: number;
  otherElements: PageElement[];
  onSelect: (multi: boolean) => void;
  onChange: (patch: Partial<PageElement>) => void;
  onMultiMove: (dx: number, dy: number) => void;
  onMultiDragStart: (startMap: Map<string, { x: number; y: number }>) => void;
  onGuides: (g: AlignGuide[]) => void;
}) {
  type DragMode = "move" | "nw" | "ne" | "sw" | "se";
  const dragRef = useRef<{
    mode: DragMode;
    startMouseX: number;
    startMouseY: number;
    startEl: { x: number; y: number; w: number; h: number };
  } | null>(null);

  function startDrag(mode: DragMode, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    // Se Shift+click: toggle seleção, sem iniciar drag
    if (mode === "move" && e.shiftKey) {
      onSelect(true);
      return;
    }
    // Se elemento NÃO está selecionado, single-select primeiro
    if (!selected) {
      onSelect(false);
    }
    dragRef.current = {
      mode,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startEl: { x: element.x, y: element.y, w: element.w, h: element.h },
    };
    // Pra multi-drag: captura posição inicial de TODOS os selecionados
    if (mode === "move" && allSelectedIds.size > 1) {
      const startMap = new Map<string, { x: number; y: number }>();
      for (const el of allElements) {
        if (allSelectedIds.has(el.id)) {
          startMap.set(el.id, { x: el.x, y: el.y });
        }
      }
      onMultiDragStart(startMap);
    }
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", endDrag);
  }

  function onDragMove(e: MouseEvent) {
    if (!dragRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = (e.clientX - dragRef.current.startMouseX) / rect.width;
    const dy = (e.clientY - dragRef.current.startMouseY) / rect.height;
    const start = dragRef.current.startEl;
    const mode = dragRef.current.mode;
    // Multi-drag: quando 2+ selecionados em modo move, delega pra parent
    // (sem snap pra simplificar — snap é só single-drag)
    if (mode === "move" && allSelectedIds.size > 1) {
      onMultiMove(dx, dy);
      onGuides([]);
      return;
    }
    let next: { x: number; y: number; w: number; h: number };
    if (mode === "move") {
      let nx = clamp(start.x + dx, -0.5, 1);
      let ny = clamp(start.y + dy, -0.5, 1);
      // Snap + alignment guides
      const snapped = snapToAlign(nx, ny, start.w, start.h, otherElements);
      nx = snapped.x;
      ny = snapped.y;
      onGuides(snapped.guides);
      next = { x: nx, y: ny, w: start.w, h: start.h };
    } else {
      // resize a partir de um canto, mantendo o canto oposto fixo
      let x = start.x;
      let y = start.y;
      let w = start.w;
      let h = start.h;
      if (mode === "se") {
        w = Math.max(0.02, start.w + dx);
        h = Math.max(0.02, start.h + dy);
      } else if (mode === "ne") {
        w = Math.max(0.02, start.w + dx);
        h = Math.max(0.02, start.h - dy);
        y = start.y + (start.h - h);
      } else if (mode === "sw") {
        w = Math.max(0.02, start.w - dx);
        h = Math.max(0.02, start.h + dy);
        x = start.x + (start.w - w);
      } else if (mode === "nw") {
        w = Math.max(0.02, start.w - dx);
        h = Math.max(0.02, start.h - dy);
        x = start.x + (start.w - w);
        y = start.y + (start.h - h);
      }
      next = { x, y, w, h };
    }
    onChange(next);
  }

  function endDrag() {
    dragRef.current = null;
    onGuides([]); // limpa guides ao soltar
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", endDrag);
  }

  return (
    <>
      <div
        onMouseDown={(e) => startDrag("move", e)}
        style={{
          ...elementStyle(element, scale),
          pointerEvents: "auto",
          cursor: "move",
          outline: selected ? "2px solid #a855f7" : undefined,
          outlineOffset: 1,
        }}
      >
        {element.shape === "icon" && element.iconName && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              color: element.color,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            dangerouslySetInnerHTML={{
              __html: iconSvgString(element.iconName) ?? "",
            }}
          />
        )}
        {element.text && elementSupportsText(element.shape) && (
          <div style={elementTextStyle(element, scale)}>{element.text}</div>
        )}
      </div>
      {selected && (
        <>
          <ResizeHandle dir="nw" onMouseDown={(e) => startDrag("nw", e)} element={element} />
          <ResizeHandle dir="ne" onMouseDown={(e) => startDrag("ne", e)} element={element} />
          <ResizeHandle dir="sw" onMouseDown={(e) => startDrag("sw", e)} element={element} />
          <ResizeHandle dir="se" onMouseDown={(e) => startDrag("se", e)} element={element} />
        </>
      )}
    </>
  );
}

function ResizeHandle({
  dir,
  onMouseDown,
  element,
}: {
  dir: "nw" | "ne" | "sw" | "se";
  onMouseDown: (e: React.MouseEvent) => void;
  element: PageElement;
}) {
  const left = dir.endsWith("e") ? element.x + element.w : element.x;
  const top = dir.startsWith("s") ? element.y + element.h : element.y;
  const cursorMap = { nw: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", se: "nwse-resize" };
  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        position: "absolute",
        left: `${left * 100}%`,
        top: `${top * 100}%`,
        width: 12,
        height: 12,
        marginLeft: -6,
        marginTop: -6,
        background: "#a855f7",
        border: "2px solid white",
        borderRadius: 2,
        cursor: cursorMap[dir],
        zIndex: 30,
      }}
    />
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

const SNAP_THRESHOLD = 0.012; // 1.2% — fração do canvas

/**
 * Calcula snap pra alinhamento. Retorna posição ajustada + lista de guides
 * que devem ser desenhadas no canvas enquanto o elemento tá nessa posição.
 */
function snapToAlign(
  x: number,
  y: number,
  w: number,
  h: number,
  others: PageElement[],
): { x: number; y: number; guides: AlignGuide[] } {
  const guides: AlignGuide[] = [];
  // candidatos verticais (pra X): canvas left, canvas center, canvas right,
  // + outros elementos: left, center, right
  const vCandidates: { snap: number; type: "left" | "center" | "right" }[] = [
    { snap: 0, type: "left" },
    { snap: 0.5, type: "center" },
    { snap: 1, type: "right" },
  ];
  for (const o of others) {
    vCandidates.push({ snap: o.x, type: "left" });
    vCandidates.push({ snap: o.x + o.w / 2, type: "center" });
    vCandidates.push({ snap: o.x + o.w, type: "right" });
  }
  // O elemento sendo arrastado tem 3 referências: left=x, center=x+w/2, right=x+w
  const myLeft = x;
  const myCenter = x + w / 2;
  const myRight = x + w;
  let bestX = x;
  let bestXDelta = SNAP_THRESHOLD;
  let bestXGuide: number | null = null;
  for (const c of vCandidates) {
    for (const refType of ["left", "center", "right"] as const) {
      const myRef = refType === "left" ? myLeft : refType === "center" ? myCenter : myRight;
      const delta = Math.abs(myRef - c.snap);
      if (delta < bestXDelta) {
        bestXDelta = delta;
        bestX = c.snap - (myRef - x);
        bestXGuide = c.snap;
      }
    }
  }
  if (bestXGuide !== null) {
    guides.push({ axis: "v", pos: bestXGuide });
  }

  const hCandidates: { snap: number }[] = [
    { snap: 0 },
    { snap: 0.5 },
    { snap: 1 },
  ];
  for (const o of others) {
    hCandidates.push({ snap: o.y });
    hCandidates.push({ snap: o.y + o.h / 2 });
    hCandidates.push({ snap: o.y + o.h });
  }
  const myTop = y;
  const myMid = y + h / 2;
  const myBot = y + h;
  let bestY = y;
  let bestYDelta = SNAP_THRESHOLD;
  let bestYGuide: number | null = null;
  for (const c of hCandidates) {
    for (const refType of ["top", "mid", "bot"] as const) {
      const myRef = refType === "top" ? myTop : refType === "mid" ? myMid : myBot;
      const delta = Math.abs(myRef - c.snap);
      if (delta < bestYDelta) {
        bestYDelta = delta;
        bestY = c.snap - (myRef - y);
        bestYGuide = c.snap;
      }
    }
  }
  if (bestYGuide !== null) {
    guides.push({ axis: "h", pos: bestYGuide });
  }

  return { x: bestX, y: bestY, guides };
}

/* ---------------- Video layer com posicionamento + drag/resize (V9) ---------------- */

function VideoLayer({
  src,
  filterCss,
  zoom,
  flipH,
  flipV,
  trimStart,
  x,
  y,
  w,
  h,
  selected,
  containerRef,
  onSelect,
  onChange,
}: {
  src: string;
  filterCss: string;
  zoom: number;
  flipH: boolean;
  flipV: boolean;
  trimStart: number;
  x: number;
  y: number;
  w: number;
  h: number;
  selected: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onSelect: () => void;
  onChange: (patch: { videoX?: number; videoY?: number; videoW?: number; videoH?: number }) => void;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  type DragMode = "move" | "nw" | "ne" | "sw" | "se";
  const dragRef = useRef<{
    mode: DragMode;
    startMouseX: number;
    startMouseY: number;
    start: { x: number; y: number; w: number; h: number };
  } | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (trimStart > 0 && ref.current.currentTime < trimStart) {
      ref.current.currentTime = trimStart;
    }
  }, [trimStart, src]);

  function startDrag(mode: DragMode, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    dragRef.current = {
      mode,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      start: { x, y, w, h },
    };
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", endDrag);
  }
  function onDragMove(e: MouseEvent) {
    if (!dragRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = (e.clientX - dragRef.current.startMouseX) / rect.width;
    const dy = (e.clientY - dragRef.current.startMouseY) / rect.height;
    const start = dragRef.current.start;
    const mode = dragRef.current.mode;
    if (mode === "move") {
      onChange({
        videoX: clamp(start.x + dx, -0.8, 1),
        videoY: clamp(start.y + dy, -0.8, 1),
      });
    } else {
      let nx = start.x;
      let ny = start.y;
      let nw = start.w;
      let nh = start.h;
      if (mode === "se") {
        nw = Math.max(0.05, start.w + dx);
        nh = Math.max(0.05, start.h + dy);
      } else if (mode === "ne") {
        nw = Math.max(0.05, start.w + dx);
        nh = Math.max(0.05, start.h - dy);
        ny = start.y + (start.h - nh);
      } else if (mode === "sw") {
        nw = Math.max(0.05, start.w - dx);
        nh = Math.max(0.05, start.h + dy);
        nx = start.x + (start.w - nw);
      } else if (mode === "nw") {
        nw = Math.max(0.05, start.w - dx);
        nh = Math.max(0.05, start.h - dy);
        nx = start.x + (start.w - nw);
        ny = start.y + (start.h - nh);
      }
      onChange({ videoX: nx, videoY: ny, videoW: nw, videoH: nh });
    }
  }
  function endDrag() {
    dragRef.current = null;
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", endDrag);
  }

  const flipX = flipH ? -1 : 1;
  const flipY = flipV ? -1 : 1;
  const scale = Math.max(1, zoom);
  const transform = `scale(${scale * flipX}, ${scale * flipY})`;
  return (
    <>
      <div
        onMouseDown={(e) => startDrag("move", e)}
        style={{
          position: "absolute",
          left: `${x * 100}%`,
          top: `${y * 100}%`,
          width: `${w * 100}%`,
          height: `${h * 100}%`,
          overflow: "hidden",
          cursor: "move",
          outline: selected ? "2px solid #a855f7" : undefined,
          outlineOffset: 1,
        }}
      >
        <video
          ref={ref}
          src={src}
          muted
          loop
          autoPlay
          playsInline
          className="w-full h-full object-cover"
          style={{
            filter: filterCss || undefined,
            transform: transform !== "scale(1, 1)" ? transform : undefined,
            pointerEvents: "none",
          }}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (trimStart > 0 && v.currentTime < trimStart) {
              v.currentTime = trimStart;
            }
          }}
        />
      </div>
      {selected && (
        <>
          {(["nw", "ne", "sw", "se"] as const).map((dir) => {
            const left = dir.endsWith("e") ? x + w : x;
            const top = dir.startsWith("s") ? y + h : y;
            const cursorMap = {
              nw: "nwse-resize",
              ne: "nesw-resize",
              sw: "nesw-resize",
              se: "nwse-resize",
            };
            return (
              <div
                key={dir}
                onMouseDown={(e) => startDrag(dir, e)}
                style={{
                  position: "absolute",
                  left: `${left * 100}%`,
                  top: `${top * 100}%`,
                  width: 12,
                  height: 12,
                  marginLeft: -6,
                  marginTop: -6,
                  background: "#a855f7",
                  border: "2px solid white",
                  borderRadius: 2,
                  cursor: cursorMap[dir],
                  zIndex: 30,
                }}
              />
            );
          })}
          <div className="absolute -top-7 left-2 text-[10px] text-purple-300 pointer-events-none">
            vídeo selecionado · arrasta pra mover · cantos pra resize
          </div>
        </>
      )}
    </>
  );
}

/* ---------------- Page strip (Canva-like bottom thumbs) ---------------- */

function PageStrip({
  pages,
  selectedIndex,
  onSelect,
  onSwap,
}: {
  pages: EnrichedPage[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  onSwap: (i: number, path: string, url: string) => void;
}) {
  return (
    <div className="border-t border-neutral-800 bg-neutral-950 px-3 py-2 overflow-x-auto">
      <div className="flex gap-2 items-center">
        {pages.map((p, i) => (
          <button
            key={i}
            onClick={() => onSelect(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const data = e.dataTransfer.getData("application/x-video");
              if (!data) return;
              const parsed = JSON.parse(data) as { path: string; videoUrl: string };
              onSwap(i, parsed.path, parsed.videoUrl);
            }}
            className={`flex-shrink-0 w-20 h-32 rounded relative overflow-hidden border ${
              i === selectedIndex
                ? "border-purple-500"
                : "border-neutral-700 hover:border-neutral-500"
            }`}
            title={p.text}
          >
            {p.videoUrl ? (
              <video
                src={p.videoUrl}
                muted
                preload="metadata"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-neutral-900" />
            )}
            <div className="absolute inset-0 bg-black/40" />
            <div className="absolute inset-x-0 bottom-0 text-[8px] text-white text-center px-1 py-0.5 leading-tight bg-black/60 line-clamp-2">
              {p.text.replace(" / ", " ")}
            </div>
            <div className="absolute top-1 left-1 text-[9px] text-white/80 bg-black/60 rounded px-1">
              {String(i + 1).padStart(2, "0")}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Animation preview modal ---------------- */

function AnimationPreview({
  ad,
  draft,
  startPage,
  onClose,
}: {
  ad: EnrichedAd;
  draft: EnrichedDraft;
  startPage: number;
  onClose: () => void;
}) {
  const playerRef = useRef<PlayerRef | null>(null);
  const dims = dimsFor(draft.format);
  const inputProps: AdProps = {
    beats: ad.pages.map((p) => ({
      text: p.text,
      weight: p.weight,
      fontSize: p.fontSize,
      color: p.color,
      letterSpacing: p.letterSpacing,
      lineHeight: p.lineHeight,
      textShadowBlur: p.textShadowBlur,
      textShadowOpacity: p.textShadowOpacity,
      overlayOpacity: p.overlayOpacity,
      align: p.align,
      hideText: p.hideText,
    })),
    videos: ad.pages.map((p) => p.videoUrl),
    animations: ad.pages.map((p) => p.animation),
    format: draft.format,
    fontHook: draft.fontHook,
    fontTransition: draft.fontTransition,
    projectStyle: extractProjectStyle(draft),
  };
  useEffect(() => {
    const t = setTimeout(() => playerRef.current?.seekTo(startPage * FRAMES_PER_BEAT), 200);
    return () => clearTimeout(t);
  }, [startPage]);
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-sm text-neutral-300 hover:text-white"
        >
          fechar (Esc)
        </button>
        <Player
          ref={playerRef}
          component={AdComposition as never}
          inputProps={inputProps as never}
          durationInFrames={Math.max(1, ad.pages.length) * FRAMES_PER_BEAT}
          compositionWidth={dims.width}
          compositionHeight={dims.height}
          fps={FPS}
          controls
          autoPlay
          style={{
            width: 360,
            aspectRatio: `${dims.width} / ${dims.height}`,
            background: "#000",
          }}
        />
      </div>
    </div>
  );
}

function extractProjectStyle(d: EnrichedDraft): ProjectStyle {
  return {
    toneFilter: d.toneFilter,
    vibe: d.vibe,
    baseColor: d.baseColor,
    accentColor: d.accentColor,
    baseFontSize: d.baseFontSize,
    baseLetterSpacing: d.baseLetterSpacing,
    baseLineHeight: d.baseLineHeight,
    baseShadowBlur: d.baseShadowBlur,
    baseShadowOpacity: d.baseShadowOpacity,
    baseOverlayOpacity: d.baseOverlayOpacity,
    baseAlign: d.baseAlign,
    colorFilter: d.colorFilter ?? "neutro",
    template: d.template,
  };
}

/* ---------------- Right panel ---------------- */

function ControlPanel({
  page,
  draft,
  onUpdatePage,
  onUpdateProject,
  onBulkApply,
  format,
  selectedElementId,
  selectedElementIds,
  onSelectElement,
  onApplyElementToAllPages,
}: {
  page: EnrichedPage;
  draft: EnrichedDraft;
  onUpdatePage: (patch: Partial<EnrichedPage>) => void;
  onUpdateProject: (patch: Partial<ProjectStyle>) => void;
  onBulkApply: (scope: "this-ad" | "all-ads") => void;
  format: ProjectDraft["format"];
  selectedElementId: string | null;
  selectedElementIds: Set<string>;
  onSelectElement: (id: string | null) => void;
  onApplyElementToAllPages: (el: PageElement) => void;
}) {
  const selectedElement = (page.elements ?? []).find((e) => e.id === selectedElementId) ?? null;
  const selectedElements = (page.elements ?? []).filter((e) => selectedElementIds.has(e.id));
  const multiSelected = selectedElements.length >= 2;
  function alignSelected(mode: "left" | "centerH" | "right" | "top" | "centerV" | "bottom") {
    if (!multiSelected) return;
    const xs = selectedElements.map((e) => e.x);
    const xs2 = selectedElements.map((e) => e.x + e.w);
    const ys = selectedElements.map((e) => e.y);
    const ys2 = selectedElements.map((e) => e.y + e.h);
    let updater: (e: PageElement) => Partial<PageElement>;
    switch (mode) {
      case "left":
        updater = () => ({ x: Math.min(...xs) });
        break;
      case "centerH": {
        const cx = (Math.min(...xs) + Math.max(...xs2)) / 2;
        updater = (e) => ({ x: cx - e.w / 2 });
        break;
      }
      case "right":
        updater = (e) => ({ x: Math.max(...xs2) - e.w });
        break;
      case "top":
        updater = () => ({ y: Math.min(...ys) });
        break;
      case "centerV": {
        const cy = (Math.min(...ys) + Math.max(...ys2)) / 2;
        updater = (e) => ({ y: cy - e.h / 2 });
        break;
      }
      case "bottom":
        updater = (e) => ({ y: Math.max(...ys2) - e.h });
        break;
    }
    onUpdatePage({
      elements: (page.elements ?? []).map((e) =>
        selectedElementIds.has(e.id) ? { ...e, ...updater(e) } : e,
      ),
    });
  }
  function addElement(shape: ElementShape) {
    const el = createElement(shape);
    onUpdatePage({ elements: [...(page.elements ?? []), el] });
    onSelectElement(el.id);
  }
  function updateElement(patch: Partial<PageElement>) {
    if (!selectedElement) return;
    onUpdatePage({
      elements: (page.elements ?? []).map((e) =>
        e.id === selectedElement.id ? { ...e, ...patch } : e,
      ),
    });
  }
  function removeElement() {
    if (!selectedElement) return;
    onUpdatePage({
      elements: (page.elements ?? []).filter((e) => e.id !== selectedElement.id),
    });
    onSelectElement(null);
  }
  function moveZ(dir: "front" | "back" | "up" | "down") {
    if (!selectedElement) return;
    const list = [...(page.elements ?? [])];
    const idx = list.findIndex((e) => e.id === selectedElement.id);
    if (idx < 0) return;
    const [removed] = list.splice(idx, 1);
    if (dir === "front") list.push(removed!);
    else if (dir === "back") list.unshift(removed!);
    else if (dir === "up") list.splice(Math.min(list.length, idx + 1), 0, removed!);
    else if (dir === "down") list.splice(Math.max(0, idx - 1), 0, removed!);
    onUpdatePage({ elements: list });
  }
  return (
    <div className="p-4 space-y-5">
      <Group label="Página">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={page.hideText ?? false}
            onChange={(e) => onUpdatePage({ hideText: e.target.checked })}
            className="rounded"
          />
          <span>
            Ocultar texto (vídeo fala por si só)
          </span>
        </label>
      </Group>

      <Group label="Estilo do texto">
        <Row>
          <Select
            label="Peso"
            value={page.weight}
            onChange={(v) => onUpdatePage({ weight: v as PageDraft["weight"] })}
            options={["hook", "transition", "punch"]}
          />
          <Select
            label="Animação"
            value={page.animation}
            onChange={(v) => onUpdatePage({ animation: v as AnimationKind })}
            options={ANIMATIONS}
          />
        </Row>
        <Row>
          <ColorField
            label="Cor do texto"
            value={page.color ?? draft.baseColor}
            onChange={(v) => onUpdatePage({ color: v })}
          />
          <Select
            label="Alinhamento"
            value={page.align ?? draft.baseAlign}
            onChange={(v) => onUpdatePage({ align: v as Align })}
            options={["left", "center", "right"]}
          />
        </Row>
        <Range
          label="Tamanho da fonte"
          value={page.fontSize ?? 0}
          min={0}
          max={280}
          step={2}
          format={(v) => (v === 0 ? "auto" : `${v}px`)}
          onChange={(v) => onUpdatePage({ fontSize: v })}
        />
        <Range
          label="Espaçamento entre letras"
          value={page.letterSpacing ?? draft.baseLetterSpacing}
          min={-0.05}
          max={0.15}
          step={0.005}
          format={(v) => `${v.toFixed(3)} em`}
          onChange={(v) => onUpdatePage({ letterSpacing: v })}
        />
        <Range
          label="Altura da linha"
          value={page.lineHeight ?? draft.baseLineHeight}
          min={0.85}
          max={1.6}
          step={0.05}
          format={(v) => `${v.toFixed(2)}×`}
          onChange={(v) => onUpdatePage({ lineHeight: v })}
        />
      </Group>

      <Group label="Sombra & Overlay">
        <Range
          label="Blur da sombra"
          value={page.textShadowBlur ?? draft.baseShadowBlur}
          min={0}
          max={50}
          step={1}
          format={(v) => `${v}px`}
          onChange={(v) => onUpdatePage({ textShadowBlur: v })}
        />
        <Range
          label="Opacidade da sombra"
          value={page.textShadowOpacity ?? draft.baseShadowOpacity}
          min={0}
          max={1}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => onUpdatePage({ textShadowOpacity: v })}
        />
        <Range
          label="Overlay sobre vídeo"
          value={page.overlayOpacity ?? draft.baseOverlayOpacity}
          min={0}
          max={1}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => onUpdatePage({ overlayOpacity: v })}
        />
      </Group>

      <Group label="Elementos (shapes)">
        <div className="flex gap-1.5 flex-wrap">
          {(
            [
              "rectangle",
              "circle",
              "line",
              "diamond",
              "triangle",
              "star",
              "hexagon",
              "arrow",
              "octagon",
              "heart",
              "plus",
              "icon",
            ] as ElementShape[]
          ).map((s) => (
            <button
              key={s}
              onClick={() => addElement(s)}
              className="text-xs px-2 py-1 rounded border border-neutral-700 hover:border-purple-500 bg-neutral-900"
            >
              + {s}
            </button>
          ))}
        </div>
        {multiSelected && (
          <div className="mt-2 space-y-1.5 border-t border-neutral-800 pt-2">
            <div className="text-[10px] uppercase text-neutral-500">
              Alinhar {selectedElements.length} selecionados
            </div>
            <div className="grid grid-cols-3 gap-1">
              <button
                onClick={() => alignSelected("left")}
                className="text-[10px] px-1.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-600"
                title="Alinhar bordas esquerdas"
              >
                ⊨ esq
              </button>
              <button
                onClick={() => alignSelected("centerH")}
                className="text-[10px] px-1.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-600"
                title="Centralizar horizontalmente"
              >
                ↔ centro
              </button>
              <button
                onClick={() => alignSelected("right")}
                className="text-[10px] px-1.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-600"
                title="Alinhar bordas direitas"
              >
                dir ⊨
              </button>
              <button
                onClick={() => alignSelected("top")}
                className="text-[10px] px-1.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-600"
                title="Alinhar topos"
              >
                ⊤ topo
              </button>
              <button
                onClick={() => alignSelected("centerV")}
                className="text-[10px] px-1.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-600"
                title="Centralizar verticalmente"
              >
                ↕ meio
              </button>
              <button
                onClick={() => alignSelected("bottom")}
                className="text-[10px] px-1.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-600"
                title="Alinhar bases"
              >
                ⊥ base
              </button>
            </div>
            <p className="text-[10px] text-neutral-500">
              Shift+click pra adicionar/remover elementos da seleção. Arrasta
              qualquer um pra mover todos juntos.
            </p>
          </div>
        )}
        {(page.elements ?? []).length > 0 && (
          <ul className="mt-2 space-y-1">
            {(page.elements ?? []).map((el) => (
              <li
                key={el.id}
                onClick={(e) => {
                  if (e.shiftKey) {
                    // Toggle in multi-select via list
                    if (selectedElementIds.has(el.id)) {
                      const next = new Set(selectedElementIds);
                      next.delete(el.id);
                      // Hack: chama onSelectElement com null se ficou vazio,
                      // senão precisaríamos de uma API mais rica. Pra V8
                      // mantemos simples:
                      onSelectElement(next.size === 0 ? null : Array.from(next)[0]!);
                    } else {
                      onSelectElement(el.id);
                    }
                  } else {
                    onSelectElement(el.id);
                  }
                }}
                className={`text-xs px-2 py-1 rounded cursor-pointer flex items-center gap-2 ${
                  selectedElementIds.has(el.id)
                    ? "bg-purple-900/40 border border-purple-600"
                    : "bg-neutral-900 border border-neutral-800"
                }`}
              >
                <span
                  className="w-3 h-3 rounded-sm border border-neutral-600"
                  style={{ background: el.color }}
                />
                <span className="flex-1">{el.shape}</span>
                <span className="text-neutral-500">
                  {Math.round(el.w * 100)}×{Math.round(el.h * 100)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {selectedElement && (
          <div className="mt-3 space-y-2 border-t border-neutral-800 pt-3">
            <div className="text-[10px] uppercase text-neutral-500">
              Editar elemento ({selectedElement.shape})
            </div>
            <ColorField
              label="Cor"
              value={selectedElement.color}
              onChange={(v) => updateElement({ color: v })}
            />
            <Range
              label="Opacidade"
              value={selectedElement.opacity}
              min={0}
              max={1}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => updateElement({ opacity: v })}
            />
            <Range
              label="Rotação"
              value={selectedElement.rotation}
              min={-180}
              max={180}
              step={5}
              format={(v) => `${Math.round(v)}°`}
              onChange={(v) => updateElement({ rotation: v })}
            />
            {selectedElement.shape === "rectangle" && (
              <Range
                label="Raio da borda"
                value={selectedElement.borderRadius ?? 0}
                min={0}
                max={50}
                step={1}
                format={(v) => `${v}%`}
                onChange={(v) => updateElement({ borderRadius: v })}
              />
            )}
            {selectedElement.shape === "icon" && (
              <IconPicker
                label="Ícone"
                value={selectedElement.iconName}
                onChange={(v) => updateElement({ iconName: v })}
              />
            )}

            {/* V8: Animação de entrada */}
            <div className="space-y-2 border-t border-neutral-800 pt-2">
              <div className="text-[10px] uppercase text-neutral-500">
                Animação de entrada
              </div>
              <Select
                label="Tipo"
                value={selectedElement.entry ?? "none"}
                onChange={(v) => updateElement({ entry: v as EntryAnimation })}
                options={[
                  "none",
                  "fade",
                  "slide-up",
                  "slide-down",
                  "slide-left",
                  "slide-right",
                  "scale",
                ]}
              />
              {(selectedElement.entry ?? "none") !== "none" && (
                <Row>
                  <Range
                    label="Duração"
                    value={selectedElement.entryDuration ?? 12}
                    min={4}
                    max={45}
                    step={1}
                    format={(v) => `${v}fr`}
                    onChange={(v) => updateElement({ entryDuration: v })}
                  />
                  <Range
                    label="Atraso"
                    value={selectedElement.entryDelay ?? 0}
                    min={0}
                    max={45}
                    step={1}
                    format={(v) => `${v}fr`}
                    onChange={(v) => updateElement({ entryDelay: v })}
                  />
                </Row>
              )}
              <p className="text-[10px] text-neutral-500">
                30fr = 1s. Útil pra elementos aparecerem em cascata depois do
                texto.
              </p>
            </div>

            {/* Sombra */}
            <Range
              label="Sombra (blur)"
              value={selectedElement.shadowBlur ?? 0}
              min={0}
              max={50}
              step={1}
              format={(v) => (v === 0 ? "off" : `${v}px`)}
              onChange={(v) => updateElement({ shadowBlur: v })}
            />
            {(selectedElement.shadowBlur ?? 0) > 0 && (
              <Range
                label="Sombra (opacidade)"
                value={selectedElement.shadowOpacity ?? 0.5}
                min={0}
                max={1}
                step={0.05}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => updateElement({ shadowOpacity: v })}
              />
            )}

            {/* Texto interno (rectangle e circle) */}
            {elementSupportsText(selectedElement.shape) && (
              <div className="space-y-2 border-t border-neutral-800 pt-2">
                <div className="text-[10px] uppercase text-neutral-500">
                  Texto dentro do elemento
                </div>
                <input
                  value={selectedElement.text ?? ""}
                  onChange={(e) => updateElement({ text: e.target.value })}
                  placeholder="Sem texto"
                  className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1 text-sm"
                />
                {selectedElement.text && (
                  <>
                    <Row>
                      <ColorField
                        label="Cor texto"
                        value={selectedElement.textColor ?? "#ffffff"}
                        onChange={(v) => updateElement({ textColor: v })}
                      />
                      <Range
                        label="Tamanho"
                        value={selectedElement.textSize ?? 32}
                        min={8}
                        max={120}
                        step={2}
                        format={(v) => `${v}px`}
                        onChange={(v) => updateElement({ textSize: v })}
                      />
                    </Row>
                    <Row>
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={selectedElement.textBold !== false}
                          onChange={(e) =>
                            updateElement({ textBold: e.target.checked })
                          }
                        />
                        <span>Bold</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={selectedElement.textUppercase !== false}
                          onChange={(e) =>
                            updateElement({ textUppercase: e.target.checked })
                          }
                        />
                        <span>UPPERCASE</span>
                      </label>
                    </Row>
                  </>
                )}
              </div>
            )}

            {/* Z-order */}
            <div className="space-y-1 border-t border-neutral-800 pt-2">
              <div className="text-[10px] uppercase text-neutral-500">Camadas</div>
              <div className="grid grid-cols-2 gap-1">
                <button
                  onClick={() => moveZ("front")}
                  className="text-[10px] px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-600"
                  title="Trazer pra frente"
                >
                  ⤒ pra frente
                </button>
                <button
                  onClick={() => moveZ("back")}
                  className="text-[10px] px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-600"
                  title="Enviar pra trás"
                >
                  ⤓ pra trás
                </button>
                <button
                  onClick={() => moveZ("up")}
                  className="text-[10px] px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-600"
                >
                  ↑ subir 1
                </button>
                <button
                  onClick={() => moveZ("down")}
                  className="text-[10px] px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-600"
                >
                  ↓ descer 1
                </button>
              </div>
            </div>

            <div className="flex gap-1.5 pt-1">
              <button
                onClick={() => onApplyElementToAllPages(selectedElement)}
                className="text-[10px] px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 flex-1"
              >
                Duplicar pra todas as páginas
              </button>
              <button
                onClick={removeElement}
                className="text-[10px] px-2 py-1 rounded bg-red-900/40 hover:bg-red-900/60 border border-red-800 text-red-300"
              >
                Remover
              </button>
            </div>
            <p className="text-[10px] text-neutral-500">
              Arraste no canvas pra mover. 4 cantos roxos = resize. Atalhos:
              <strong> Ctrl+C</strong> copia, <strong>Ctrl+V</strong> cola,
              <strong> Delete</strong> remove.
            </p>
          </div>
        )}
      </Group>

      <Group label="Cor por palavra">
        <WordColorEditor
          text={page.text}
          segments={page.segments}
          baseColor={page.color ?? draft.baseColor}
          accentColor={draft.accentColor}
          onChange={(segments) => onUpdatePage({ segments })}
        />
      </Group>

      <Group label="Ícones decorativos">
        <Row>
          <IconPicker
            label="Acima"
            value={page.iconAbove}
            onChange={(v) => onUpdatePage({ iconAbove: v })}
          />
          <IconPicker
            label="Abaixo"
            value={page.iconBelow}
            onChange={(v) => onUpdatePage({ iconBelow: v })}
          />
        </Row>
        <ColorField
          label="Cor dos ícones"
          value={page.iconColor ?? page.color ?? draft.baseColor}
          onChange={(v) => onUpdatePage({ iconColor: v })}
        />
      </Group>

      <Group label="Vídeo de fundo (transforms)">
        <Range
          label="Zoom no vídeo"
          value={page.videoZoom ?? 1}
          min={1}
          max={2.5}
          step={0.05}
          format={(v) => `${v.toFixed(2)}×`}
          onChange={(v) => onUpdatePage({ videoZoom: v })}
        />
        <Row>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={page.videoFlipH ?? false}
              onChange={(e) => onUpdatePage({ videoFlipH: e.target.checked })}
            />
            <span>Espelhar (H)</span>
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={page.videoFlipV ?? false}
              onChange={(e) => onUpdatePage({ videoFlipV: e.target.checked })}
            />
            <span>Inverter (V)</span>
          </label>
        </Row>
        <Range
          label="Cortar início (trim) — pula segundos"
          value={page.videoTrimStart ?? 0}
          min={0}
          max={20}
          step={0.5}
          format={(v) => `${v.toFixed(1)}s`}
          onChange={(v) => onUpdatePage({ videoTrimStart: v })}
        />
      </Group>

      <Group label="Aplicar em massa">
        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => onBulkApply("this-ad")}
            className="text-xs px-2 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-left"
          >
            Em todas as páginas DESTE AD
          </button>
          <button
            onClick={() => onBulkApply("all-ads")}
            className="text-xs px-2 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-left"
          >
            Em TODOS os anúncios do projeto
          </button>
        </div>
      </Group>

      <Group label="Vídeo de fundo">
        <CacheSwap
          query={page.query}
          currentPath={page.videoSrc}
          onPick={(path, url) => onUpdatePage({ videoSrc: path, videoUrl: url })}
        />
        <PexelsLiveSearch
          initialQuery={page.query}
          format={format}
          onPick={(path, url) => onUpdatePage({ videoSrc: path, videoUrl: url })}
        />
      </Group>

      <Group label="Estilo do projeto (afeta tudo)">
        <Row>
          <ColorField
            label="Cor base"
            value={draft.baseColor}
            onChange={(v) => onUpdateProject({ baseColor: v })}
          />
          <ColorField
            label="Destaque"
            value={draft.accentColor}
            onChange={(v) => onUpdateProject({ accentColor: v })}
          />
        </Row>
        <label className="block">
          <span className="text-xs text-neutral-400">
            Filtro de cor (LUT em todos os vídeos)
          </span>
          <select
            value={draft.colorFilter ?? "neutro"}
            onChange={(e) =>
              onUpdateProject({ colorFilter: e.target.value as ColorFilter })
            }
            className="mt-1 w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1 text-sm"
          >
            {(Object.keys(COLOR_FILTER_LABELS) as ColorFilter[]).map((cf) => (
              <option key={cf} value={cf}>
                {COLOR_FILTER_LABELS[cf]}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-neutral-500 mt-1 block">
            Aplica um efeito de cor (saturate/sepia/hue) em todos os vídeos
            do anúncio. Igual filtro de Instagram, mas pra coerência visual.
          </span>
        </label>
      </Group>
    </div>
  );
}

/* ---------------- Word-color editor (rich text segments) ---------------- */

function WordColorEditor({
  text,
  segments,
  baseColor,
  accentColor,
  onChange,
}: {
  text: string;
  segments: TextSegment[][] | undefined;
  baseColor: string;
  accentColor: string;
  onChange: (segments: TextSegment[][] | undefined) => void;
}) {
  const lines = text.split(" / ").map((s) => s.trim()).filter(Boolean);
  const wordsByLine = lines.map((l) => l.split(/\s+/).filter(Boolean));
  const [pickerOpen, setPickerOpen] = useState<{ line: number; word: number } | null>(null);

  // Helper: pega a cor atual de uma palavra (lookup nos segments)
  function getWordColor(line: number, word: number): string | undefined {
    const lineSegs = segments?.[line];
    if (!lineSegs || lineSegs.length === 0) return undefined;
    const targetWord = wordsByLine[line]![word]!;
    for (const seg of lineSegs) {
      if (seg.text.includes(targetWord) && seg.color) return seg.color;
    }
    return undefined;
  }

  function setWordColor(line: number, word: number, color: string | null) {
    // Reconstrói segments mantendo apenas a palavra alterada com nova cor
    const next = lines.map((l, lineIdx) => {
      const words = wordsByLine[lineIdx]!;
      const segs: TextSegment[] = [];
      for (let i = 0; i < words.length; i++) {
        const w = words[i]!;
        const existingColor =
          segments?.[lineIdx]?.find((s) => s.text.trim() === w)?.color;
        const isTarget = lineIdx === line && i === word;
        const finalColor = isTarget ? (color ?? undefined) : existingColor;
        segs.push({
          text: i === 0 ? w : ` ${w}`,
          color: finalColor,
        });
      }
      return segs;
    });
    // Se nenhuma cor diferente da default existe, remove segments
    const hasAny = next.some((segs) => segs.some((s) => s.color));
    onChange(hasAny ? next : undefined);
    setPickerOpen(null);
  }

  if (lines.length === 0) {
    return (
      <div className="text-xs text-neutral-500">
        Sem texto pra colorir (página oculta ou vazia).
      </div>
    );
  }

  const presets = [
    "#ffffff",
    accentColor,
    "#ff4d4d",
    "#ffd84d",
    "#4dd0ff",
    "#7cff4d",
    "#ff8c4d",
    "#000000",
  ];

  return (
    <div className="space-y-2">
      <p className="text-xs text-neutral-500">
        Clica numa palavra → escolhe cor. Clica de novo → remove.
      </p>
      {lines.map((line, lineIdx) => (
        <div key={lineIdx} className="flex flex-wrap gap-1">
          {wordsByLine[lineIdx]!.map((word, wordIdx) => {
            const wordColor = getWordColor(lineIdx, wordIdx);
            const isOpen =
              pickerOpen?.line === lineIdx && pickerOpen?.word === wordIdx;
            return (
              <div key={wordIdx} className="relative">
                <button
                  onClick={() =>
                    setPickerOpen(isOpen ? null : { line: lineIdx, word: wordIdx })
                  }
                  className="text-xs px-1.5 py-0.5 rounded border"
                  style={{
                    background: wordColor ?? "transparent",
                    color: wordColor ? "#000" : baseColor,
                    borderColor: wordColor ? wordColor : "rgb(64,64,64)",
                  }}
                >
                  {word}
                </button>
                {isOpen && (
                  <div className="absolute z-10 top-full mt-1 left-0 bg-neutral-900 border border-neutral-700 rounded p-1.5 flex flex-wrap gap-1 w-48">
                    {presets.map((c) => (
                      <button
                        key={c}
                        onClick={() => setWordColor(lineIdx, wordIdx, c)}
                        className="w-5 h-5 rounded border border-neutral-600"
                        style={{ background: c }}
                      />
                    ))}
                    <input
                      type="color"
                      onChange={(e) => setWordColor(lineIdx, wordIdx, e.target.value)}
                      className="w-5 h-5 rounded border border-neutral-600"
                    />
                    {wordColor && (
                      <button
                        onClick={() => setWordColor(lineIdx, wordIdx, null)}
                        className="text-[10px] text-neutral-300 px-1 ml-1"
                      >
                        limpar
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ---------------- Icon picker ---------------- */

function IconPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: IconName | undefined;
  onChange: (v: IconName | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="block">
      <span className="text-xs text-neutral-400">{label}</span>
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-1 w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-sm flex items-center gap-2"
        >
          {value ? (
            <span
              className="w-4 h-4"
              dangerouslySetInnerHTML={{ __html: iconSvgString(value)! }}
            />
          ) : (
            <span className="text-neutral-500">nenhum</span>
          )}
          <span className="text-xs text-neutral-500 ml-auto">{value ?? "—"}</span>
        </button>
        {open && (
          <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-neutral-900 border border-neutral-700 rounded p-2 grid grid-cols-5 gap-1.5">
            <button
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
              className="aspect-square rounded border border-neutral-700 hover:border-purple-500 flex items-center justify-center text-xs text-neutral-500"
              title="nenhum"
            >
              ×
            </button>
            {ICON_LIST.map((name) => (
              <button
                key={name}
                onClick={() => {
                  onChange(name);
                  setOpen(false);
                }}
                title={name}
                className={`aspect-square rounded border flex items-center justify-center hover:border-purple-500 ${
                  value === name ? "border-purple-500" : "border-neutral-700"
                }`}
              >
                <span
                  className="w-4 h-4 text-white"
                  dangerouslySetInnerHTML={{ __html: iconSvgString(name)! }}
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CacheSwap({
  query,
  currentPath,
  onPick,
}: {
  query: string;
  currentPath: string;
  onPick: (path: string, url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<{ path: string; filename: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    fetch(`/api/library/list?query=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((d) => setList(d.videos ?? []))
      .catch(() => setList([]));
  }, [open, query]);

  function pathToUrl(p: string): string {
    const m = /[\\/](video-cache[\\/].+)$/.exec(p);
    if (!m) return "";
    return "/api/local-video/" + m[1]!.split(/[\\/]/).map((s) => encodeURIComponent(s)).join("/");
  }

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-purple-400 hover:text-purple-300"
      >
        {open ? "fechar cache" : `cache pra "${query}"`}
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-3 gap-1">
          {list.length === 0 && (
            <div className="col-span-3 text-xs text-neutral-500">cache vazio</div>
          )}
          {list.map((v) => {
            const url = pathToUrl(v.path);
            const current = v.path === currentPath;
            return (
              <button
                key={v.path}
                draggable
                onDragStart={(e) =>
                  e.dataTransfer.setData(
                    "application/x-video",
                    JSON.stringify({ path: v.path, videoUrl: url }),
                  )
                }
                onClick={() => onPick(v.path, url)}
                className={`relative rounded overflow-hidden border ${
                  current ? "border-purple-500" : "border-neutral-800 hover:border-neutral-600"
                }`}
                title="clique pra trocar / arraste pra outra página na strip de baixo"
              >
                <video src={url} muted preload="metadata" className="w-full aspect-[9/16] object-cover bg-black" />
                {current && (
                  <span className="absolute top-1 right-1 text-[9px] bg-purple-600 px-1 rounded">atual</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PexelsLiveSearch({
  initialQuery,
  format,
  onPick,
}: {
  initialQuery: string;
  format: ProjectDraft["format"];
  onPick: (path: string, url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [items, setItems] = useState<{ pexelsId: number; previewUrl: string; fileUrl: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  // Quando muda a query da página (navegou pra outra página), atualiza
  // o input do search pra refletir a nova sugestão
  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  // Auto-busca quando abre, com a query inicial pré-preenchida
  useEffect(() => {
    if (!open) return;
    if (items.length > 0 && query === initialQuery) return; // já temos resultados pra essa query
    search(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function search(q?: string) {
    const term = q ?? query;
    if (!term.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/library/search?query=${encodeURIComponent(term)}&format=${format}`);
      const data = await res.json();
      if (data.ok) setItems(data.items);
    } finally {
      setLoading(false);
    }
  }

  async function pick(item: { pexelsId: number; fileUrl: string }) {
    setDownloadingId(item.pexelsId);
    try {
      const res = await fetch("/api/library/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileUrl: item.fileUrl, pexelsId: item.pexelsId, query }),
      });
      const data = await res.json();
      if (data.ok) {
        const path = data.path as string;
        const m = /[\\/](video-cache[\\/].+)$/.exec(path);
        const url = m ? "/api/local-video/" + m[1]!.split(/[\\/]/).map((s) => encodeURIComponent(s)).join("/") : "";
        onPick(path, url);
      }
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-purple-400 hover:text-purple-300"
      >
        {open ? "fechar Pexels" : "buscar no Pexels"}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <div className="text-[10px] text-neutral-500">
            Sugestão da IA pra esta página: <code className="text-neutral-300">{initialQuery}</code>
          </div>
          <div className="flex gap-1">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") search();
              }}
              className="flex-1 rounded bg-neutral-900 border border-neutral-700 px-2 py-1 text-xs"
              placeholder="palavras-chave em inglês"
            />
            <button
              onClick={() => search()}
              disabled={loading}
              className="px-2 py-1 rounded bg-purple-600 hover:bg-purple-500 text-xs disabled:opacity-50"
            >
              {loading ? "…" : "ir"}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {items.map((it) => (
              <button
                key={it.pexelsId}
                onClick={() => pick(it)}
                disabled={downloadingId === it.pexelsId}
                className="relative rounded overflow-hidden border border-neutral-800 hover:border-purple-500 disabled:opacity-50"
              >
                <img
                  src={it.previewUrl}
                  alt={String(it.pexelsId)}
                  className="w-full aspect-[9/16] object-cover bg-black"
                />
                {downloadingId === it.pexelsId && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-[9px]">
                    baixando…
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- helpers ---------------- */

function dimsFor(format: ProjectDraft["format"]): { width: number; height: number } {
  switch (format) {
    case "9:16":
      return { width: 1080, height: 1920 };
    case "4:5":
      return { width: 1080, height: 1350 };
    case "16:9":
      return { width: 1920, height: 1080 };
    case "1:1":
      return { width: 1080, height: 1080 };
  }
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}
function Select<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: string) => void;
  options: readonly T[];
}) {
  return (
    <label className="block">
      <span className="text-xs text-neutral-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1 text-sm"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs text-neutral-400">{label}</span>
      <div className="mt-1 flex gap-1 items-center">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-9 rounded bg-neutral-900 border border-neutral-700"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded bg-neutral-900 border border-neutral-700 px-2 py-1 font-mono text-xs"
        />
      </div>
    </label>
  );
}
function Range({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
}) {
  return (
    <label className="block">
      <div className="flex justify-between items-center">
        <span className="text-xs text-neutral-400">{label}</span>
        <span className="text-xs text-neutral-500 font-mono">
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-1 w-full"
      />
    </label>
  );
}
