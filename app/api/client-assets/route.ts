import { NextResponse } from "next/server";
import { listClientAssets } from "../../../lib/client-assets";

export const runtime = "nodejs";

export async function GET() {
  try {
    const assets = await listClientAssets();
    return NextResponse.json({ ok: true, assets });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
