import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { storagePath } from "./storage";
import type { ProjectDraft } from "./types";

let DRAFTS_ROOT = storagePath("drafts");

export function newDraftId(): string {
  return createHash("sha1")
    .update(`${Date.now()}-${Math.random()}`)
    .digest("hex")
    .slice(0, 12);
}

async function tryEnsureDir(dir: string): Promise<boolean> {
  try {
    await fs.mkdir(dir, { recursive: true });
    return true;
  } catch (err) {
    console.error(`[drafts] mkdir ${dir} falhou: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Garante que DRAFTS_ROOT seja escrevível em runtime.
 * Se falhar (ex: /data tem problema runtime), faz fallback dinâmico
 * pra /tmp/elevar-storage/drafts.
 */
async function ensureRoot(): Promise<void> {
  const ok = await tryEnsureDir(DRAFTS_ROOT);
  if (ok) return;

  // Fallback runtime
  const tmpRoot = resolve("/tmp/elevar-storage/drafts");
  console.warn(`[drafts] FALLBACK runtime — mudando DRAFTS_ROOT pra ${tmpRoot}`);
  const ok2 = await tryEnsureDir(tmpRoot);
  if (!ok2) {
    throw new Error(`Storage indisponível: nem ${DRAFTS_ROOT} nem ${tmpRoot}`);
  }
  DRAFTS_ROOT = tmpRoot;
}

function pathFor(id: string): string {
  if (!/^[a-f0-9]{6,}$/.test(id)) {
    throw new Error(`Draft id inválido: ${id}`);
  }
  return join(DRAFTS_ROOT, `${id}.json`);
}

const writeChains = new Map<string, Promise<unknown>>();

async function renameWithRetry(src: string, dest: string, attempts = 6): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      await fs.rename(src, dest);
      return true;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (
        (code === "EPERM" || code === "EBUSY" || code === "EACCES") &&
        i < attempts - 1
      ) {
        await new Promise((r) => setTimeout(r, 60 * (i + 1)));
        continue;
      }
      return false;
    }
  }
  return false;
}

export async function saveDraft(draft: ProjectDraft): Promise<void> {
  const prev = writeChains.get(draft.id) ?? Promise.resolve();
  const cur = prev
    .catch(() => undefined)
    .then(async () => {
      await ensureRoot();
      draft.updatedAt = Date.now();
      const target = pathFor(draft.id);
      const content = JSON.stringify(draft, null, 2);
      const tmp = `${target}.tmp.${process.pid}.${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      try {
        await fs.writeFile(tmp, content, "utf8");
        const renamed = await renameWithRetry(tmp, target);
        if (!renamed) {
          await fs.writeFile(target, content, "utf8");
          await fs.unlink(tmp).catch(() => undefined);
        }
      } catch (err) {
        await fs.unlink(tmp).catch(() => undefined);
        await fs.writeFile(target, content, "utf8");
      }
    });
  writeChains.set(draft.id, cur);
  await cur;
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

export async function loadDraft(id: string): Promise<ProjectDraft | null> {
  await ensureRoot();
  try {
    const raw = await fs.readFile(pathFor(id), "utf8");
    try {
      return JSON.parse(raw) as ProjectDraft;
    } catch {
      const trimmed = findFirstCompleteJSON(raw);
      if (trimmed) {
        try {
          const recovered = JSON.parse(trimmed) as ProjectDraft;
          await saveDraft(recovered);
          return recovered;
        } catch {
          // fallthrough
        }
      }
      throw new Error(
        "Draft corrompido. Crie um novo do zero.",
      );
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function listDrafts(): Promise<ProjectDraft[]> {
  await ensureRoot();
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
