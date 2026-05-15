import { Pool } from "pg";
import type { Pool as PoolType } from "pg";

let pool: PoolType | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Retorna o pool Postgres se DATABASE_URL estiver configurada.
 * Auto-cria a tabela `drafts` na primeira chamada.
 */
export async function getDb(): Promise<PoolType | null> {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!pool) {
    // V88: detecta localhost — Postgres nativo Windows não usa SSL.
    // Railway interno também não. Demais (Neon, Supabase, etc) usam.
    const isLocal =
      url.includes("localhost") ||
      url.includes("127.0.0.1") ||
      url.includes("railway.internal");
    pool = new Pool({
      connectionString: url,
      max: 5,
      idleTimeoutMillis: 30000,
      ssl: isLocal ? false : { rejectUnauthorized: false },
    });
    pool.on("error", (err) => console.error("[db] pool error:", err));
  }
  if (!initPromise) {
    initPromise = (async () => {
      try {
        await pool!.query(`
          CREATE TABLE IF NOT EXISTS drafts (
            id TEXT PRIMARY KEY,
            data JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);
        console.log("[db] ✓ Postgres conectado, tabela drafts pronta");
      } catch (err) {
        console.error("[db] init falhou:", err);
        initPromise = null; // re-tenta na próxima
        throw err;
      }
    })();
  }
  await initPromise;
  return pool;
}

export function isPostgresAvailable(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
