import { NextResponse } from "next/server";
import { saveUploadedFile } from "../../../lib/client-assets";

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
    return NextResponse.json({ ok: true, asset });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
