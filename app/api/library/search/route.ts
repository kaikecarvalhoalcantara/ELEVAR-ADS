import { NextResponse } from "next/server";
import { searchPexelsVideos, pickBestVideoFile } from "../../../../lib/pexels";
import { dimensionsFor } from "../../../../lib/video-library";
import type { Format } from "../../../../lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("query");
  const format = (url.searchParams.get("format") ?? "9:16") as Format;
  // V32: paginação + perPage maior
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const perPage = Math.min(
    80,
    Math.max(10, parseInt(url.searchParams.get("perPage") ?? "80", 10) || 80),
  );
  if (!query) {
    return NextResponse.json({ ok: false, error: "query ausente" }, { status: 400 });
  }
  try {
    const videos = await searchPexelsVideos({
      query,
      orientation:
        format === "9:16"
          ? "portrait"
          : format === "16:9"
            ? "landscape"
            : "square",
      perPage,
      page,
    });
    const dims = dimensionsFor(format);
    const items = videos
      .map((v) => {
        const file = pickBestVideoFile(v, dims);
        return file
          ? {
              pexelsId: v.id,
              previewUrl: v.image,
              fileUrl: file.link,
              width: file.width,
              height: file.height,
              duration: v.duration,
            }
          : null;
      })
      .filter(Boolean);
    return NextResponse.json({
      ok: true,
      items,
      page,
      perPage,
      hasMore: items.length === perPage, // se devolveu o máximo, provavelmente tem mais
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
