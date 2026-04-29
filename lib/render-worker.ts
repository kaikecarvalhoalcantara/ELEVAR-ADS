import { loadDraft, saveDraft } from "./drafts";
import { buildProjectName, renderAd } from "./render";
import { cleanOldRenders } from "./cleanup";
import type { PageWithStyle } from "../remotion/AdComposition";
import type { ProjectStyle } from "./types";

/**
 * Worker assíncrono — renderiza N ads em sequência, atualizando o
 * `draft.rendering` a cada passo. Pode rodar em background sem timeout
 * de proxy HTTP.
 *
 * Idempotente: ads já completados são pulados.
 */
export async function renderAdsInBackground(
  draftId: string,
  adNumbers: number[],
): Promise<void> {
  console.log(`[render-worker ${draftId}] iniciado pra ${adNumbers.length} ads`);

  // Cleanup auto: apaga MP4s >24h ANTES de começar — libera espaço
  // pra novos renders. Volume Railway é 500MB, sem isso enche em 1-2 dias.
  try {
    const c = await cleanOldRenders();
    if (c.deletedCount > 0) {
      console.log(
        `[render-worker ${draftId}] cleanup: liberou ${(c.freedBytes / 1024 / 1024).toFixed(1)}MB (${c.deletedCount} arquivos)`,
      );
    }
  } catch (e) {
    console.warn(`[render-worker ${draftId}] cleanup falhou: ${(e as Error).message}`);
  }

  const start = await loadDraft(draftId);
  if (!start) {
    console.error(`[render-worker ${draftId}] draft sumiu no início`);
    return;
  }
  start.rendering = {
    status: "in_progress",
    queueAdNumbers: adNumbers,
    completedAdNumbers: start.rendering?.completedAdNumbers ?? [],
    failedAdNumbers: [],
    startedAt: Date.now(),
    message: `Aguardando renderizar ${adNumbers.length} anúncio${adNumbers.length === 1 ? "" : "s"}…`,
  };
  await saveDraft(start);

  for (const adNum of adNumbers) {
    // Skip se já completado
    const cur = await loadDraft(draftId);
    if (!cur) {
      console.error(`[render-worker ${draftId}] draft sumiu mid-render`);
      return;
    }
    if (cur.rendering?.completedAdNumbers.includes(adNum)) {
      console.log(`[render-worker ${draftId}] AD ${adNum} já renderizado, skip`);
      continue;
    }

    const ad = cur.ads.find((a) => a.number === adNum);
    if (!ad || ad.pages.length === 0) {
      cur.rendering!.failedAdNumbers.push({
        number: adNum,
        error: "AD sem páginas",
      });
      await saveDraft(cur);
      continue;
    }

    // Marca em progresso
    cur.rendering!.currentAdNumber = adNum;
    cur.rendering!.message = `Renderizando AD ${String(adNum).padStart(2, "0")}…`;
    await saveDraft(cur);
    console.log(`[render-worker ${draftId}] ▶ AD ${adNum}`);

    const projectName = buildProjectName({
      cliente: cur.cliente,
      nicho: cur.nicho,
      nome: cur.nome,
      date: new Date(cur.createdAt),
    });
    const beats: PageWithStyle[] = ad.pages.map((p) => ({
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
      segments: p.segments,
      iconAbove: p.iconAbove,
      iconBelow: p.iconBelow,
      iconColor: p.iconColor,
      videoZoom: p.videoZoom,
      videoFlipH: p.videoFlipH,
      videoFlipV: p.videoFlipV,
      videoTrimStart: p.videoTrimStart,
      elements: p.elements,
      videoX: p.videoX,
      videoY: p.videoY,
      videoW: p.videoW,
      videoH: p.videoH,
      textOffsetX: p.textOffsetX,
      textOffsetY: p.textOffsetY,
      textShadowColor: p.textShadowColor,
      textStrokeColor: p.textStrokeColor,
      textStrokeWidth: p.textStrokeWidth,
      // V16: arsenal de edição de letra
      italic: p.italic,
      fontWeightOverride: p.fontWeightOverride,
      underline: p.underline,
      strikethrough: p.strikethrough,
      letterCase: p.letterCase,
      rotation: p.rotation,
      skewX: p.skewX,
      glowColor: p.glowColor,
      glowIntensity: p.glowIntensity,
      gradientEnabled: p.gradientEnabled,
      gradientFrom: p.gradientFrom,
      gradientTo: p.gradientTo,
      gradientAngle: p.gradientAngle,
      // V17: color grading per-page
      videoBrightness: p.videoBrightness,
      videoContrast: p.videoContrast,
      videoSaturation: p.videoSaturation,
      videoHue: p.videoHue,
      videoTemperature: p.videoTemperature,
      videoVibrance: p.videoVibrance,
      videoHighlights: p.videoHighlights,
      videoShadows: p.videoShadows,
      videoWhites: p.videoWhites,
      videoBlacks: p.videoBlacks,
    }));
    const videos = ad.pages.map((p) => p.videoSrc);
    const animations = ad.pages.map((p) => p.animation);
    const projectStyle: ProjectStyle = {
      toneFilter: cur.toneFilter,
      vibe: cur.vibe,
      baseColor: cur.baseColor,
      accentColor: cur.accentColor,
      baseFontSize: cur.baseFontSize,
      baseLetterSpacing: cur.baseLetterSpacing,
      baseLineHeight: cur.baseLineHeight,
      baseShadowBlur: cur.baseShadowBlur,
      baseShadowOpacity: cur.baseShadowOpacity,
      baseOverlayOpacity: cur.baseOverlayOpacity,
      baseAlign: cur.baseAlign,
      colorFilter: cur.colorFilter ?? "neutro",
      template: cur.template,
      baseShadowColor: cur.baseShadowColor,
      baseStrokeColor: cur.baseStrokeColor,
      baseStrokeWidth: cur.baseStrokeWidth,
      // V14: efeitos avançados — repassa pro Remotion render
      glowColor: cur.glowColor,
      glowIntensity: cur.glowIntensity,
      gradientEnabled: cur.gradientEnabled,
      gradientFrom: cur.gradientFrom,
      gradientTo: cur.gradientTo,
      gradientAngle: cur.gradientAngle,
      vignetteIntensity: cur.vignetteIntensity,
      grainIntensity: cur.grainIntensity,
      lightLeakColor: cur.lightLeakColor,
      lightLeakIntensity: cur.lightLeakIntensity,
    };
    const outputName = `${projectName} - AD ${String(adNum).padStart(2, "0")}`;

    try {
      await renderAd({
        beats,
        videos,
        animations,
        format: cur.format,
        fontHook: cur.fontHook,
        fontTransition: cur.fontTransition,
        projectStyle,
        outputName,
      });
      console.log(`[render-worker ${draftId}] ✓ AD ${adNum}`);
      // Marca como completo
      const after = await loadDraft(draftId);
      if (!after) return;
      if (!after.rendering) after.rendering = start.rendering;
      after.rendering!.completedAdNumbers = [
        ...new Set([...after.rendering!.completedAdNumbers, adNum]),
      ];
      await saveDraft(after);
    } catch (err) {
      const msg = (err as Error).message || "Erro desconhecido";
      console.error(`[render-worker ${draftId}] ✗ AD ${adNum}: ${msg}`);
      const after = await loadDraft(draftId);
      if (!after) return;
      if (!after.rendering) after.rendering = start.rendering;
      after.rendering!.failedAdNumbers = [
        ...after.rendering!.failedAdNumbers.filter((f) => f.number !== adNum),
        { number: adNum, error: msg },
      ];
      await saveDraft(after);
    }
    // Sugere ao Node fazer GC entre ads
    if (global.gc) global.gc();
  }

  // Marca como complete
  const final = await loadDraft(draftId);
  if (final && final.rendering) {
    final.rendering.status = "complete";
    final.rendering.finishedAt = Date.now();
    final.rendering.currentAdNumber = undefined;
    final.rendering.message = `Concluído. ${final.rendering.completedAdNumbers.length}/${adNumbers.length} ads renderizados.`;
    await saveDraft(final);
  }
  console.log(`[render-worker ${draftId}] ✓ COMPLETO`);
}
