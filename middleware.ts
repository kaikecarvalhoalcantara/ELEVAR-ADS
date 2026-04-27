import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, sha256Hex } from "./lib/auth";

// Rotas que NÃO precisam de auth:
// - login UI + API
// - /api/local-video: o Chromium do Remotion (rodando no mesmo container)
//   precisa baixar os vídeos sem cookie. Path traversal já é protegido.
const PUBLIC_PATHS = new Set<string>([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/api/local-video/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/favicon.ico") return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const cookieValue = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  const authPassword = process.env.AUTH_PASSWORD;

  // Se nenhuma senha configurada no servidor, libera tudo (modo dev sem proteção)
  if (!authPassword) {
    return NextResponse.next();
  }

  const expected = await sha256Hex(authPassword);
  if (cookieValue === expected) {
    return NextResponse.next();
  }

  // Não autenticado
  if (pathname.startsWith("/api/")) {
    return new NextResponse(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
