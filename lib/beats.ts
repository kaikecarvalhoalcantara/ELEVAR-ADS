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

const SYSTEM = `Você corta copy de anúncio em SLIDES pra vídeo cinematográfico vertical. Cada slide tem 4-6 palavras (alvo) — pulsos médios pra leitura confortável. Você é EXTREMAMENTE FIEL à copy original — não inventa, NÃO RESUME, NÃO OMITE palavras.`;

function buildPrompt(input: CutInput): string {
  const [cta1, cta2] = CTA_BY_LANG[input.language];
  return `Quebra a copy abaixo em SLIDES. Cada slide = 1 página do vídeo final.

⚠️⚠️⚠️ REGRA FUNDAMENTAL — NÃO PERCA PALAVRAS ⚠️⚠️⚠️
TODA palavra do copy original DEVE estar em algum slide. Não resuma, não
parafraseie, não omita, não pule frase. Se a copy tem 200 palavras, todos
os slides juntos têm que ter ≈200 palavras (mínimo 95% das palavras).
A IA QUE PERDE PALAVRAS QUEBRA ANÚNCIO.

✅ BOM: copy "Eu nunca imaginei que uma simples decisão pudesse mudar
   completamente minha vida em apenas 30 dias" →
   Slide 1: "Eu nunca imaginei que" (4 palavras)
   Slide 2: "Uma simples decisão" (3 palavras)
   Slide 3: "Pudesse mudar completamente" (3 palavras)
   Slide 4: "Minha vida em apenas" (4 palavras)
   Slide 5: "30 DIAS" (punch curto)

❌ RUIM (perde palavras): a IA fez:
   Slide 1: "UMA DECISÃO"
   Slide 2: "MUDOU MINHA VIDA"
   ← perdeu "nunca imaginei", "simples", "completamente", "apenas", etc.
   PROIBIDO.

🎯 V64 — DISTRIBUIÇÃO DE PALAVRAS POR SLIDE:
- **4-6 palavras é o alvo** (~70% dos slides)
- 2-3 palavras só pra **PUNCH ISOLADO** (palavra-chave única em CAIXA ALTA,
  tipo "DECISÃO", "30 DIAS", "AGORA"). Use com moderação.
- 7 palavras só excepcionalmente (frase completa que quebraria mal).
- **EVITE slides com 2-3 palavras a menos que seja punch dramático.**
  Antes você fazia muito "DEVENDO", "SOZINHO", "CHORA" — picado demais.
  Prefira frases mais inteiras: "VOCÊ ESTAVA DEVENDO TUDO" (5 palavras).

REGRAS DURAS:
1. Cada slide tem **4-6 palavras** (alvo). Punch isolado pode ter 1-3.
2. Frase longa do original vira VÁRIOS slides consecutivos.
3. Quando faz sentido, isola UMA palavra-chave em CAIXA ALTA num slide só.
4. Ordem ORIGINAL preservada SEMPRE.
5. Sem linhas em branco.
6. As 2 últimas linhas DEVEM ser exatamente: "${cta1}" e "${cta2}" (ambas weight "punch").

DISTRIBUIÇÃO DE WEIGHT:
- **"hook" ≈ 60%** — frases de 4-6 palavras em uppercase bold.
- **"punch" ≈ 35%** — palavra-chave isolada em CAPS (1-3 palavras), climax, CTA.
- **"transition" ≈ 5%** — APENAS pra frases narrativas em sentence-case.

QUEBRA DENTRO DO SLIDE (em até 2 linhas com " / "):
- 1-3 palavras → 1 linha visual (sem " / ")
- 4-6 palavras → pode ser 1 linha OU 2 linhas com " / ", balanceadas por
  LARGURA visual (char-count similar entre as 2 linhas).
  Ex 4 palavras: "VOCÊ NUNCA / IMAGINOU ISSO".
  Ex 5 palavras: "EM APENAS / 30 DIAS DE TESTES".
- Coloca " / " no ponto que deixa as 2 linhas com **char-count parecido**.

QUANTIDADE: gera **TANTOS slides quanto necessário** pra caber TUDO da copy.
Total maior é OK. Pode passar de 30, 50, 80 slides se a copy for longa.

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

  // V64: Validação — exige 95% de cobertura. Se < 95%, faz 2ª chamada
  // pedindo pra IA refazer com instrução explícita de não cortar.
  const originalWords = countWords(input.copy);
  const beatsWords = beats.reduce((sum, b) => sum + countWords(b.text), 0);
  const ratio = beatsWords / Math.max(1, originalWords);

  if (ratio >= 0.95) {
    console.log(`[beats] ✓ cobertura ${Math.round(ratio * 100)}% — preservou tudo`);
    return beats;
  }

  // 2ª passada — pede pra IA refazer, listando palavras perdidas
  console.warn(
    `[beats] ⚠️ cobertura ${Math.round(ratio * 100)}% (${beatsWords}/${originalWords}) < 95% — refazendo…`,
  );
  const beatsText = beats.map((b) => b.text).join(" ").toLowerCase();
  const originalLower = input.copy.toLowerCase();
  const missingWords = (originalLower.match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (w) => w.length >= 3 && !beatsText.includes(w),
  );

  const retryPrompt = `Você gerou ${beats.length} slides mas PERDEU PALAVRAS da copy original (${Math.round(ratio * 100)}% cobertura — preciso de 95%+).

Palavras que ficaram FORA dos slides: ${missingWords.slice(0, 30).join(", ")}${missingWords.length > 30 ? "..." : ""}

Refaça os slides INCLUINDO essas palavras nos lugares apropriados.
Mantém a estrutura (4-6 palavras por slide, hook/punch/transition).
Mantém a ordem original da copy.

Responde SOMENTE JSON: {"beats":[...]}`;

  try {
    const retryRes = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 16000,
      system: SYSTEM,
      messages: [
        { role: "user", content: buildPrompt(input) },
        {
          role: "assistant",
          content: JSON.stringify({ beats: parsed.beats }),
        },
        { role: "user", content: retryPrompt },
      ],
    });
    const retryBlock = retryRes.content.find((b) => b.type === "text");
    if (retryBlock && retryBlock.type === "text") {
      const retryRaw = retryBlock.text.trim();
      const rs = retryRaw.indexOf("{");
      const re = retryRaw.lastIndexOf("}");
      if (rs >= 0 && re >= 0) {
        const retryParsed = JSON.parse(retryRaw.slice(rs, re + 1)) as {
          beats: Beat[];
        };
        if (Array.isArray(retryParsed.beats) && retryParsed.beats.length >= 8) {
          const retryBeats = retryParsed.beats.map((b) => ({
            text: normalizePageText(b.text),
            weight: b.weight,
          }));
          const newRatio =
            retryBeats.reduce((sum, b) => sum + countWords(b.text), 0) /
            Math.max(1, originalWords);
          if (newRatio > ratio) {
            console.log(
              `[beats] ✓ retry melhorou: ${Math.round(ratio * 100)}% → ${Math.round(newRatio * 100)}%`,
            );
            return retryBeats;
          }
        }
      }
    }
  } catch (err) {
    console.warn(`[beats] retry falhou: ${(err as Error).message}`);
  }
  // Se retry falhou ou não melhorou, devolve o original mesmo
  console.warn(`[beats] retry não melhorou — usando primeira versão (${Math.round(ratio * 100)}%)`);
  return beats;
}
