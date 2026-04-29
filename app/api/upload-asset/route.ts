import { NextResponse } from "next/server";
import { saveUploadedFile } from "../../../lib/client-assets";
import { localPathToHttpUrl } from "../../../lib/http-utils";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { ok: false, error: "Esperado multipart/form-data" },
      { status: 400 },
    );
  }
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Campo 'file' ausente" },
        { status: 400 },
      );
    }
    const bytes = await file.arrayBuffer();
    const asset = await saveUploadedFile({
      originalName: file.name,
      bytes,
    });
    // V25: retorna URL pronta pro browser/Remotion
    const url = localPathToHttpUrl(asset.filepath);
    return NextResponse.json({ ok: true, asset, url });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
