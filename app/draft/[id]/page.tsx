"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Player, type PlayerRef } from "@remotion/player";
import { AdComposition, type AdProps } from "../../../remotion/AdComposition";
import {
  buildLetterEffect,
  buildTextShadow,
  computeFitFontSize,
  normalizePageText,
} from "../../../lib/text-utils";
import {
  COLOR_FILTER_LABELS,
  colorFilterCss,
  combinedVideoFilter,
} from "../../../lib/color-filters";
import {
  ALL_FONT_GROUPS,
  FontSelect,
} from "../../../lib/font-catalog";
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

const ANIMATIONS: AnimationKind[] = [
  "teclado", "subir", "deslocar", "mesclar", "bloco",
  // V19: novas animações
  "fade", "escala", "girar", "explodir", "balancar", "flutuar",
];
const FRAMES_PER_BEAT = 48;
const FPS = 24;

/** V14: 0..1 → hex alpha "00".."ff" */
function editorAlphaHex(v: number): string {
  const c = Math.max(0, Math.min(1, v));
  return Math.round(c * 255).toString(16).padStart(2, "0");
}

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
  // V17: estado lifted pra mostrar painel de color grading quando vídeo selecionado
  const [videoIsSelected, setVideoIsSelected] = useState(false);
  // V22: scrub preview do vídeo principal quando user mexe nos handles do trim.
  // null = vídeo toca normal (autoplay/loop). número = pausa e seek pra esse tempo.
  const [videoPreviewTime, setVideoPreviewTime] = useState<number | null>(null);
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
    try {
      const res = await fetch(`/api/draft/${id}`);
      // Trata 503/504 (Railway/Cloudflare durante restart) silenciosamente.
      // Não JSON → não escala pro user, apenas tenta de novo no próximo ciclo.
      if (!res.ok) {
        if (res.status === 503 || res.status === 504 || res.status === 502) {
          console.warn(`[reload] ${res.status} transitório, ignorando`);
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        // Servidor respondeu HTML/text — provável proxy interceptando
        console.warn(`[reload] resposta não-JSON (${ct}), ignorando`);
        return;
      }
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Erro");
      setDraft(data.draft as EnrichedDraft);
      setError(null); // limpa erro persistente se reload deu certo
    } catch (e) {
      // Só mostra erro se não tem draft carregado ainda (1ª carga falhou)
      if (!draft) setError((e as Error).message);
      else console.warn(`[reload] erro ignorado:`, e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // V27: Ref pra snapshot pendente — usado pelo flushPendingSave() pra
  // dispar save IMEDIATAMENTE antes de render (evita race condition onde
  // user mexe slider e clica render dentro de 600ms — o render lia versão
  // ainda não persistida).
  const pendingSaveDraftRef = useRef<EnrichedDraft | null>(null);

  async function performSavePayload(next: EnrichedDraft): Promise<void> {
    const adsForSave = next.ads.map((ad) => ({
      ...ad,
      pages: ad.pages.map(({ videoUrl: _omit, ...rest }) => rest),
    }));
    const projectFields: Partial<ProjectStyle> & {
      fontHook?: string;
      fontTransition?: string;
    } = {
      baseColor: next.baseColor,
      accentColor: next.accentColor,
      baseFontSize: next.baseFontSize,
      baseLetterSpacing: next.baseLetterSpacing,
      baseLineHeight: next.baseLineHeight,
      baseShadowBlur: next.baseShadowBlur,
      baseShadowOpacity: next.baseShadowOpacity,
      baseOverlayOpacity: next.baseOverlayOpacity,
      baseAlign: next.baseAlign,
      fontHook: next.fontHook,
      fontTransition: next.fontTransition,
      template: next.template,
      baseShadowColor: next.baseShadowColor,
      baseStrokeColor: next.baseStrokeColor,
      baseStrokeWidth: next.baseStrokeWidth,
      colorFilter: next.colorFilter,
      toneFilter: next.toneFilter,
      vibe: next.vibe,
      glowColor: next.glowColor,
      glowIntensity: next.glowIntensity,
      gradientEnabled: next.gradientEnabled,
      gradientFrom: next.gradientFrom,
      gradientTo: next.gradientTo,
      gradientAngle: next.gradientAngle,
      vignetteIntensity: next.vignetteIntensity,
      grainIntensity: next.grainIntensity,
      lightLeakColor: next.lightLeakColor,
      lightLeakIntensity: next.lightLeakIntensity,
    };
    try {
      const res = await fetch(`/api/draft/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ads: adsForSave, ...projectFields }),
      });
      if (!res.ok) {
        if (res.status === 503 || res.status === 504 || res.status === 502) {
          console.warn(`[save] ${res.status} transitório`);
          setSaveStatus("idle");
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        setSaveStatus("idle");
        return;
      }
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1200);
    } catch (e) {
      console.warn(`[save] erro:`, e);
      setSaveStatus("idle");
    }
  }

  /**
   * V27: Força flush do save pendente AGORA. Usado antes de render pra
   * garantir que a última edição (cor, slider, etc) foi persistida no
   * Postgres antes do render-worker ler o draft.
   */
  async function flushPendingSave(): Promise<void> {
    if (savingTimer) {
      clearTimeout(savingTimer);
      setSavingTimer(null);
    }
    const pending = pendingSaveDraftRef.current;
    if (!pending) return;
    pendingSaveDraftRef.current = null;
    await performSavePayload(pending);
  }

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
    pendingSaveDraftRef.current = next;
    if (savingTimer) clearTimeout(savingTimer);
    const t = setTimeout(async () => {
      const pending = pendingSaveDraftRef.current;
      if (!pending) return;
      pendingSaveDraftRef.current = null;
      await performSavePayload(pending);
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

  function deletePage(adIdx: number, pageIdx: number) {
    if (!draft) return;
    const ad = draft.ads[adIdx];
    if (!ad) return;
    if (ad.pages.length <= 1) {
      alert("Não dá pra excluir a única página do anúncio.");
      return;
    }
    if (!confirm(`Excluir a página ${pageIdx + 1}? Não dá pra desfazer com Ctrl+Z depois de salvar.`)) return;
    const next: EnrichedDraft = {
      ...draft,
      ads: draft.ads.map((a, i) =>
        i !== adIdx ? a : { ...a, pages: a.pages.filter((_, j) => j !== pageIdx) },
      ),
    };
    // Ajusta selectedPage se a página removida era a atual ou anterior
    if (adIdx === selectedAd) {
      if (selectedPage === pageIdx) {
        // Vai pra anterior, ou ficar em 0
        setSelectedPage(Math.max(0, pageIdx - 1));
      } else if (selectedPage > pageIdx) {
        setSelectedPage(selectedPage - 1);
      }
    }
    scheduleSave(next);
  }

  // V25: Duplicar página — clona o slide e insere logo depois
  function duplicatePage(adIdx: number, pageIdx: number) {
    if (!draft) return;
    const ad = draft.ads[adIdx];
    if (!ad) return;
    const orig = ad.pages[pageIdx];
    if (!orig) return;
    const dupe: EnrichedPage = JSON.parse(JSON.stringify(orig));
    const next: EnrichedDraft = {
      ...draft,
      ads: draft.ads.map((a, i) =>
        i !== adIdx
          ? a
          : {
              ...a,
              pages: [
                ...a.pages.slice(0, pageIdx + 1),
                dupe,
                ...a.pages.slice(pageIdx + 1),
              ],
            },
      ),
    };
    // Pula pra duplicata recém-criada
    if (adIdx === selectedAd) {
      setSelectedPage(pageIdx + 1);
    }
    scheduleSave(next);
  }

  function updateProject(
    patch: Partial<ProjectStyle> & { fontHook?: string; fontTransition?: string },
  ) {
    if (!draft) return;
    scheduleSave({ ...draft, ...patch });
  }

  function bulkApplyFromCurrent(scope: "this-ad" | "all-ads") {
    if (!draft) return;
    const ad = draft.ads[selectedAd];
    const src = ad?.pages[selectedPage];
    if (!ad || !src) return;
    // V25: copia TODOS os campos de estilo. Exclui apenas conteúdo
    // específico da página (texto, vídeo, ícones, elementos, segments).
    const fields: Partial<PageDraft> = {
      // Estilo de texto base (PageStyle)
      fontSize: src.fontSize,
      color: src.color,
      letterSpacing: src.letterSpacing,
      lineHeight: src.lineHeight,
      textShadowBlur: src.textShadowBlur,
      textShadowOpacity: src.textShadowOpacity,
      overlayOpacity: src.overlayOpacity,
      align: src.align,
      // V12: cor sombra + outline
      textShadowColor: src.textShadowColor,
      textStrokeColor: src.textStrokeColor,
      textStrokeWidth: src.textStrokeWidth,
      // V16: italic, weight, underline, strike, case, rotation, skew
      italic: src.italic,
      fontWeightOverride: src.fontWeightOverride,
      underline: src.underline,
      strikethrough: src.strikethrough,
      letterCase: src.letterCase,
      rotation: src.rotation,
      skewX: src.skewX,
      // V11/V23: posição + scaleX
      textOffsetX: src.textOffsetX,
      textOffsetY: src.textOffsetY,
      textScaleX: src.textScaleX,
      // V14/V16: glow + gradiente per-page
      glowColor: src.glowColor,
      glowIntensity: src.glowIntensity,
      gradientEnabled: src.gradientEnabled,
      gradientFrom: src.gradientFrom,
      gradientTo: src.gradientTo,
      gradientAngle: src.gradientAngle,
      // V18: fundo
      backgroundColor: src.backgroundColor,
      videoRemoved: src.videoRemoved,
      // V17: color grading do vídeo
      videoBrightness: src.videoBrightness,
      videoContrast: src.videoContrast,
      videoSaturation: src.videoSaturation,
      videoHue: src.videoHue,
      videoTemperature: src.videoTemperature,
      videoVibrance: src.videoVibrance,
      videoHighlights: src.videoHighlights,
      videoShadows: src.videoShadows,
      videoWhites: src.videoWhites,
      videoBlacks: src.videoBlacks,
      // V19: velocidade animação
      animationSpeed: src.animationSpeed,
      animationEntryDuration: src.animationEntryDuration,
      animationExitDuration: src.animationExitDuration,
      // V21: letter effect
      letterEffect: src.letterEffect,
      letterEffectIntensity: src.letterEffectIntensity,
      letterEffectColor: src.letterEffectColor,
      // V4: vídeo transforms
      videoZoom: src.videoZoom,
      videoFlipH: src.videoFlipH,
      videoFlipV: src.videoFlipV,
      // animation type também
      animation: src.animation,
    };
    const next: EnrichedDraft = {
      ...draft,
      ads: draft.ads.map((a, i) => {
        if (scope === "this-ad" && i !== selectedAd) return a;
        return {
          ...a,
          pages: a.pages.map((p, pIdx) => {
            // Pula a própria página fonte (não muda a si mesma)
            if (i === selectedAd && pIdx === selectedPage) return p;
            return { ...p, ...fields };
          }),
        };
      }),
    };
    scheduleSave(next);
    // Feedback visual pra confirmar que aplicou
    const count =
      scope === "this-ad"
        ? Math.max(0, ad.pages.length - 1)
        : draft.ads.reduce((n, a, i) => n + a.pages.length - (i === selectedAd ? 1 : 0), 0);
    setRenderStatus(
      `✅ Estilo aplicado em ${count} página${count === 1 ? "" : "s"} ${
        scope === "this-ad" ? "deste anúncio" : "do projeto inteiro"
      }`,
    );
    setTimeout(() => setRenderStatus(null), 3500);
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
    // V27: Garante que TODA edição pendente (debounce de 600ms) foi
    // persistida no Postgres antes do worker ler. Antes: user mexia
    // um slider e clicava render dentro de 600ms → render usava versão
    // antiga ainda não salva.
    setRenderStatus("Salvando alterações…");
    try {
      await flushPendingSave();
    } catch {
      // Se falhar, ainda tenta renderizar com o que tá no Postgres
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
              videoSelected={videoIsSelected}
              onSetVideoSelected={setVideoIsSelected}
              videoPreviewTime={videoPreviewTime}
            />
          ) : (
            <div className="text-sm text-neutral-500">selecione uma página</div>
          )}

          {/* V17: Painel flutuante de color grading — aparece quando o vídeo
              é clicado/selecionado. Estilo Canva: floating no canto, com sliders
              pra ajustar temperatura, brilho, contraste, saturação etc. */}
          {videoIsSelected && page && (
            <ColorGradingPanel
              page={page}
              onUpdate={(patch) => updatePage(selectedAd, selectedPage, patch)}
              onClose={() => setVideoIsSelected(false)}
            />
          )}
          {/* V20: Painel flutuante de controles do vídeo (DIREITA — espelho
              do ajustes na esquerda). Remover vídeo, cor do fundo, zoom,
              flip, trim. Mesma trigger: vídeo selecionado. */}
          {videoIsSelected && page && (
            <VideoControlsPanel
              page={page}
              onUpdate={(patch) => updatePage(selectedAd, selectedPage, patch)}
              onClose={() => setVideoIsSelected(false)}
              onPreviewTimeChange={setVideoPreviewTime}
            />
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
        onDelete={(targetIdx) => deletePage(selectedAd, targetIdx)}
        onDuplicate={(targetIdx) => duplicatePage(selectedAd, targetIdx)}
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
  videoSelected,
  onSetVideoSelected,
  videoPreviewTime,
}: {
  page: EnrichedPage;
  draft: EnrichedDraft;
  onUpdate: (patch: Partial<EnrichedPage>) => void;
  selectedElementIds: Set<string>;
  onSelectElement: (id: string | null, multi: boolean) => void;
  videoSelected: boolean;
  onSetVideoSelected: (selected: boolean) => void;
  videoPreviewTime?: number | null;
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
  // V13: hover na palavra dispara preview da animação (estilo Canva)
  const [hoverAnimKey, setHoverAnimKey] = useState<number | null>(null);
  // V21: Auto-preview da animação quando user mexe na velocidade ou troca a animação.
  // Reseta o key (= remount) → CSS animation roda do zero. Pra usuário ver
  // imediatamente como ficou sem precisar passar mouse em cima.
  useEffect(() => {
    setHoverAnimKey(Date.now());
    const t = setTimeout(() => setHoverAnimKey(null), 1500);
    return () => clearTimeout(t);
  }, [page.animationEntryDuration, page.animationExitDuration, page.animation]);
  // V11: drag pra mover o texto
  const textDragRef = useRef<{
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
    moved: boolean;
  } | null>(null);

  // V18: Click na área vazia do canvas (fundo/vídeo) — seleciona o
  // VÍDEO (abre painel de ajustes/remover fundo). Estilo Canva.
  function selectVideoFromBackground() {
    setSelected(false);
    setEditing(false);
    onSelectElement(null, false);
    onSetVideoSelected(true);
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

  // V23: drag pra estender/encurtar a largura do texto (scaleX)
  const stretchRef = useRef<{ startX: number; startScale: number; dir: 1 | -1 } | null>(null);
  function startStretch(e: React.MouseEvent, dir: 1 | -1) {
    e.stopPropagation();
    e.preventDefault();
    stretchRef.current = {
      startX: e.clientX,
      startScale: page.textScaleX ?? 1,
      dir,
    };
    window.addEventListener("mousemove", onStretch);
    window.addEventListener("mouseup", endStretch);
  }
  function onStretch(e: MouseEvent) {
    if (!stretchRef.current) return;
    const dx = (e.clientX - stretchRef.current.startX) * stretchRef.current.dir;
    // 200px de drag = +50% de scale (calibração suave)
    const delta = dx / 400;
    const next = Math.max(
      0.5,
      Math.min(2, stretchRef.current.startScale + delta),
    );
    onUpdate({ textScaleX: Math.abs(next - 1) < 0.01 ? undefined : next });
  }
  function endStretch() {
    stretchRef.current = null;
    window.removeEventListener("mousemove", onStretch);
    window.removeEventListener("mouseup", endStretch);
  }

  // V11: drag pra mover o texto livre pelo canvas
  function startTextDrag(e: React.MouseEvent) {
    if (editing) return; // não arrasta enquanto edita
    e.stopPropagation();
    e.preventDefault();
    textDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startOffsetX: page.textOffsetX ?? 0,
      startOffsetY: page.textOffsetY ?? 0,
      moved: false,
    };
    window.addEventListener("mousemove", onTextDrag);
    window.addEventListener("mouseup", endTextDrag);
  }
  function onTextDrag(e: MouseEvent) {
    if (!textDragRef.current) return;
    const containerEl = containerRef.current;
    if (!containerEl) return;
    const rect = containerEl.getBoundingClientRect();
    const dx = (e.clientX - textDragRef.current.startX) / rect.width;
    const dy = (e.clientY - textDragRef.current.startY) / rect.height;
    if (Math.abs(dx) > 0.005 || Math.abs(dy) > 0.005) {
      textDragRef.current.moved = true;
    }
    // Limita a -0.5 / 0.5 (não deixa o texto sair do canvas)
    const newX = Math.max(-0.45, Math.min(0.45, textDragRef.current.startOffsetX + dx));
    const newY = Math.max(-0.45, Math.min(0.45, textDragRef.current.startOffsetY + dy));
    onUpdate({ textOffsetX: newX, textOffsetY: newY });
  }
  function endTextDrag() {
    textDragRef.current = null;
    window.removeEventListener("mousemove", onTextDrag);
    window.removeEventListener("mouseup", endTextDrag);
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
  // V16: peso customizável (override do natural)
  const fontWeight = page.fontWeightOverride ?? (isHook ? 900 : 400);
  // V16: letterCase per-page (uppercase/lowercase/capitalize/none)
  const textTransform: "uppercase" | "lowercase" | "capitalize" | "none" =
    page.letterCase === "upper"
      ? "uppercase"
      : page.letterCase === "lower"
        ? "lowercase"
        : page.letterCase === "capitalize"
          ? "capitalize"
          : page.letterCase === "none"
            ? "none"
            : isHook
              ? "uppercase"
              : "none";
  // V16: italic, underline, strikethrough, rotation, skew
  const fontStyle = page.italic ? "italic" : "normal";
  const textDecorations: string[] = [];
  if (page.underline) textDecorations.push("underline");
  if (page.strikethrough) textDecorations.push("line-through");
  const textDecoration = textDecorations.length > 0 ? textDecorations.join(" ") : "none";
  const rotationDeg = page.rotation ?? 0;
  const skewDeg = page.skewX ?? 0;
  const scaleX = page.textScaleX ?? 1;
  const wrapperTransform =
    rotationDeg !== 0 || skewDeg !== 0 || scaleX !== 1
      ? `rotate(${rotationDeg}deg) skewX(${skewDeg}deg) scaleX(${scaleX})`
      : undefined;

  // Mesmas regras do BeatScene (renderizador final): normaliza + auto-split + computeFit
  const normalizedText = useMemo(() => normalizePageText(page.text), [page.text]);
  const lines = normalizedText.split(" / ").map((s) => s.trim()).filter(Boolean);
  const fontSize =
    page.fontSize && page.fontSize > 0
      ? page.fontSize
      : computeFitFontSize(lines, isHook, dims.width);
  // V17: filtro combinado = LUT global + ajustes per-page (color grading)
  const filterCss = combinedVideoFilter(draft.colorFilter, {
    videoBrightness: page.videoBrightness,
    videoContrast: page.videoContrast,
    videoSaturation: page.videoSaturation,
    videoHue: page.videoHue,
    videoTemperature: page.videoTemperature,
    videoVibrance: page.videoVibrance,
    videoHighlights: page.videoHighlights,
    videoShadows: page.videoShadows,
    videoWhites: page.videoWhites,
    videoBlacks: page.videoBlacks,
  });
  const baseShadowValue = buildTextShadow({
    shadowBlur: style.shadowBlur,
    shadowOpacity: style.shadowOpacity,
    scale,
    shadowColor: page.textShadowColor ?? draft.baseShadowColor,
    strokeColor: page.textStrokeColor ?? draft.baseStrokeColor,
    strokeWidth: page.textStrokeWidth ?? draft.baseStrokeWidth,
  });
  // V14/V16: Glow per-page com fallback no projeto
  const glowI = page.glowIntensity ?? draft.glowIntensity ?? 0;
  const glowC = page.glowColor ?? draft.glowColor ?? "#ffd700";
  const textShadowValue =
    glowI > 0
      ? [
          `0 0 ${8 * scale}px ${glowC}${editorAlphaHex(glowI * 0.9)}`,
          `0 0 ${18 * scale}px ${glowC}${editorAlphaHex(glowI * 0.7)}`,
          `0 0 ${36 * scale}px ${glowC}${editorAlphaHex(glowI * 0.5)}`,
          baseShadowValue,
        ].join(", ")
      : baseShadowValue;
  // V14/V16: Gradiente per-page com fallback no projeto
  const gradEnabled =
    page.gradientEnabled === true ||
    (page.gradientEnabled === undefined && draft.gradientEnabled === true);
  const gradFrom = page.gradientFrom ?? draft.gradientFrom ?? "#ffffff";
  const gradTo = page.gradientTo ?? draft.gradientTo ?? "#d4af37";
  const gradAngle = page.gradientAngle ?? draft.gradientAngle ?? 180;
  const gradientStyle: React.CSSProperties = gradEnabled
    ? {
        background: `linear-gradient(${gradAngle}deg, ${gradFrom}, ${gradTo})`,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        WebkitTextFillColor: "transparent",
        color: "transparent",
      }
    : {};
  // V21: Letter effect (preset estilo Canva)
  const letterEffectStyle = buildLetterEffect(
    page.letterEffect,
    page.letterEffectIntensity ?? 50,
    page.letterEffectColor ?? "#ffd700",
    style.color,
  );
  // Se efeito tem overrideShadow, ignora o textShadow base
  const finalTextShadow = letterEffectStyle.overrideShadow
    ? letterEffectStyle.textShadow
    : textShadowValue;
  const iconAboveSvg = iconSvgString(page.iconAbove);
  const iconBelowSvg = iconSvgString(page.iconBelow);
  const shadowOffsetY = Math.max(2, Math.round(style.shadowBlur / 6));

  // V18: cor de fundo (quando vídeo removido) ou fallback preto
  const bgColor = page.backgroundColor ?? "#000000";
  const showVideo = !page.videoRemoved && page.videoUrl;

  return (
    <div
      ref={containerRef}
      className="relative shadow-2xl"
      style={{
        width: previewW,
        height: previewW * (dims.height / dims.width),
        background: bgColor,
      }}
      onClick={selectVideoFromBackground}
    >
      {/* Background sólido (V18: cor escolhida pelo user, default preto) */}
      <div className="absolute inset-0" style={{ background: bgColor }} />
      {/* Vídeo de fundo posicionável (V9) — esconde se videoRemoved (V18) */}
      {showVideo && (
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
            onSetVideoSelected(true);
            onSelectElement(null, false);
          }}
          onChange={(patch) => onUpdate(patch)}
          previewTime={videoPreviewTime}
        />
      )}
      {/* Overlay darkening */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, rgba(0,0,0,${style.overlayOpacity * 0.6}) 0%, rgba(0,0,0,${style.overlayOpacity}) 100%)`,
        }}
      />

      {/* V14: VINHETA — escurece os 4 cantos */}
      {(draft.vignetteIntensity ?? 0) > 0 && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,${draft.vignetteIntensity}) 100%)`,
          }}
        />
      )}

      {/* V14: LIGHT LEAKS — vazamento de luz */}
      {(draft.lightLeakIntensity ?? 0) > 0 && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at 85% 15%, ${draft.lightLeakColor ?? "#ffd27a"}${editorAlphaHex((draft.lightLeakIntensity ?? 0) * 0.85)} 0%, transparent 45%), radial-gradient(ellipse at 15% 85%, ${draft.lightLeakColor ?? "#ffd27a"}${editorAlphaHex((draft.lightLeakIntensity ?? 0) * 0.5)} 0%, transparent 40%)`,
            mixBlendMode: "screen",
          }}
        />
      )}

      {/* V14: GRANULADO de filme */}
      {(draft.grainIntensity ?? 0) > 0 && (
        <svg
          className="absolute inset-0 pointer-events-none"
          style={{ width: "100%", height: "100%", opacity: draft.grainIntensity, mixBlendMode: "overlay" }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <filter id="editor-canvas-grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#editor-canvas-grain)" />
        </svg>
      )}

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
            transform: `translate(${(page.textOffsetX ?? 0) * 100}%, ${(page.textOffsetY ?? 0) * 100}%)`,
            // V18: clicks na área vazia passam pelo wrapper pra atingir o
            // canvas root (que seleciona o vídeo / abre painel). Apenas o
            // div interno (com pointer-events:auto) captura clicks no texto.
            pointerEvents: "none",
          }}
        >
        <div
          onMouseEnter={() => {
            // Só dispara preview se não tá editando ou arrastando
            if (!editing && !textDragRef.current) {
              setHoverAnimKey(Date.now());
            }
          }}
          onMouseLeave={() => setHoverAnimKey(null)}
          onMouseDown={(e) => {
            // Drag SÓ se já tá selecionado e não editando
            if (selected && !editing) {
              startTextDrag(e);
            }
          }}
          onClick={(e) => {
            e.stopPropagation();
            // Se acabou de arrastar, não trata como click
            if (textDragRef.current?.moved) return;
            setSelected(true);
            // Clicar no texto FECHA o painel de vídeo (modo texto agora)
            onSetVideoSelected(false);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setSelected(true);
            setEditing(true);
          }}
          className={`relative px-[6%] ${
            selected
              ? "outline outline-2 outline-purple-500/70 outline-offset-4 cursor-move"
              : "cursor-text"
          }`}
          style={{
            // V16: rotation + skew aplicados no wrapper externo do texto
            transform: wrapperTransform,
            // V18: só o texto captura clicks (área vazia passa pro canvas)
            pointerEvents: "auto",
          }}
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
                fontStyle,
                textDecoration,
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
              key={hoverAnimKey ?? "idle"}
              className={hoverAnimKey ? `anim-preview-${page.animation}` : ""}
              style={{
                fontFamily: `"${fontFamily}", system-ui, sans-serif`,
                fontWeight,
                fontStyle,
                textDecoration,
                color: style.color,
                ...gradientStyle,
                textAlign: style.align,
                textTransform,
                lineHeight: style.lineHeight,
                letterSpacing: `${style.letterSpacing}em`,
                fontSize: fontSize * scale,
                textShadow: finalTextShadow,
                // V21: letter effect override de cor/stroke/background quando ativo
                ...(letterEffectStyle.overrideShadow
                  ? {
                      ...(letterEffectStyle.color !== undefined
                        ? { color: letterEffectStyle.color }
                        : {}),
                      ...(letterEffectStyle.WebkitTextFillColor
                        ? { WebkitTextFillColor: letterEffectStyle.WebkitTextFillColor }
                        : {}),
                      ...(letterEffectStyle.WebkitTextStroke
                        ? { WebkitTextStroke: letterEffectStyle.WebkitTextStroke }
                        : {}),
                      ...(letterEffectStyle.background
                        ? {
                            background: letterEffectStyle.background,
                            padding: letterEffectStyle.padding,
                            display: "inline-block",
                          }
                        : {}),
                    }
                  : {}),
                // V21: duração da CSS preview reflete os frames escolhidos
                // (24fps → segundos). Aplica só quando preview tá ativo.
                ...(hoverAnimKey
                  ? {
                      animationDuration: `${(page.animationEntryDuration ?? 14) / FPS}s`,
                    }
                  : {}),
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
              {/* Drag handle bottom-right (pinça) — resize fonte */}
              <div
                onMouseDown={startResize}
                className="absolute -right-3 -bottom-3 w-6 h-6 rounded-full bg-purple-600 border-2 border-white cursor-ns-resize flex items-center justify-center text-[10px] font-bold z-10"
                title="Arraste pra cima/baixo pra mudar o tamanho da fonte"
              >
                ↕
              </div>
              {/* V23: Handles laterais — estender/encurtar largura (scaleX) */}
              <div
                onMouseDown={(e) => startStretch(e, 1)}
                className="absolute -right-3 top-1/2 -translate-y-1/2 w-3 h-12 rounded-full bg-purple-500 border-2 border-white cursor-ew-resize z-10 flex items-center justify-center"
                title="Arraste horizontalmente pra estender/encurtar a largura"
              />
              <div
                onMouseDown={(e) => startStretch(e, -1)}
                className="absolute -left-3 top-1/2 -translate-y-1/2 w-3 h-12 rounded-full bg-purple-500 border-2 border-white cursor-ew-resize z-10 flex items-center justify-center"
                title="Arraste horizontalmente pra estender/encurtar a largura"
              />
              {/* Botão centralizar (só aparece se foi movido) */}
              {((page.textOffsetX ?? 0) !== 0 || (page.textOffsetY ?? 0) !== 0) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdate({ textOffsetX: 0, textOffsetY: 0 });
                  }}
                  className="absolute -left-3 -bottom-3 w-6 h-6 rounded-full bg-neutral-700 border-2 border-white cursor-pointer flex items-center justify-center text-[10px] font-bold hover:bg-neutral-600 z-10"
                  title="Centralizar texto"
                >
                  ⊕
                </button>
              )}
              {/* V23: Botão resetar largura (aparece se scaleX != 1) */}
              {page.textScaleX !== undefined && page.textScaleX !== 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdate({ textScaleX: undefined });
                  }}
                  className="absolute -right-3 -top-3 w-6 h-6 rounded-full bg-neutral-700 border-2 border-white cursor-pointer flex items-center justify-center text-[9px] font-bold hover:bg-neutral-600 z-10"
                  title="Resetar largura (100%)"
                >
                  ↔
                </button>
              )}
              {/* V24: Botão DELETAR LETRA (oculta o texto da página) */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (
                    confirm(
                      "Ocultar a letra desta página? Você pode restaurar depois pelo checkbox 'Ocultar texto' na sidebar.",
                    )
                  ) {
                    onUpdate({ hideText: true });
                    setSelected(false);
                  }
                }}
                className="absolute -left-3 -top-3 w-6 h-6 rounded-full bg-red-600 border-2 border-white cursor-pointer flex items-center justify-center text-[10px] font-bold hover:bg-red-500 z-10 text-white"
                title="Excluir/ocultar a letra desta página"
              >
                ✕
              </button>
              <div className="absolute -top-7 left-0 text-[10px] text-purple-300 whitespace-nowrap">
                2x edita · arraste move · ↕ resize · ↔ estende · ⊕ centraliza · ✕ exclui
              </div>
            </>
          )}
        </div>
        </div>
      )}

      {page.hideText && (
        <>
          <div className="absolute top-2 left-2 text-[10px] text-white/70 bg-black/50 px-1.5 py-0.5 rounded pointer-events-none">
            texto oculto
          </div>
          {/* V25: Botão grande no centro pra ADICIONAR letra */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUpdate({
                hideText: false,
                // Se a página estiver sem texto, coloca um placeholder
                ...((!page.text || page.text.trim() === "")
                  ? { text: "DIGITE AQUI" }
                  : {}),
              });
              setSelected(true);
              setEditing(true);
            }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-2 rounded-lg bg-purple-600/90 hover:bg-purple-500 text-white text-sm font-semibold border-2 border-white/50 shadow-2xl backdrop-blur-sm flex items-center gap-2 transition-all hover:scale-105"
            title="Adicionar letra na página"
            style={{ pointerEvents: "auto", zIndex: 50 }}
          >
            <span className="text-lg">✏️</span>
            <span>Adicionar letra</span>
          </button>
        </>
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
        onClick={(e) => {
          // V18: impede click de bubble pro canvas root (que selecionaria
          // o vídeo e desselectava esse elemento)
          e.stopPropagation();
        }}
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
  previewTime,
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
  previewTime?: number | null; // V22: tempo pra scrub durante drag do trim
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

  // V22: Preview scrub do trim — pausa o vídeo e seek pro tempo escolhido.
  // Quando user solta os handles (previewTime=null), volta a tocar.
  useEffect(() => {
    if (!ref.current) return;
    if (previewTime !== null && previewTime !== undefined) {
      ref.current.pause();
      ref.current.currentTime = previewTime;
    } else {
      ref.current.play().catch(() => {});
    }
  }, [previewTime]);

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
        onClick={(e) => {
          // Impede o click de bubble pro canvas pai (que dispararia
          // clearSelection() e desselectava o vídeo imediatamente
          // depois do startDrag selecionar)
          e.stopPropagation();
        }}
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
  onDelete,
  onDuplicate,
}: {
  pages: EnrichedPage[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  onSwap: (i: number, path: string, url: string) => void;
  onDelete: (i: number) => void;
  onDuplicate: (i: number) => void;
}) {
  return (
    <div className="border-t border-neutral-800 bg-neutral-950 px-3 py-2 overflow-x-auto">
      <div className="flex gap-2 items-center">
        {pages.map((p, i) => (
          <div
            key={i}
            className={`group flex-shrink-0 relative rounded overflow-hidden border ${
              i === selectedIndex
                ? "border-purple-500"
                : "border-neutral-700 hover:border-neutral-500"
            }`}
            style={{ width: 80, height: 128 }}
          >
            <button
              onClick={() => onSelect(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const data = e.dataTransfer.getData("application/x-video");
                if (!data) return;
                const parsed = JSON.parse(data) as { path: string; videoUrl: string };
                onSwap(i, parsed.path, parsed.videoUrl);
              }}
              className="block w-full h-full"
              title={p.text}
            >
              {p.videoUrl && !p.videoRemoved ? (
                <video
                  src={p.videoUrl}
                  muted
                  preload="metadata"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full"
                  style={{ background: p.backgroundColor ?? "#0a0a0a" }}
                />
              )}
              {p.videoUrl && !p.videoRemoved && (
                <div className="absolute inset-0 bg-black/40 pointer-events-none" />
              )}
              <div className="absolute inset-x-0 bottom-0 text-[8px] text-white text-center px-1 py-0.5 leading-tight bg-black/60 line-clamp-2 pointer-events-none">
                {p.text.replace(" / ", " ")}
              </div>
              <div className="absolute top-1 left-1 text-[9px] text-white/80 bg-black/60 rounded px-1 pointer-events-none">
                {String(i + 1).padStart(2, "0")}
              </div>
            </button>
            {/* X de excluir — aparece no hover */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(i);
              }}
              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
              title="Excluir esta página"
            >
              ×
            </button>
            {/* V25: + de duplicar — aparece no hover, embaixo do X */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate(i);
              }}
              className="absolute top-1 right-7 w-5 h-5 rounded-full bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
              title="Duplicar esta página"
            >
              +
            </button>
          </div>
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
    // V27: spread completo — antes copiava só 11 campos. Animation preview
    // agora reflete EXATAMENTE o que o user editou (glow, gradiente, color
    // grading, letter effects, transforms etc).
    beats: ad.pages.map((p) => {
      // Remove videoUrl (campo do EnrichedPage só pra editor)
      const { videoUrl: _omit, ...rest } = p;
      return rest;
    }),
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
  // V27: inclui TODOS os campos do projeto (V12-V14 efeitos avançados +
  // sombra colorida + outline). Antes só 11 campos saíam — animation
  // preview e bulk save perdiam visualização desses efeitos.
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
    // V12: cor sombra + outline (project-level)
    baseShadowColor: d.baseShadowColor,
    baseStrokeColor: d.baseStrokeColor,
    baseStrokeWidth: d.baseStrokeWidth,
    // V14: efeitos avançados
    glowColor: d.glowColor,
    glowIntensity: d.glowIntensity,
    gradientEnabled: d.gradientEnabled,
    gradientFrom: d.gradientFrom,
    gradientTo: d.gradientTo,
    gradientAngle: d.gradientAngle,
    vignetteIntensity: d.vignetteIntensity,
    grainIntensity: d.grainIntensity,
    lightLeakColor: d.lightLeakColor,
    lightLeakIntensity: d.lightLeakIntensity,
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
  onUpdateProject: (
    patch: Partial<ProjectStyle> & { fontHook?: string; fontTransition?: string },
  ) => void;
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
  // V21: usado pelo LetterEffectGrid
  const isHook = page.weight === "hook" || page.weight === "punch";
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
      {/* V29: Reorganização — 2 seções essenciais ABERTAS no topo, resto colapsado */}

      <Group label="🎬 Página">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={page.hideText ?? false}
            onChange={(e) => onUpdatePage({ hideText: e.target.checked })}
            className="rounded"
          />
          <span>Ocultar texto (vídeo fala por si só)</span>
        </label>
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
      </Group>

      <Group label="📝 Texto">
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
        {/* V23: Caixa (maiúsculas / minúsculas) — botões rápidos visíveis */}
        <div>
          <span className="text-xs text-neutral-400">Caixa do texto</span>
          <div className="grid grid-cols-4 gap-1 mt-1">
            {(
              [
                { v: undefined, label: "Padrão", title: "Hook = MAIÚSCULA, transição = normal" },
                { v: "upper", label: "AA", title: "Tudo MAIÚSCULAS" },
                { v: "lower", label: "aa", title: "Tudo minúsculas" },
                { v: "capitalize", label: "Aa", title: "Primeira Letra Maiúscula" },
              ] as const
            ).map((opt) => {
              const cur = page.letterCase ?? "default";
              const isActive =
                (opt.v === undefined && cur === "default") || cur === opt.v;
              return (
                <button
                  key={opt.label}
                  onClick={() =>
                    onUpdatePage({ letterCase: opt.v as PageDraft["letterCase"] })
                  }
                  title={opt.title}
                  className={`text-xs py-1.5 rounded border transition-colors ${
                    isActive
                      ? "bg-purple-900/40 border-purple-500 text-purple-200"
                      : "bg-neutral-900 border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
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

      <CollapsibleGroup
        label="🔤 Tipografia (fontes do projeto)"
        hint="Mudar aqui afeta TODOS os anúncios e páginas do projeto."
        defaultOpen
      >
        <FontSelect
          label="Fonte gancho (uppercase bold)"
          value={draft.fontHook}
          onChange={(v) => onUpdateProject({ fontHook: v })}
          groups={ALL_FONT_GROUPS}
        />
        <FontSelect
          label="Fonte transição (sentence-case)"
          value={draft.fontTransition}
          onChange={(v) => onUpdateProject({ fontTransition: v })}
          groups={ALL_FONT_GROUPS}
        />
      </CollapsibleGroup>

      <CollapsibleGroup
        label="⏱️ Velocidade da animação"
        hint="Controla quão rápido o texto entra e sai. Hover no texto pra ver preview."
        defaultOpen
      >
        <Range
          label="Velocidade entrada (frames)"
          value={page.animationEntryDuration ?? 14}
          min={4}
          max={48}
          step={1}
          format={(v) => `${v}f (~${(v / 24).toFixed(2)}s)`}
          onChange={(v) => onUpdatePage({ animationEntryDuration: v })}
        />
        <Range
          label="Velocidade saída (frames)"
          value={page.animationExitDuration ?? 14}
          min={4}
          max={48}
          step={1}
          format={(v) => `${v}f (~${(v / 24).toFixed(2)}s)`}
          onChange={(v) => onUpdatePage({ animationExitDuration: v })}
        />
        <button
          onClick={() => {
            const entry = page.animationEntryDuration ?? 14;
            onUpdatePage({ animationExitDuration: entry });
          }}
          className="text-[10px] px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 w-full"
        >
          ⇄ Igualar saída à entrada
        </button>
      </CollapsibleGroup>

      {/* V21: Efeitos de letra — grid 3x3 estilo Canva */}
      <CollapsibleGroup
        label="🎨 Efeitos de letra (presets)"
        hint="9 presets prontos: glow, neon, contorno, vazado, gradiente, etc."
        defaultOpen
      >
        <LetterEffectGrid
          value={page.letterEffect ?? "none"}
          intensity={page.letterEffectIntensity ?? 50}
          color={page.letterEffectColor ?? "#ffd700"}
          baseColor={page.color ?? draft.baseColor}
          fontFamily={isHook ? draft.fontHook : draft.fontTransition}
          onChange={(patch) => onUpdatePage(patch)}
        />
      </CollapsibleGroup>

      {/* V16: Arsenal — efeitos de letra (italic / weight / underline / case / rotation / skew) */}
      <CollapsibleGroup
        label="🎯 Estilo avançado da letra"
        hint="Itálico, sublinhado, peso, rotação, skew, esticar largura."
      >
        <Row>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={page.italic ?? false}
              onChange={(e) => onUpdatePage({ italic: e.target.checked })}
            />
            <span>Itálico</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={page.underline ?? false}
              onChange={(e) => onUpdatePage({ underline: e.target.checked })}
            />
            <span>Sublinhado</span>
          </label>
        </Row>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={page.strikethrough ?? false}
            onChange={(e) => onUpdatePage({ strikethrough: e.target.checked })}
          />
          <span>Riscado (strikethrough)</span>
        </label>
        <Select
          label="Caixa (maiúsculas/minúsculas)"
          value={page.letterCase ?? "default"}
          onChange={(v) =>
            onUpdatePage({
              letterCase:
                v === "default"
                  ? undefined
                  : (v as "none" | "upper" | "lower" | "capitalize"),
            })
          }
          options={["default", "upper", "lower", "capitalize", "none"]}
          renderLabel={(v) =>
            v === "default"
              ? "Padrão (hook = MAIÚSCULA)"
              : v === "upper"
                ? "MAIÚSCULAS"
                : v === "lower"
                  ? "minúsculas"
                  : v === "capitalize"
                    ? "Primeira Letra"
                    : "Sem transformação"
          }
        />
        <Range
          label="Peso da fonte (override)"
          value={page.fontWeightOverride ?? 0}
          min={0}
          max={900}
          step={100}
          format={(v) => (v === 0 ? "auto (usar peso)" : String(v))}
          onChange={(v) =>
            onUpdatePage({ fontWeightOverride: v === 0 ? undefined : v })
          }
        />
        <Range
          label="Rotação"
          value={page.rotation ?? 0}
          min={-30}
          max={30}
          step={1}
          format={(v) => (v === 0 ? "0°" : `${v}°`)}
          onChange={(v) => onUpdatePage({ rotation: v === 0 ? undefined : v })}
        />
        <Range
          label="Skew (inclinação horizontal)"
          value={page.skewX ?? 0}
          min={-20}
          max={20}
          step={1}
          format={(v) => (v === 0 ? "0°" : `${v}°`)}
          onChange={(v) => onUpdatePage({ skewX: v === 0 ? undefined : v })}
        />
        {/* V23: Estender / encurtar largura do texto */}
        <Range
          label="Largura do texto (estender / encurtar)"
          value={(page.textScaleX ?? 1) * 100}
          min={50}
          max={200}
          step={5}
          format={(v) => (v === 100 ? "normal" : `${v}%`)}
          onChange={(v) =>
            onUpdatePage({ textScaleX: v === 100 ? undefined : v / 100 })
          }
        />
      </CollapsibleGroup>

      {/* V16: Arsenal — Glow + Gradiente per-page */}
      <CollapsibleGroup
        label="✨ Glow & Gradiente"
        hint="Aura colorida ao redor + gradiente de cor no texto."
        defaultOpen
      >
        <div className="text-[11px] text-purple-300 -mt-1">✨ Glow</div>
        <ColorField
          label="Cor do glow"
          value={page.glowColor ?? draft.glowColor ?? "#ffd700"}
          onChange={(v) => onUpdatePage({ glowColor: v })}
        />
        <Range
          label="Intensidade do glow"
          value={page.glowIntensity ?? draft.glowIntensity ?? 0}
          min={0}
          max={1}
          step={0.05}
          format={(v) => (v === 0 ? "desligado" : `${Math.round(v * 100)}%`)}
          onChange={(v) => onUpdatePage({ glowIntensity: v })}
        />
        <div className="text-[11px] text-purple-300 mt-2">🌈 Gradiente</div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={
              page.gradientEnabled === true ||
              (page.gradientEnabled === undefined &&
                draft.gradientEnabled === true)
            }
            onChange={(e) =>
              onUpdatePage({ gradientEnabled: e.target.checked })
            }
          />
          <span>Ativar gradiente no texto</span>
        </label>
        {(page.gradientEnabled === true ||
          (page.gradientEnabled === undefined &&
            draft.gradientEnabled === true)) && (
          <>
            <Row>
              <ColorField
                label="Cor inicial"
                value={page.gradientFrom ?? draft.gradientFrom ?? "#ffffff"}
                onChange={(v) => onUpdatePage({ gradientFrom: v })}
              />
              <ColorField
                label="Cor final"
                value={page.gradientTo ?? draft.gradientTo ?? "#d4af37"}
                onChange={(v) => onUpdatePage({ gradientTo: v })}
              />
            </Row>
            <Range
              label="Ângulo do gradiente"
              value={page.gradientAngle ?? draft.gradientAngle ?? 180}
              min={0}
              max={360}
              step={15}
              format={(v) => `${v}°`}
              onChange={(v) => onUpdatePage({ gradientAngle: v })}
            />
          </>
        )}
      </CollapsibleGroup>

      <CollapsibleGroup
        label="🌑 Sombra & Contorno"
        hint="Sombra do texto, contorno (outline) e overlay escuro do vídeo."
        defaultOpen
      >
        <div className="text-[11px] text-purple-300 -mt-1">Sombra</div>
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
        <ColorField
          label="Cor da sombra"
          value={page.textShadowColor ?? draft.baseShadowColor ?? "#000000"}
          onChange={(v) => onUpdatePage({ textShadowColor: v })}
        />
        <div className="text-[11px] text-purple-300 mt-3">Contorno (outline)</div>
        <ColorField
          label="Cor do contorno"
          value={page.textStrokeColor ?? draft.baseStrokeColor ?? "#000000"}
          onChange={(v) => onUpdatePage({ textStrokeColor: v })}
        />
        <Range
          label="Espessura do contorno"
          value={page.textStrokeWidth ?? draft.baseStrokeWidth ?? 1}
          min={0}
          max={3}
          step={0.1}
          format={(v) => (v === 0 ? "sem contorno" : `${v.toFixed(1)}×`)}
          onChange={(v) => onUpdatePage({ textStrokeWidth: v })}
        />
        <div className="text-[11px] text-purple-300 mt-3">Overlay sobre vídeo</div>
        <Range
          label="Escurecer fundo"
          value={page.overlayOpacity ?? draft.baseOverlayOpacity}
          min={0}
          max={1}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => onUpdatePage({ overlayOpacity: v })}
        />
      </CollapsibleGroup>

      <CollapsibleGroup label="🔷 Shapes & Elementos">
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
                className={`text-xs rounded flex items-center gap-2 ${
                  selectedElementIds.has(el.id)
                    ? "bg-purple-900/40 border border-purple-600"
                    : "bg-neutral-900 border border-neutral-800"
                }`}
              >
                <button
                  onClick={(e) => {
                    if (e.shiftKey) {
                      if (selectedElementIds.has(el.id)) {
                        const next = new Set(selectedElementIds);
                        next.delete(el.id);
                        onSelectElement(next.size === 0 ? null : Array.from(next)[0]!);
                      } else {
                        onSelectElement(el.id);
                      }
                    } else {
                      onSelectElement(el.id);
                    }
                  }}
                  className="flex-1 flex items-center gap-2 px-2 py-1 cursor-pointer text-left"
                >
                  <span
                    className="w-3 h-3 rounded-sm border border-neutral-600 shrink-0"
                    style={{ background: el.color }}
                  />
                  <span className="flex-1">{el.shape}</span>
                  <span className="text-neutral-500 text-[10px]">
                    {Math.round(el.w * 100)}×{Math.round(el.h * 100)}
                  </span>
                </button>
                {/* V18: X de excluir direto da lista */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdatePage({
                      elements: (page.elements ?? []).filter((e2) => e2.id !== el.id),
                    });
                    if (selectedElementIds.has(el.id)) {
                      onSelectElement(null);
                    }
                  }}
                  className="px-2 py-1 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded-r"
                  title="Excluir este elemento"
                >
                  ✕
                </button>
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
      </CollapsibleGroup>

      <CollapsibleGroup
        label="🌈 Cor por palavra"
        hint="Click numa palavra → escolhe cor pro destaque (palavra-chave)."
      >
        <WordColorEditor
          text={page.text}
          segments={page.segments}
          baseColor={page.color ?? draft.baseColor}
          accentColor={draft.accentColor}
          onChange={(segments) => onUpdatePage({ segments })}
        />
      </CollapsibleGroup>

      <CollapsibleGroup
        label="🎭 Ícones decorativos"
        hint="Adiciona ícone acima/abaixo do texto (setas, estrelas, etc)."
      >
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
      </CollapsibleGroup>

      <CollapsibleGroup
        label="📋 Aplicar em massa"
        hint="Copia o estilo desta página pra outras (cor, sombra, efeitos, animação, etc)."
      >
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
      </CollapsibleGroup>

      <CollapsibleGroup
        label="🎬 Vídeo de fundo (Pexels)"
        hint="Pesquisa vídeos do Pexels pra trocar o fundo. Pra importar do PC, clica no vídeo do canvas."
      >
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
      </CollapsibleGroup>

      <CollapsibleGroup
        label="🌐 Estilo global do projeto"
        hint="Afeta TODOS os anúncios — cor base, destaque, filtro LUT global."
      >
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
            Igual filtro do Instagram — coerência visual entre todos os
            anúncios do projeto.
          </span>
        </label>
      </CollapsibleGroup>
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
                  <div
                    className="absolute z-20 top-full mt-1 left-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ColorPickerPopup
                      value={wordColor ?? baseColor}
                      onChange={(c) => setWordColor(lineIdx, wordIdx, c)}
                      onClose={() => setPickerOpen(null)}
                    />
                    {wordColor && (
                      <button
                        onClick={() => setWordColor(lineIdx, wordIdx, null)}
                        className="mt-1 text-[10px] text-neutral-300 px-2 py-1 bg-neutral-800 rounded border border-neutral-700 w-full"
                      >
                        Remover cor desta palavra
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
    // INSTANTÂNEO: usa a URL do Pexels CDN direto, sem baixar pro
    // servidor. Browser carrega da Pexels (rápido) e o render também
    // (lib/render.ts já passa URLs HTTP direto pro Remotion).
    setDownloadingId(item.pexelsId);
    try {
      onPick(item.fileUrl, item.fileUrl);
    } finally {
      // Pequeno delay visual pra usuário ver feedback
      setTimeout(() => setDownloadingId(null), 200);
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
    <div className="rounded-lg bg-neutral-900/40 border border-neutral-800 p-3 space-y-2.5">
      <div className="text-[11px] uppercase tracking-wider text-purple-300 font-semibold">
        {label}
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

/** V29: Group colapsável com visual de card profissional. */
function CollapsibleGroup({
  label,
  children,
  defaultOpen = false,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  hint?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className={`rounded-lg border transition-colors ${
        open
          ? "border-purple-700 bg-neutral-900/40"
          : "border-neutral-800 bg-neutral-900/20 hover:border-neutral-700"
      }`}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left px-3 py-2.5"
      >
        <span
          className={`text-[11px] uppercase tracking-wider font-semibold ${
            open ? "text-purple-300" : "text-neutral-400"
          }`}
        >
          {label}
        </span>
        <span
          className={`text-xs transition-transform ${
            open ? "text-purple-400 rotate-90" : "text-neutral-500"
          }`}
        >
          ▸
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2.5">
          {hint && (
            <p className="text-[10px] text-neutral-500 leading-snug -mt-1">
              {hint}
            </p>
          )}
          {children}
        </div>
      )}
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
  renderLabel,
}: {
  label: string;
  value: T;
  onChange: (v: string) => void;
  options: readonly T[];
  renderLabel?: (v: T) => string;
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
            {renderLabel ? renderLabel(o) : o}
          </option>
        ))}
      </select>
    </label>
  );
}
/**
 * V17: Painel flutuante de color grading. Aparece quando o vídeo é
 * selecionado (clique no vídeo). Sliders estilo Canva pra ajustar
 * temperatura, brilho, contraste, saturação etc — per-página.
 *
 * Posicionado fixo no canto inferior-esquerdo do viewport, sem
 * cobrir a sidebar nem o canvas. Tem botão pra resetar tudo + fechar.
 */
function ColorGradingPanel({
  page,
  onUpdate,
  onClose,
}: {
  page: EnrichedPage;
  onUpdate: (patch: Partial<EnrichedPage>) => void;
  onClose: () => void;
}) {
  const sliders: Array<{
    key: keyof EnrichedPage;
    label: string;
    min: number;
    max: number;
    step: number;
    defaultValue: number;
    format: (v: number) => string;
    sliderClass?: string; // V21: classe CSS pra gradiente colorido
  }> = [
    { key: "videoBrightness", label: "Brilho", min: 50, max: 150, step: 1, defaultValue: 100, format: (v) => `${v}%` },
    { key: "videoContrast", label: "Contraste", min: 50, max: 150, step: 1, defaultValue: 100, format: (v) => `${v}%` },
    { key: "videoSaturation", label: "Saturação", min: 0, max: 200, step: 1, defaultValue: 100, format: (v) => `${v}%` },
    { key: "videoVibrance", label: "Vibração", min: -100, max: 100, step: 1, defaultValue: 0, format: (v) => `${v > 0 ? "+" : ""}${v}` },
    { key: "videoTemperature", label: "Temperatura", min: -100, max: 100, step: 1, defaultValue: 0, format: (v) => v === 0 ? "neutra" : v > 0 ? `+${v} ☀` : `${v} ❄`, sliderClass: "slider-temperature" },
    { key: "videoHue", label: "Matiz", min: -180, max: 180, step: 1, defaultValue: 0, format: (v) => `${v}°`, sliderClass: "slider-hue" },
    { key: "videoHighlights", label: "Destaques", min: -100, max: 100, step: 1, defaultValue: 0, format: (v) => `${v > 0 ? "+" : ""}${v}` },
    { key: "videoShadows", label: "Sombras", min: -100, max: 100, step: 1, defaultValue: 0, format: (v) => `${v > 0 ? "+" : ""}${v}` },
    { key: "videoWhites", label: "Brancos", min: -100, max: 100, step: 1, defaultValue: 0, format: (v) => `${v > 0 ? "+" : ""}${v}` },
    { key: "videoBlacks", label: "Pretos", min: -100, max: 100, step: 1, defaultValue: 0, format: (v) => `${v > 0 ? "+" : ""}${v}` },
  ];

  function reset() {
    onUpdate({
      videoBrightness: undefined,
      videoContrast: undefined,
      videoSaturation: undefined,
      videoHue: undefined,
      videoTemperature: undefined,
      videoVibrance: undefined,
      videoHighlights: undefined,
      videoShadows: undefined,
      videoWhites: undefined,
      videoBlacks: undefined,
    });
  }

  return (
    <div
      className="fixed top-20 left-4 z-40 w-72 bg-neutral-900/95 backdrop-blur border border-neutral-700 rounded-lg shadow-2xl"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800">
        <div className="text-xs font-semibold text-neutral-200">
          🎨 Ajustes do vídeo
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={reset}
            className="text-[10px] text-neutral-400 hover:text-neutral-200 px-2 py-0.5 rounded border border-neutral-700"
            title="Resetar todos os ajustes"
          >
            Resetar
          </button>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-200 px-1"
            title="Fechar"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="px-3 py-2 space-y-2 max-h-[55vh] overflow-y-auto">
        {sliders.map((s) => {
          const cur = (page[s.key] as number | undefined) ?? s.defaultValue;
          return (
            <div key={s.key as string}>
              <div className="flex justify-between text-[10px] text-neutral-400">
                <span>{s.label}</span>
                <span className={cur === s.defaultValue ? "text-neutral-500" : "text-purple-300"}>
                  {s.format(cur)}
                </span>
              </div>
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={s.step}
                value={cur}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  onUpdate({
                    [s.key]: v === s.defaultValue ? undefined : v,
                  } as Partial<EnrichedPage>);
                }}
                className={`w-full ${s.sliderClass ?? ""}`}
              />
            </div>
          );
        })}
      </div>
      <div className="px-3 py-1.5 border-t border-neutral-800 text-[9px] text-neutral-500 leading-tight">
        Ajustes são por página. Aparecem no MP4 final. Clique fora do vídeo
        ou em ✕ pra fechar.
      </div>
    </div>
  );
}

/**
 * V20: Painel flutuante na DIREITA — controles do vídeo (remover,
 * fundo, zoom, flip, trim). Mirror do ColorGradingPanel da esquerda.
 * Aparece quando o vídeo é clicado, estilo Canva.
 */
function VideoControlsPanel({
  page,
  onUpdate,
  onClose,
  onPreviewTimeChange,
}: {
  page: EnrichedPage;
  onUpdate: (patch: Partial<EnrichedPage>) => void;
  onClose: () => void;
  onPreviewTimeChange?: (time: number | null) => void;
}) {
  function resetTransforms() {
    onUpdate({
      videoZoom: undefined,
      videoFlipH: undefined,
      videoFlipV: undefined,
      videoTrimStart: undefined,
      videoX: undefined,
      videoY: undefined,
      videoW: undefined,
      videoH: undefined,
    });
  }

  return (
    <div
      className="fixed top-20 right-4 z-40 w-72 bg-neutral-900/95 backdrop-blur border border-neutral-700 rounded-lg shadow-2xl"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800">
        <div className="text-xs font-semibold text-neutral-200">
          🎬 Controles do vídeo
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={resetTransforms}
            className="text-[10px] text-neutral-400 hover:text-neutral-200 px-2 py-0.5 rounded border border-neutral-700"
            title="Resetar zoom/flip/trim/posição"
          >
            Resetar
          </button>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-200 px-1"
            title="Fechar"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="px-3 py-2 space-y-3 max-h-[65vh] overflow-y-auto">
        {/* Bloco 1: Fundo da página (V18) */}
        <div className="rounded border border-neutral-800 p-2 space-y-2 bg-neutral-950/50">
          <div className="text-[11px] text-neutral-400 font-semibold">
            Fundo da página
          </div>
          <button
            onClick={() =>
              onUpdate({ videoRemoved: !(page.videoRemoved ?? false) })
            }
            className={`w-full text-xs px-2 py-1.5 rounded border ${
              page.videoRemoved
                ? "bg-purple-900/40 border-purple-600 text-purple-200"
                : "bg-neutral-800 border-neutral-700 text-neutral-200 hover:bg-neutral-700"
            }`}
          >
            {page.videoRemoved
              ? "🎨 Vídeo removido — clique pra restaurar"
              : "🎬 Remover vídeo (deixar só o fundo)"}
          </button>
          <ColorField
            label="Cor do fundo"
            value={page.backgroundColor ?? "#000000"}
            onChange={(v) => onUpdate({ backgroundColor: v })}
          />
          <p className="text-[10px] text-neutral-500 leading-tight">
            {page.videoRemoved
              ? "Sem vídeo — só a cor aparece."
              : "Cor de fundo aparece atrás do vídeo (caso ele não cubra todo o canvas)."}
          </p>
        </div>

        {/* V25: Importar vídeo/imagem do PC direto pra esta página */}
        <ImportVideoButton onUpdate={onUpdate} />

        {/* Bloco 2: Transforms — só faz sentido se vídeo NÃO removido */}
        {!page.videoRemoved && (
          <div className="space-y-2">
            <div className="text-[11px] text-neutral-400 font-semibold">
              Transformações
            </div>
            <Range
              label="Zoom"
              value={page.videoZoom ?? 1}
              min={1}
              max={2.5}
              step={0.05}
              format={(v) => `${v.toFixed(2)}×`}
              onChange={(v) => onUpdate({ videoZoom: v })}
            />
            <Row>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={page.videoFlipH ?? false}
                  onChange={(e) =>
                    onUpdate({ videoFlipH: e.target.checked })
                  }
                />
                <span>Espelhar (H)</span>
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={page.videoFlipV ?? false}
                  onChange={(e) =>
                    onUpdate({ videoFlipV: e.target.checked })
                  }
                />
                <span>Inverter (V)</span>
              </label>
            </Row>
            {/* V21: Trim mais bem feito — input visual com start + end +
                preview de duração do trecho escolhido */}
            <VideoTrimControl
              page={page}
              onUpdate={onUpdate}
              onPreviewTimeChange={onPreviewTimeChange}
            />
            <p className="text-[10px] text-neutral-500 leading-tight">
              💡 Pra mover/redimensionar a área do vídeo no canvas, arraste
              direto pelo vídeo (e use os 4 cantos roxos pra redimensionar).
            </p>
          </div>
        )}
      </div>
      <div className="px-3 py-1.5 border-t border-neutral-800 text-[9px] text-neutral-500 leading-tight">
        Controles per-página. Clique no ✕ ou no texto pra fechar.
      </div>
    </div>
  );
}

/**
 * V25: Botão de importar vídeo/imagem do PC direto pra página atual.
 * Faz upload via /api/upload-asset e seta videoSrc + videoUrl da página.
 */
function ImportVideoButton({
  onUpdate,
}: {
  onUpdate: (patch: Partial<EnrichedPage>) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      // V30: raw body — funciona com arquivos grandes (WhatsApp/Pinterest)
      const res = await fetch("/api/upload-asset", {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-Filename": encodeURIComponent(file.name),
        },
        body: file,
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Falha no upload");
      // Seta videoSrc + videoUrl + restaura vídeo (caso estivesse removido)
      onUpdate({
        videoSrc: data.asset.filepath,
        videoUrl: data.url,
        videoRemoved: false,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="w-full text-xs px-2 py-1.5 rounded border bg-purple-900/30 border-purple-600 text-purple-200 hover:bg-purple-900/50 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {busy ? "⏳ Subindo..." : "📁 Importar vídeo/imagem do PC"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="video/*,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = ""; // permite reimportar mesmo arquivo
        }}
      />
      {error && (
        <p className="text-[10px] text-red-400">Erro: {error}</p>
      )}
      <p className="text-[10px] text-neutral-500 leading-tight">
        💡 Sobe direto pra ESTA página. Aceita MP4/MOV/WEBM/MKV/AVI e PNG/JPG/
        WEBP/GIF (Pinterest, TikTok, Instagram, etc.).
      </p>
    </div>
  );
}

/**
 * V21: Trim de vídeo bem feito — detecta duração do clip, mostra
 * timeline visual com handles de início e fim, calcula trecho útil.
 */
function VideoTrimControl({
  page,
  onUpdate,
  onPreviewTimeChange,
}: {
  page: EnrichedPage;
  onUpdate: (patch: Partial<EnrichedPage>) => void;
  onPreviewTimeChange?: (time: number | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [duration, setDuration] = useState<number | null>(null);

  const trimStart = page.videoTrimStart ?? 0;
  const maxEnd = duration ?? 30;
  const trimEnd = page.videoTrimEnd ?? maxEnd;

  function fmt(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m > 0
      ? `${m}:${String(sec).padStart(2, "0")}`
      : `${s.toFixed(1)}s`;
  }

  const usefulDuration = Math.max(0, trimEnd - trimStart);

  // V22: Quando user solta o slider OU mouse, limpa o preview pro vídeo voltar a tocar
  function clearPreview() {
    onPreviewTimeChange?.(null);
  }

  return (
    <div className="space-y-2">
      <div className="text-[11px] text-neutral-400 font-semibold flex justify-between">
        <span>Cortar vídeo</span>
        {duration && (
          <span className="text-[9px] text-neutral-500">
            duração: {fmt(duration)}
          </span>
        )}
      </div>
      {/* V22: Vídeo invisível só pra detectar duração — scrub agora acontece
          NO CANVAS PRINCIPAL via onPreviewTimeChange callback. */}
      {page.videoUrl && (
        <video
          ref={videoRef}
          src={page.videoUrl}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          style={{ display: "none" }}
        />
      )}
      {/* Slider duplo: início */}
      <div>
        <div className="flex justify-between text-[10px] text-neutral-400">
          <span>Início (corta começo)</span>
          <span className={trimStart > 0 ? "text-purple-300" : "text-neutral-500"}>
            {fmt(trimStart)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={maxEnd}
          step={0.1}
          value={trimStart}
          onChange={(e) => {
            const v = Number(e.target.value);
            const safeV = Math.min(v, trimEnd - 0.5);
            onUpdate({ videoTrimStart: safeV });
            onPreviewTimeChange?.(safeV);
          }}
          onMouseUp={clearPreview}
          onTouchEnd={clearPreview}
          onBlur={clearPreview}
          className="w-full"
        />
      </div>
      {/* Slider duplo: fim */}
      <div>
        <div className="flex justify-between text-[10px] text-neutral-400">
          <span>Fim (corta final)</span>
          <span
            className={
              page.videoTrimEnd !== undefined
                ? "text-purple-300"
                : "text-neutral-500"
            }
          >
            {fmt(trimEnd)}
            {page.videoTrimEnd === undefined && (
              <span className="text-neutral-600 ml-1">(usa todo)</span>
            )}
          </span>
        </div>
        <input
          type="range"
          min={0.5}
          max={maxEnd}
          step={0.1}
          value={trimEnd}
          onChange={(e) => {
            const v = Number(e.target.value);
            const safeV = Math.max(v, trimStart + 0.5);
            onUpdate({
              videoTrimEnd: safeV >= maxEnd - 0.05 ? undefined : safeV,
            });
            onPreviewTimeChange?.(safeV);
          }}
          onMouseUp={clearPreview}
          onTouchEnd={clearPreview}
          onBlur={clearPreview}
          className="w-full"
        />
      </div>
      {/* Indicador visual da seleção */}
      <div className="relative h-2 bg-neutral-800 rounded overflow-hidden">
        <div
          className="absolute h-full bg-purple-500/60"
          style={{
            left: `${(trimStart / maxEnd) * 100}%`,
            right: `${100 - (trimEnd / maxEnd) * 100}%`,
          }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-neutral-500">
        <span>Trecho útil:</span>
        <span className="text-neutral-300">{fmt(usefulDuration)}</span>
      </div>
      {(trimStart > 0 || page.videoTrimEnd !== undefined) && (
        <button
          onClick={() =>
            onUpdate({ videoTrimStart: undefined, videoTrimEnd: undefined })
          }
          className="text-[10px] text-neutral-400 hover:text-neutral-200 underline w-full text-center"
        >
          Resetar trim (usar vídeo inteiro)
        </button>
      )}
    </div>
  );
}

/**
 * V21: Grid 3x3 de efeitos de letra estilo Canva. Cada card mostra
 * "Ag" renderizado com o efeito ativo. Click seleciona, slider
 * ajusta intensidade.
 */
function LetterEffectGrid({
  value,
  intensity,
  color,
  baseColor,
  fontFamily,
  onChange,
}: {
  value: NonNullable<EnrichedPage["letterEffect"]>;
  intensity: number;
  color: string;
  baseColor: string;
  fontFamily: string;
  onChange: (
    patch: Partial<
      Pick<
        EnrichedPage,
        "letterEffect" | "letterEffectIntensity" | "letterEffectColor"
      >
    >,
  ) => void;
}) {
  const effects: Array<{
    key: NonNullable<EnrichedPage["letterEffect"]>;
    label: string;
  }> = [
    { key: "none", label: "Nenhum" },
    { key: "projetada", label: "Projetada" },
    { key: "brilhante", label: "Brilhante" },
    { key: "eco", label: "Eco" },
    { key: "contorno", label: "Contorno" },
    { key: "fundo", label: "Fundo" },
    { key: "desalinhado", label: "Desalinhado" },
    { key: "vazado", label: "Vazado" },
    { key: "neon", label: "Neon" },
    { key: "falha", label: "Falha" },
  ];

  function previewStyle(key: typeof value): React.CSSProperties {
    const fx = buildLetterEffect(key, intensity, color, baseColor);
    const result: React.CSSProperties = {
      fontFamily: `"${fontFamily}", system-ui, sans-serif`,
      fontWeight: 900,
      fontSize: 28,
      color: baseColor,
      lineHeight: 1,
    };
    if (fx.textShadow) result.textShadow = fx.textShadow;
    if (fx.color) result.color = fx.color;
    if (fx.WebkitTextFillColor) result.WebkitTextFillColor = fx.WebkitTextFillColor;
    if (fx.WebkitTextStroke) result.WebkitTextStroke = fx.WebkitTextStroke;
    if (fx.background) {
      result.background = fx.background;
      result.padding = fx.padding;
      result.display = "inline-block";
    }
    return result;
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1.5">
        {effects.map((fx) => (
          <button
            key={fx.key}
            onClick={() => onChange({ letterEffect: fx.key })}
            className={`flex flex-col items-center justify-center rounded p-2 border transition-colors ${
              value === fx.key
                ? "border-purple-500 bg-purple-900/20"
                : "border-neutral-800 bg-neutral-900 hover:border-neutral-600"
            }`}
            style={{ minHeight: 70 }}
          >
            <div
              className="flex items-center justify-center mb-1"
              style={{ minHeight: 36 }}
            >
              <span style={previewStyle(fx.key)}>Ag</span>
            </div>
            <span className="text-[10px] text-neutral-300">{fx.label}</span>
          </button>
        ))}
      </div>
      {value !== "none" && (
        <>
          <div>
            <div className="flex justify-between text-[10px] text-neutral-400">
              <span>Intensidade</span>
              <span className="text-purple-300">{intensity}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={intensity}
              onChange={(e) =>
                onChange({ letterEffectIntensity: Number(e.target.value) })
              }
              className="w-full"
            />
          </div>
          {/* Cor do efeito (afeta brilhante, eco, fundo, neon) */}
          {(value === "brilhante" ||
            value === "eco" ||
            value === "fundo" ||
            value === "neon") && (
            <ColorField
              label="Cor do efeito"
              value={color}
              onChange={(v) => onChange({ letterEffectColor: v })}
            />
          )}
        </>
      )}
    </div>
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
  const [open, setOpen] = useState(false);
  return (
    <label className="block">
      <span className="text-xs text-neutral-400">{label}</span>
      <div className="mt-1 flex gap-1 items-center">
        <button
          onClick={(e) => {
            e.preventDefault();
            setOpen((v) => !v);
          }}
          className="h-7 w-9 rounded border border-neutral-700 cursor-pointer"
          style={{ background: value }}
          title="Abrir picker"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded bg-neutral-900 border border-neutral-700 px-2 py-1 font-mono text-xs"
        />
      </div>
      {open && (
        <div className="relative">
          <ColorPickerPopup
            value={value}
            onChange={onChange}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </label>
  );
}

/**
 * V22: Color picker custom — arrastável (HSV), com hue strip e
 * saturation/value box 2D. Substitui o native <input type="color">
 * que não permite arrastar a bolinha em alguns browsers.
 */
function ColorPickerPopup({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  const initial = hexToHsv(value);
  const [hsv, setHsv] = useState(initial);
  const svRef = useRef<HTMLDivElement | null>(null);
  const hueRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<"sv" | "hue" | null>(null);

  // Atualiza local hsv quando value externo muda (sincroniza)
  useEffect(() => {
    if (hsvToHex(hsv).toLowerCase() !== value.toLowerCase()) {
      setHsv(hexToHsv(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function emit(newHsv: { h: number; s: number; v: number }) {
    setHsv(newHsv);
    onChange(hsvToHex(newHsv));
  }

  function startDrag(mode: "sv" | "hue", e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = mode;
    onMove(e.nativeEvent);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", endDrag);
  }
  function onMove(e: MouseEvent) {
    if (!dragRef.current) return;
    if (dragRef.current === "sv" && svRef.current) {
      const rect = svRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      emit({ h: hsv.h, s: x * 100, v: 100 - y * 100 });
    } else if (dragRef.current === "hue" && hueRef.current) {
      const rect = hueRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      emit({ h: x * 360, s: hsv.s, v: hsv.v });
    }
  }
  function endDrag() {
    dragRef.current = null;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", endDrag);
  }

  const presets = [
    "#ffffff", "#000000", "#ef4444", "#f97316", "#eab308",
    "#22c55e", "#06b6d4", "#3b82f6", "#a855f7", "#ec4899",
    "#d4af37", "#92400e",
  ];

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className="absolute z-50 mt-1 left-0 bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl p-2 w-56"
    >
      {/* Saturation/Value box 2D — arrasta a bolinha aqui */}
      <div
        ref={svRef}
        onMouseDown={(e) => startDrag("sv", e)}
        className="relative rounded cursor-crosshair"
        style={{
          width: "100%",
          height: 130,
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h}, 100%, 50%))`,
        }}
      >
        <div
          className="absolute w-3 h-3 rounded-full border-2 border-white pointer-events-none"
          style={{
            left: `${hsv.s}%`,
            top: `${100 - hsv.v}%`,
            transform: "translate(-50%, -50%)",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
          }}
        />
      </div>
      {/* Hue strip — arrastável */}
      <div
        ref={hueRef}
        onMouseDown={(e) => startDrag("hue", e)}
        className="relative mt-2 rounded cursor-pointer"
        style={{
          width: "100%",
          height: 14,
          background:
            "linear-gradient(to right, #ff0000 0%, #ffff00 16.6%, #00ff00 33.3%, #00ffff 50%, #0000ff 66.6%, #ff00ff 83.3%, #ff0000 100%)",
        }}
      >
        <div
          className="absolute w-3 h-full border-2 border-white pointer-events-none rounded"
          style={{
            left: `${(hsv.h / 360) * 100}%`,
            transform: "translateX(-50%)",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
          }}
        />
      </div>
      {/* Presets */}
      <div className="grid grid-cols-6 gap-1 mt-2">
        {presets.map((c) => (
          <button
            key={c}
            onClick={() => onChange(c)}
            className="aspect-square rounded border border-neutral-700 hover:border-purple-500"
            style={{ background: c }}
          />
        ))}
      </div>
      {/* Hex input + close */}
      <div className="mt-2 flex gap-1 items-center">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded bg-neutral-800 border border-neutral-700 px-2 py-1 font-mono text-xs"
        />
        <button
          onClick={onClose}
          className="text-neutral-400 hover:text-neutral-200 px-2 text-xs"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ============================================================
// V22: HSV ↔ HEX helpers
// ============================================================

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) return { h: 0, s: 0, v: 100 };
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let hh = 0;
  if (d !== 0) {
    if (max === r) hh = ((g - b) / d) % 6;
    else if (max === g) hh = (b - r) / d + 2;
    else hh = (r - g) / d + 4;
    hh *= 60;
    if (hh < 0) hh += 360;
  }
  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;
  return { h: hh, s, v };
}

function hsvToHex(hsv: { h: number; s: number; v: number }): string {
  const s = hsv.s / 100;
  const v = hsv.v / 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((hsv.h / 60) % 2) - 1));
  const m = v - c;
  let r = 0,
    g = 0,
    b = 0;
  if (hsv.h < 60) { r = c; g = x; }
  else if (hsv.h < 120) { r = x; g = c; }
  else if (hsv.h < 180) { g = c; b = x; }
  else if (hsv.h < 240) { g = x; b = c; }
  else if (hsv.h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const hex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
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
