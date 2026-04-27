import type {
  PageDraft,
  PageElement,
  ProjectStyle,
  TemplateStyle,
} from "./types";

/**
 * Cada template aplica:
 *  - defaults visuais no projeto (cor de destaque, sombra/overlay)
 *  - função que enriquece cada PageDraft logo após a IA gerar (pra adicionar
 *    elementos automáticos tipo caixa de destaque atrás do hook, ou
 *    posicionar o vídeo só na metade superior).
 */

export interface TemplateMeta {
  id: TemplateStyle;
  label: string;
  description: string;
  exampleHint: string; // texto curto pra mostrar como aparece
}

export const TEMPLATES: TemplateMeta[] = [
  {
    id: "classico",
    label: "Clássico (HCOPY)",
    description:
      "Vídeo cobre todo canvas, texto sobreposto. Páginas alternam vídeo + fundo preto puro.",
    exampleHint: "Padrão tradicional — máxima imersão no vídeo",
  },
  {
    id: "destaque",
    label: "Destaque (HCPY Adaptado)",
    description:
      "Vídeo full canvas. Em ganchos e punches, o texto vem numa caixa retangular escura atrás (estilo card).",
    exampleHint: "Bom pra reforçar palavras-chave em formato de selo",
  },
  {
    id: "cinema",
    label: "Cinema (HDCOPY Novo)",
    description:
      "Vídeo cobre todo canvas, mas a metade inferior tem gradient suave fade pra preto. Texto fica no MEIO, atravessando a transição. Sem linha dura.",
    exampleHint: "Estilo cinematográfico — sombra densa segura a leitura sem cortar a imagem",
  },
];

/** Override do projectStyle baseado no template escolhido. */
export function templateProjectOverrides(
  template: TemplateStyle | undefined,
): Partial<ProjectStyle> {
  if (!template) return {};
  switch (template) {
    case "classico":
      return {};
    case "destaque":
      return {
        accentColor: "#ff3b3b",
        baseShadowBlur: 14,
        baseShadowOpacity: 0.55,
        baseOverlayOpacity: 0.45,
      };
    case "cinema":
      return {
        accentColor: "#d4af37",
        baseShadowBlur: 10,
        baseShadowOpacity: 0.4,
        baseOverlayOpacity: 0.0, // sem overlay porque o vídeo já está cropado
      };
  }
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Recebe a PageDraft saída da IA e enriquece com posicionamento de vídeo +
 * elementos automáticos do template.
 */
export function enrichPageWithTemplate(
  page: PageDraft,
  template: TemplateStyle | undefined,
  ctx: { accentColor: string },
): PageDraft {
  if (!template) return page;

  if (template === "classico") {
    return page; // defaults atuais — nada a mudar
  }

  if (template === "destaque") {
    // Em hooks e punches, adiciona uma caixa retangular escura atrás do texto.
    if (page.hideText) return page;
    if (page.weight !== "hook" && page.weight !== "punch") return page;

    const existingHasHighlight = (page.elements ?? []).some(
      (e) => e.shape === "rectangle" && e.color === "#000000" && e.opacity >= 0.55,
    );
    if (existingHasHighlight) return page;

    const highlight: PageElement = {
      id: newId(),
      shape: "rectangle",
      x: 0.07,
      y: 0.42,
      w: 0.86,
      h: 0.16,
      color: "#000000",
      opacity: 0.65,
      rotation: 0,
      borderRadius: 4,
      shadowBlur: 22,
      shadowOpacity: 0.7,
    };
    return {
      ...page,
      elements: [highlight, ...(page.elements ?? [])],
    };
  }

  if (template === "cinema") {
    // Vídeo COBRE TODO o canvas (sem crop). O efeito "metade preta com
    // sombra" é aplicado via gradient fade no overlay (em BeatScene quando
    // detecta projectStyle.template === "cinema"). Texto fica no centro
    // vertical do canvas — fica visualmente "no meio" da transição
    // vídeo → preto, com a sombra suavizando a borda.
    return page;
  }

  return page;
}
