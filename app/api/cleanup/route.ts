import { NextResponse } from "next/server";
import { cleanAllRenders, cleanOldRenders, getOutputStats } from "../../../lib/cleanup";

export const runtime = "nodejs";
export const maxDuration = 30;

interface Body {
  all?: boolean; // true = apaga TUDO; false/omit = só >24h
}

/**
 * GET /api/cleanup → estatísticas (quantos MP4s, quanto MB)
 * POST /api/cleanup { all: false } → apaga MP4s >24h
 * POST /api/cleanup { all: true }  → apaga TODOS os MP4s
 */
export async function GET() {
  const stats = await getOutputStats();
  return NextResponse.json({
    ok: true,
    fileCount: stats.fileCount,
    totalMB: +(stats.totalBytes / 1024 / 1024).toFixed(1),
    oldestHours: +(stats.oldestAgeMs / 3600000).toFixed(1),
  });
}

export async function POST(request: Request) {
  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    // empty OK
  }
  const result = body.all
    ? await cleanAllRenders()
    : await cleanOldRenders();
  return NextResponse.json({
    ok: true,
    deletedCount: result.deletedCount,
    freedMB: +(result.freedBytes / 1024 / 1024).toFixed(1),
    scanned: result.scanned,
    errors: result.errors,
  });
}
