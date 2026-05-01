import { NextResponse } from "next/server";
import {
  searchPexelsVideos,
  searchPexelsPhotos,
  pickBestVideoFile,
  pickBestPhotoUrl,
} from "../../../../lib/pexels";
import { dimensionsFor } from "../../../../lib/video-library";
import type { Format } from "../../../../lib/types";

export const runtime = "nodejs";

// V33: Tradução Português → Inglês — Pexels é otimizado pra inglês.
// Cobre os termos mais comuns de anúncios. Termos não listados passam direto.
const PT_TO_EN: Record<string, string> = {
  // Emoções
  medo: "fear scared person",
  triste: "sad person crying",
  tristeza: "sadness lonely person",
  feliz: "happy person joyful",
  alegria: "joy happy people",
  raiva: "angry person rage",
  nervoso: "anxious nervous person",
  ansiedade: "anxiety stress",
  amor: "love couple romantic",
  paixao: "passion couple",
  paixão: "passion couple",
  solidao: "lonely solitude",
  solidão: "lonely solitude",
  sucesso: "success achievement winning",
  fracasso: "failure giving up",
  esperanca: "hope hopeful person",
  esperança: "hope hopeful person",
  // Pessoas / corpos
  homem: "man",
  mulher: "woman",
  crianca: "child kid",
  criança: "child kid",
  bebê: "baby",
  bebe: "baby",
  idoso: "elderly person",
  jovem: "young person",
  // Trabalho / dinheiro
  dinheiro: "money cash",
  trabalho: "work office",
  trabalhar: "working hard work",
  empresa: "company office business",
  empresario: "businessman entrepreneur",
  empresário: "businessman entrepreneur",
  reuniao: "meeting business",
  reunião: "meeting business",
  estudante: "student studying",
  estudar: "studying student book",
  // Locais
  casa: "house home interior",
  cidade: "city urban",
  rua: "street city",
  praia: "beach ocean",
  campo: "countryside field",
  natureza: "nature forest",
  floresta: "forest trees",
  mar: "sea ocean waves",
  montanha: "mountain landscape",
  noite: "night dark",
  manha: "morning sunrise",
  manhã: "morning sunrise",
  tarde: "afternoon sunset",
  // Objetos
  celular: "phone smartphone",
  telefone: "phone",
  carro: "car automobile",
  computador: "computer laptop",
  livro: "book reading",
  comida: "food meal",
  cafe: "coffee cup",
  café: "coffee cup",
  agua: "water glass",
  água: "water glass",
  // Ações
  correr: "running sprint",
  correndo: "running",
  dormir: "sleeping bed",
  dormindo: "sleeping bed",
  comer: "eating food",
  comendo: "eating",
  beber: "drinking glass",
  bebendo: "drinking",
  trabalhando: "working office",
  // Vibes / tons
  escuro: "dark moody",
  cinematografico: "cinematic dark dramatic",
  cinematográfico: "cinematic dark dramatic",
  vintage: "vintage retro old",
  premium: "luxury premium elegant",
  elegante: "elegant luxury",
  glamour: "glamour fashion luxury",
  luxo: "luxury premium",
  // Outros
  perfume: "perfume bottle elegant",
  joia: "jewelry gold",
  joias: "jewelry gold rings",
  relogio: "watch luxury",
  relógio: "watch luxury",
};

/**
 * V33: Tenta traduzir cada palavra. Mantém palavras já em inglês.
 * Adiciona variantes em vez de substituir.
 */
function translateQuery(input: string): { translated: string; isOriginal: boolean } {
  const words = input
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  const translated: string[] = [];
  let anyTranslated = false;
  for (const word of words) {
    const norm = word.replace(/[^\p{L}]/gu, "");
    const trans = PT_TO_EN[norm];
    if (trans) {
      translated.push(trans);
      anyTranslated = true;
    } else {
      translated.push(word);
    }
  }
  return { translated: translated.join(" "), isOriginal: !anyTranslated };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("query");
  const format = (url.searchParams.get("format") ?? "9:16") as Format;
  // V51: mediaType controla o que buscar — video, image, ou both (default).
  // "both" busca em paralelo as duas APIs e mistura os resultados.
  const mediaType = (url.searchParams.get("mediaType") ?? "video") as
    | "video"
    | "image"
    | "both";
  // V32: paginação + perPage maior
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const perPage = Math.min(
    80,
    Math.max(10, parseInt(url.searchParams.get("perPage") ?? "80", 10) || 80),
  );
  if (!query) {
    return NextResponse.json({ ok: false, error: "query ausente" }, { status: 400 });
  }
  // V33: traduz PT → EN antes de pesquisar (Pexels é EN-optimized)
  const { translated, isOriginal } = translateQuery(query);
  const finalQuery = isOriginal ? query : translated;
  const orientation =
    format === "9:16" ? "portrait" : format === "16:9" ? "landscape" : "square";
  const dims = dimensionsFor(format);

  try {
    // V51: busca paralela em vídeos + fotos quando mediaType=both.
    // Resultados combinados — vídeos primeiro (mais úteis), fotos depois.
    const wantVideo = mediaType === "video" || mediaType === "both";
    const wantImage = mediaType === "image" || mediaType === "both";
    const [videosRaw, photosRaw] = await Promise.all([
      wantVideo
        ? searchPexelsVideos({
            query: finalQuery,
            orientation,
            perPage,
            page,
          })
        : Promise.resolve([]),
      wantImage
        ? searchPexelsPhotos({
            query: finalQuery,
            orientation,
            perPage,
            page,
          })
        : Promise.resolve([]),
    ]);

    const videoItems = videosRaw
      .map((v) => {
        const file = pickBestVideoFile(v, dims);
        return file
          ? {
              kind: "video" as const,
              pexelsId: v.id,
              previewUrl: v.image,
              fileUrl: file.link,
              width: file.width,
              height: file.height,
              duration: v.duration,
            }
          : null;
      })
      .filter((v): v is NonNullable<typeof v> => Boolean(v));

    const photoItems = photosRaw.map((p) => ({
      kind: "image" as const,
      pexelsId: p.id,
      previewUrl: p.src.medium,
      fileUrl: pickBestPhotoUrl(p, dims),
      width: p.width,
      height: p.height,
      duration: 0, // foto não tem duração
      photographer: p.photographer,
    }));

    // Mistura: vídeos primeiro (geralmente mais relevantes pra ad), fotos depois
    const items = [...videoItems, ...photoItems];

    return NextResponse.json({
      ok: true,
      items,
      page,
      perPage,
      mediaType,
      // hasMore: se ALGUMA das duas listas tá no máximo, prob. tem mais
      hasMore:
        videoItems.length === perPage || photoItems.length === perPage,
      // V33: indica se houve tradução pra mostrar no UI
      translatedFrom: isOriginal ? null : query,
      translatedTo: isOriginal ? null : finalQuery,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
