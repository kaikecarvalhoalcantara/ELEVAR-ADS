import Anthropic from "@anthropic-ai/sdk";
import { normalizePageText } from "./text-utils";
import type { Audience, Beat, Lang, Mood } from "./types";

const client = new Anthropic({ apiKey: process.env.CLAUDE_KEY });

const CTA_BY_LANG: Record<Lang, [string, string]> = {
  pt: ["Ao tocar em / Saiba Mais", "Toque em / Saiba Mais"],
  es: ["Al tocar / Más Información", "Haz clic / Más Información"],
  en: ["Tap / Learn More", "Click / Learn More"],
};

interface CutInput {
  copy: string;
  pageCount: number; // hint, IA pode ajustar +/- 10
  mood: Mood;
  audience: Audience;
  language: Lang;
}

const SYSTEM = `Você corta copy de anúncio em SLIDES curtos pra vídeo cinematográfico vertical. Cada slide tem 2-7 palavras — o objetivo é fazer o lead receber a informação em pulsos. Você é EXTREMAMENTE FIEL à copy original — não inventa, NÃO RESUME, NÃO OMITE palavras.`;

function buildPrompt(input: CutInput): string {
  const [cta1, cta2] = CTA_BY_LANG[input.language];
  return `Quebra a copy abaixo em SLIDES curtos. Cada slide = 1 página do vídeo final.

⚠️⚠️⚠️ REGRA FUNDAMENTAL — NÃO PERCA PALAVRAS ⚠️⚠️⚠️
TODA palavra do copy original DEVE estar em algum slide. Não resuma, não
parafraseie, não omita, não pule frase. Se a copy tem 200 palavras, todos
os slides juntos têm que ter ≈200 palavras (pode somar 195-205, com leve
ajuste de pontuação). A IA QUE PERDE PALAVRAS QUEBRA ANÚNCIO.

✅ BOM: copy "Eu nunca imaginei que uma simples decisão pudesse mudar
   completamente minha vida em apenas 30 dias" →
   Slide 1: "Eu nunca imaginei"
   Slide 2: "Que uma simples"
   Slide 3: "DECISÃO"
   Slide 4: "Pudesse mudar"
   Slide 5: "Completamente minha vida"
   Slide 6: "Em apenas / 30 DIAS"

❌ RUIM (perde palavras): a IA fez:
   Slide 1: "UMA DECISÃO"
   Slide 2: "MUDOU MINHA VIDA"
   Slide 3: "EM 30 DIAS"
   ← perdeu "nunca imaginei", "simples", "completamente", "apenas", etc.
   PROIBIDO. Texto integral ou nada.

REGRAS DURAS:
1. Cada slide tem **2 a 7 palavras**. Limite flexível pra caber a frase inteira.
2. Frase longa do original vira VÁRIOS slides curtos consecutivos (cortes rápidos).
3. Quando faz sentido, isola UMA palavra-chave em CAIXA ALTA num slide só.
4. Ordem ORIGINAL preservada SEMPRE. Mesma seqüência da copy.
5. Sem linhas em branco.
6. As 2 últimas linhas DEVEM ser exatamente: "${cta1}" e "${cta2}" (ambas weight "punch").

DISTRIBUIÇÃO DE WEIGHT (importante):
- **"hook" ≈ 60%** — frases curtas em uppercase bold, com impacto.
- **"punch" ≈ 35%** — palavra-chave isolada em CAPS, climax curtíssimo, CTA.
- **"transition" ≈ 5%** — APENAS pra frases narrativas em sentence-case (frases
  tipo "ele me olhou", "naquele momento"). RARO.

⚠️ Não use "transition" por padrão. Maioria absoluta é hook ou punch.

QUEBRA DENTRO DO SLIDE (em até 2 linhas com " / "):
- 1-4 palavras → 1 linha visual (sem " / ")
- 5-7 palavras → 2 linhas com " / ", balanceadas por LARGURA visual (char-count
  similar entre as 2 linhas). Ex: "AO TOCAR EM / SAIBA MAIS".

QUANTIDADE: gera **TANTOS slides quanto necessário** pra caber TUDO da copy.
Não tente caber em ${input.pageCount}. Total maior é melhor — cortes rápidos
são desejados. Pode passar de 50, 60, 80 slides se a copy for longa.

Mood: ${input.mood} | Público: ${input.audience} | Idioma: ${input.language}.

COPY (preserve TODAS as palavras):
"""
${input.copy.trim()}
"""

Responda SOMENTE JSON válido sem markdown:
{"beats":[{"text":"...","weight":"hook"},{"text":"PALAVRA","weight":"punch"},...]}`;
}

/**
 * V56: Conta palavras "úteis" — letras+números, ignorando pontuação e símbolos.
 * Usado pra verificar se a IA preservou ≈100% das palavras do original.
 */
function countWords(s: string): number {
  return (s.match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

export async function cutIntoBeats(input: CutInput): Promise<Beat[]> {
  if (!process.env.CLAUDE_KEY) {
    throw new Error("CLAUDE_KEY não configurada no .env.local");
  }
  // V56: max_tokens subiu de 8000 pra 16000 — copy longa precisa de mais espaço
  // pra gerar todos os beats sem cortar resposta.
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: "user", content: buildPrompt(input) }],
  });
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("Resposta da IA sem texto");
  }
  const raw = block.text.trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0) {
    throw new Error(`JSON ausente: ${raw.slice(0, 200)}`);
  }
  const parsed = JSON.parse(raw.slice(start, end + 1)) as { beats: Beat[] };
  if (!Array.isArray(parsed.beats) || parsed.beats.length < 8) {
    throw new Error(`Beats insuficientes: ${parsed.beats?.length}`);
  }
  const beats = parsed.beats.map((b) => ({
    text: normalizePageText(b.text),
    weight: b.weight,
  }));

  // V56: Validação — IA não pode perder mais de 15% das palavras do original.
  // Se perdeu, loga warning (mas não trava o fluxo — melhor algo do que nada).
  const originalWords = countWords(input.copy);
  const beatsWords = beats.reduce((sum, b) => sum + countWords(b.text), 0);
  const ratio = beatsWords / Math.max(1, originalWords);
  if (ratio < 0.85) {
    console.warn(
      `[beats] ⚠️ IA perdeu palavras: original=${originalWords}, beats=${beatsWords} (${Math.round(ratio * 100)}%). Frequência alta de "perda" indica problema no prompt.`,
    );
  } else if (ratio < 0.95) {
    console.log(
      `[beats] cobertura ${Math.round(ratio * 100)}% — aceitável mas pode melhorar`,
    );
  } else {
    console.log(`[beats] ✓ cobertura ${Math.round(ratio * 100)}% — preservou tudo`);
  }
  return beats;
}
