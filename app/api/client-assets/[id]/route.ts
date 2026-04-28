import { NextResponse } from "next/server";
import { deleteAsset, updateAsset } from "../../../../lib/client-assets";
import type { AssetUpdate } from "../../../../lib/client-assets";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: AssetUpdate = {};
  try {
    body = (await request.json()) as AssetUpdate;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }
  try {
    const asset = await updateAsset(id, body);
    return NextResponse.json({ ok: true, asset });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await deleteAsset(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
