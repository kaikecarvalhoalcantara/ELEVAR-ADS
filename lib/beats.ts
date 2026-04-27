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

const SYSTEM = `Você corta copy de anúncio em SLIDES super curtos pra vídeo cinematográfico vertical. Cada slide tem POUCAS palavras (2-5 max) — o objetivo é fazer o lead receber as informações em pulsos rápidos, gerando dopamina pelo ritmo de transições. Você é fiel à copy original — não inventa.`;

function buildPrompt(input: CutInput): string {
  const [cta1, cta2] = CTA_BY_LANG[input.language];
  return `Quebra a copy abaixo em SLIDES curtos. Cada slide = 1 página do vídeo final.

REGRAS DURAS:
1. Cada slide tem **2 a 5 palavras MÁXIMO**. Nunca passa de 5.
2. Frase longa do original vira VÁRIOS slides curtos consecutivos (cortes rápidos).
3. Quando faz sentido, isola UMA palavra-chave em CAIXA ALTA num slide só (efeito tatami).
4. Mantém ordem e sentido original. Sem floreio nem reescrever.
5. Sem linhas em branco.
6. As 2 últimas linhas DEVEM ser exatamente: "${cta1}" e "${cta2}" (ambas weight "punch").

DISTRIBUIÇÃO DE WEIGHT (importante):
- **"hook" ≈ 60%** — frases curtas (2-5 palavras) em uppercase bold, com impacto. A MAIORIA dos slides é hook.
- **"punch" ≈ 35%** — palavra-chave isolada em CAPS, climax curtíssimo, CTA. Curtos e secos.
- **"transition" ≈ 5%** — APENAS pra frases narrativas em sentence-case (frases tipo "ele me olhou", "naquele momento") que pedem leveza tipográfica. RARO. Default não é transition.

⚠️ Não use "transition" por padrão. Maioria absoluta é hook ou punch.

QUEBRA DENTRO DO SLIDE (em 2 linhas com " / "):
- 1-3 palavras → 1 linha visual (sem " / ")
- 4-5 palavras → 2 linhas com " / ", balanceadas por LARGURA, não por contagem de palavras. Exemplo bom: "AO TOCAR EM / SAIBA MAIS" (3+2 palavras mas larguras visuais similares).
- Coloque " / " no ponto que deixa as 2 linhas com **char-count parecido**.

QUANTIDADE: alvo ≈ ${input.pageCount} slides (pode variar +/- 10 pra preservar a copy. Total mais alto é OK — efeito é melhor com cortes rápidos).

Mood: ${input.mood} | Público: ${input.audience} | Idioma: ${input.language}.

COPY:
"""
${input.copy.trim()}
"""

Responda SOMENTE JSON válido sem markdown:
{"beats":[{"text":"...","weight":"hook"},{"text":"PALAVRA","weight":"punch"},...]}`;
}

export async function cutIntoBeats(input: CutInput): Promise<Beat[]> {
  if (!process.env.CLAUDE_KEY) {
    throw new Error("CLAUDE_KEY não configurada no .env.local");
  }
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 8000,
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
  return parsed.beats.map((b) => ({
    text: normalizePageText(b.text),
    weight: b.weight,
  }));
}
