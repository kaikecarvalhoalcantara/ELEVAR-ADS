import type { Padrao, ParsedAd, ParsedDoc } from "./types";

// Matches: "AD 01", "ADS 01", "ANUNCIO 01", "ANÚNCIO 01", with optional
// " - PADRÃO HDCPY" suffix. Case-insensitive. Number can have leading zeros.
const AD_HEADER = /^\s*(?:AD|ADS|ANUNCIO|ANÚNCIO)\s*0*(\d+)(?:\s*[-–—:]?\s*PADR[ÃA]O\s+(\w+))?\s*$/im;
const AD_HEADER_GLOBAL = new RegExp(AD_HEADER.source, "gim");
const COPY_MARKER = /^\s*AN[ÚU]NCIO\s+COMPLETO\s*$/im;
const DESC_MARKER = /^\s*(?:📌\s*)?DESCRI[ÇC][ÃA]O\s*:?/im;

function normalizePadrao(raw: string | undefined | null): Padrao {
  if (!raw) return "HDCPY";
  const u = raw.toUpperCase();
  if (u === "HDCPY") return "HDCPY";
  if (u === "EXPERT") return "EXPERT";
  if (u === "MERCADO") return "MERCADO";
  return "HDCPY";
}

function extractHeader(headerBlock: string): { cliente: string; nicho: string; nome: string } {
  const lines = headerBlock
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return {
    cliente: lines[0] ?? "",
    nicho: lines[1] ?? "",
    nome: lines[2] ?? "",
  };
}

function extractCopy(adBody: string): { description: string; copy: string } {
  const copyMatch = adBody.match(COPY_MARKER);
  if (!copyMatch || copyMatch.index === undefined) {
    return { description: "", copy: adBody.trim() };
  }
  const beforeCopy = adBody.slice(0, copyMatch.index);
  const afterCopy = adBody.slice(copyMatch.index + copyMatch[0].length).trim();

  const descMatch = beforeCopy.match(DESC_MARKER);
  let description = "";
  if (descMatch && descMatch.index !== undefined) {
    description = beforeCopy
      .slice(descMatch.index + descMatch[0].length)
      .trim();
  }
  return { description, copy: afterCopy };
}

export function parseSourceDoc(text: string): ParsedDoc {
  const normalized = text.replace(/\r\n/g, "\n");
  const matches = [...normalized.matchAll(AD_HEADER_GLOBAL)];

  const headerEnd = matches[0]?.index ?? normalized.length;
  const headerBlock = normalized.slice(0, headerEnd);
  const { cliente, nicho, nome } = extractHeader(headerBlock);

  const ads: ParsedAd[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : normalized.length;
    const body = normalized.slice(start, end);
    const { description, copy } = extractCopy(body);
    ads.push({
      number: parseInt(m[1]!, 10),
      padrao: normalizePadrao(m[2]),
      description,
      copy,
    });
  }

  return { cliente, nicho, nome, ads };
}
