import { NextResponse } from "next/server";
import { saveUploadedFile } from "../../../lib/client-assets";
import { localPathToHttpUrl } from "../../../lib/http-utils";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * V30: Aceita 2 formas de upload:
 *
 * 1) RAW BODY (preferido pra arquivos grandes — evita FormData parsing
 *    que falha com WhatsApp 20-50MB):
 *    PUT/POST com Content-Type = video/mp4 (ou outro)
 *    Header X-Filename = "WhatsApp Video xxx.mp4"
 *    Body = bytes do arquivo direto
 *
 * 2) MULTIPART/FORM-DATA (legado, ainda funciona pra arquivos pequenos):
 *    POST com Content-Type = multipart/form-data
 *    Field "file" com o File
 */
async function handleUpload(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  try {
    let originalName: string;
    let bytes: ArrayBuffer;

    if (contentType.includes("multipart/form-data")) {
      // Modo legado: FormData
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json(
          { ok: false, error: "Campo 'file' ausente" },
          { status: 400 },
        );
      }
      originalName = file.name;
      bytes = await file.arrayBuffer();
    } else {
      // Modo raw body — Cliente manda o file direto, filename via header
      const filename = request.headers.get("x-filename");
      if (!filename) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Header 'X-Filename' ausente. Envie o nome do arquivo no header.",
          },
          { status: 400 },
        );
      }
      originalName = decodeURIComponent(filename);
      // Lê o body inteiro como ArrayBuffer (Next.js já streama internamente)
      bytes = await request.arrayBuffer();
      if (bytes.byteLength === 0) {
        return NextResponse.json(
          { ok: false, error: "Arquivo vazio" },
          { status: 400 },
        );
      }
    }

    const asset = await saveUploadedFile({ originalName, bytes });
    const url = localPathToHttpUrl(asset.filepath);
    return NextResponse.json({ ok: true, asset, url });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return handleUpload(request);
}

export async function PUT(request: Request) {
  return handleUpload(request);
}
