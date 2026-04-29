import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { storagePath } from "./storage";
import { getDb, isPostgresAvailable } from "./db";
import type { ProjectDraft } from "./types";

let DRAFTS_ROOT = storagePath("drafts");

export function newDraftId(): string {
  return createHash("sha1")
    .update(`${Date.now()}-${Math.random()}`)
    .digest("hex")
    .slice(0, 12);
}

/* ============================================================
 * MODE A: Postgres (preferido — persiste sempre)
 * ============================================================ */

async function saveDraftPg(draft: ProjectDraft): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Postgres indisponível");
  draft.updatedAt = Date.now();
  await db.query(
    `INSERT INTO drafts (id, data) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE
     SET data = EXCLUDED.data, updated_at = NOW()`,
    [draft.id, JSON.stringify(draft)],
  );
}

async function loadDraftPg(id: string): Promise<ProjectDraft | null> {
  const db = await getDb();
  if (!db) return null;
  const res = await db.query(`SELECT data FROM drafts WHERE id = $1`, [id]);
  if (res.rows.length === 0) return null;
  return res.rows[0].data as ProjectDraft;
}

async function listDraftsPg(): Promise<ProjectDraft[]> {
  const db = await getDb();
  if (!db) return [];
  const res = await db.query(
    `SELECT data FROM drafts ORDER BY updated_at DESC LIMIT 100`,
  );
  return res.rows.map((r) => r.data as ProjectDraft);
}

async function deleteDraftPg(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Postgres indisponível");
  await db.query(`DELETE FROM drafts WHERE id = $1`, [id]);
}

/* ============================================================
 * MODE B: Filesystem (fallback se Postgres não disponível)
 * ============================================================ */

async function tryEnsureDir(dir: string): Promise<boolean> {
  try {
    await fs.mkdir(dir, { recursive: true });
    return true;
  } catch (err) {
    console.error(`[drafts] mkdir ${dir} falhou: ${(err as Error).message}`);
    return false;
  }
}

async function ensureFileRoot(): Promise<void> {
  const ok = await tryEnsureDir(DRAFTS_ROOT);
  if (ok) return;
  const tmpRoot = resolve("/tmp/elevar-storage/drafts");
  console.warn(`[drafts] FALLBACK runtime — DRAFTS_ROOT pra ${tmpRoot}`);
  const ok2 = await tryEnsureDir(tmpRoot);
  if (!ok2) throw new Error(`Storage indisponível`);
  DRAFTS_ROOT = tmpRoot;
}

function pathFor(id: string): string {
  if (!/^[a-f0-9]{6,}$/.test(id)) {
    throw new Error(`Draft id inválido: ${id}`);
  }
  return join(DRAFTS_ROOT, `${id}.json`);
}

async function saveDraftFile(draft: ProjectDraft): Promise<void> {
  await ensureFileRoot();
  draft.updatedAt = Date.now();
  const target = pathFor(draft.id);
  const content = JSON.stringify(draft, null, 2);
  const tmp = `${target}.tmp.${process.pid}.${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  try {
    await fs.writeFile(tmp, content, "utf8");
    try {
      await fs.rename(tmp, target);
    } catch {
      await fs.writeFile(target, content, "utf8");
      await fs.unlink(tmp).catch(() => undefined);
    }
  } catch {
    await fs.unlink(tmp).catch(() => undefined);
    await fs.writeFile(target, content, "utf8");
  }
}

function findFirstCompleteJSON(raw: string): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  let started = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\" && inString) {
      escape = true;
      continue;
    }
    if (inString) {
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{" || c === "[") {
      depth++;
      started = true;
    } else if (c === "}" || c === "]") {
      depth--;
      if (started && depth === 0) {
        return raw.slice(0, i + 1);
      }
    }
  }
  return null;
}

async function loadDraftFile(id: string): Promise<ProjectDraft | null> {
  await ensureFileRoot();
  try {
    const raw = await fs.readFile(pathFor(id), "utf8");
    try {
      return JSON.parse(raw) as ProjectDraft;
    } catch {
      const trimmed = findFirstCompleteJSON(raw);
      if (trimmed) {
        try {
          const recovered = JSON.parse(trimmed) as ProjectDraft;
          await saveDraftFile(recovered);
          return recovered;
        } catch {
          // fallthrough
        }
      }
      throw new Error("Draft corrompido");
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function listDraftsFile(): Promise<ProjectDraft[]> {
  await ensureFileRoot();
  const entries = await fs.readdir(DRAFTS_ROOT);
  const drafts: ProjectDraft[] = [];
  for (const e of entries) {
    if (!e.endsWith(".json")) continue;
    if (e.includes(".tmp.")) continue;
    try {
      const raw = await fs.readFile(join(DRAFTS_ROOT, e), "utf8");
      drafts.push(JSON.parse(raw) as ProjectDraft);
    } catch {
      // skip
    }
  }
  return drafts.sort((a, b) => b.updatedAt - a.updatedAt);
}

/* ============================================================
 * Public API — escolhe Postgres se disponível, senão arquivo
 * ============================================================ */

const writeChains = new Map<string, Promise<unknown>>();

export async function saveDraft(draft: ProjectDraft): Promise<void> {
  const prev = writeChains.get(draft.id) ?? Promise.resolve();
  const cur = prev
    .catch(() => undefined)
    .then(async () => {
      if (isPostgresAvailable()) {
        try {
          await saveDraftPg(draft);
          return;
        } catch (err) {
          console.error(`[drafts] Postgres save falhou, fallback file: ${(err as Error).message}`);
        }
      }
      await saveDraftFile(draft);
    });
  writeChains.set(draft.id, cur);
  await cur;
}

export async function loadDraft(id: string): Promise<ProjectDraft | null> {
  if (isPostgresAvailable()) {
    try {
      return await loadDraftPg(id);
    } catch (err) {
      console.error(`[drafts] Postgres load falhou, fallback file: ${(err as Error).message}`);
    }
  }
  return loadDraftFile(id);
}

export async function listDrafts(): Promise<ProjectDraft[]> {
  if (isPostgresAvailable()) {
    try {
      return await listDraftsPg();
    } catch (err) {
      console.error(`[drafts] Postgres list falhou, fallback file: ${(err as Error).message}`);
    }
  }
  return listDraftsFile();
}

export async function deleteDraft(id: string): Promise<void> {
  if (isPostgresAvailable()) {
    try {
      await deleteDraftPg(id);
    } catch (err) {
      console.error(`[drafts] Postgres delete falhou, fallback file: ${(err as Error).message}`);
    }
  }
  // Sempre tenta apagar o arquivo também (caso esteja em ambos)
  try {
    await fs.unlink(pathFor(id));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[drafts] file delete falhou ${id}: ${(err as Error).message}`);
    }
  }
}
