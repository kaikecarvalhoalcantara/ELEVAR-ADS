import { useEffect, useState } from "react";
import { continueRender, delayRender } from "remotion";

/**
 * V64: Carrega Google Fonts no servidor de render (Chromium do Remotion).
 *
 * O editor (browser do user) injeta <link rel="stylesheet"> no <head> via
 * useEffect, então as fontes carregam normalmente. Mas o Chromium do
 * Remotion server-side é um ambiente diferente — sem o link, a fonte cai
 * pro fallback do sistema (geralmente Arial), e o MP4 final fica diferente
 * do preview do editor.
 *
 * Solução: este componente é montado dentro do <Composition>, injeta o
 * <link> no <head> e usa delayRender() pra bloquear o render até as
 * fontes terem carregado de fato (document.fonts.ready).
 */
export const FontLoader: React.FC<{ families: string[] }> = ({ families }) => {
  const [handle] = useState(() => delayRender("Loading Google Fonts"));

  useEffect(() => {
    if (typeof document === "undefined") {
      continueRender(handle);
      return;
    }

    // Constrói URL do Google Fonts CSS2 com os families pedidos.
    // Carrega weights 400, 700, 900 pra cobrir hook (bold) + transition (regular).
    const cleanFamilies = families
      .filter((f) => f && f.trim())
      .map((f) => f.replace(/\s+/g, "+"));

    if (cleanFamilies.length === 0) {
      continueRender(handle);
      return;
    }

    const params = cleanFamilies
      .map((f) => `family=${f}:wght@400;700;900`)
      .join("&");
    const url = `https://fonts.googleapis.com/css2?${params}&display=block`;

    // Adiciona link no head (idempotente — mesmo URL = mesmo elemento)
    const linkId = `remotion-font-${cleanFamilies.join("-")}`;
    let link = document.getElementById(linkId) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      link.href = url;
      document.head.appendChild(link);
    }

    // Espera o CSS carregar E as fontes ficarem disponíveis no document.fonts
    let cancelled = false;
    const checkFonts = async () => {
      try {
        // 1. Espera o link CSS carregar
        if (!link!.sheet) {
          await new Promise<void>((resolve) => {
            link!.addEventListener("load", () => resolve(), { once: true });
            link!.addEventListener("error", () => resolve(), { once: true });
            // Timeout 8s — se não carregar, libera com fallback
            setTimeout(() => resolve(), 8000);
          });
        }
        // 2. Espera document.fonts.ready
        if (document.fonts && document.fonts.ready) {
          await document.fonts.ready;
        }
        if (!cancelled) continueRender(handle);
      } catch {
        if (!cancelled) continueRender(handle);
      }
    };
    void checkFonts();

    return () => {
      cancelled = true;
    };
  }, [handle, families]);

  return null;
};
