import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, AUTH_MAX_AGE_DAYS, sha256Hex } from "../../../../lib/auth";

export const runtime = "nodejs";

interface Body {
  password?: string;
}

export async function POST(request: Request) {
  const expected = process.env.AUTH_PASSWORD;
  if (!expected) {
    // Sem senha configurada — libera, mas avisa
    return NextResponse.json({
      ok: true,
      warning: "AUTH_PASSWORD não configurada — site público",
    });
  }
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }
  if (!body.password || body.password !== expected) {
    return NextResponse.json({ ok: false, error: "Senha incorreta" }, { status: 401 });
  }
  const hash = await sha256Hex(body.password);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE_NAME, hash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * AUTH_MAX_AGE_DAYS,
  });
  return res;
}
