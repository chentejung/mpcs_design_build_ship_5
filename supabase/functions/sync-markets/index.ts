// sync-markets: one Run of the worker (AGENTS.md → The worker).
// Supabase Cron calls this every 10 s with an x-cron-secret header. Each Run takes
// the run lock, refreshes the Catalog from gamma every ~5 minutes, fetches live
// Prices from the CLOB, saves only what changed, and records itself in worker_runs.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildCatalogPayload,
  type Category,
  CATALOG_LISTS,
  catalogDue,
  catalogUrl,
  chunk,
  CLOB,
  describeList,
  describePlaces,
  FETCH_TIMEOUT_MS,
  FINISHED_LOOKUP_CHUNK,
  finishedLookupUrl,
  MIDPOINT_CHUNK,
  parseCatalog,
  parseFinished,
  parseMidpoints,
  priceTargets,
} from "./logic.ts";

// The secret key bypasses RLS. It exists only in this function's environment.
function secretKey(): string {
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) return JSON.parse(keys).default;
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  throw new Error("no Supabase secret key in the environment");
}

const db = createClient(Deno.env.get("SUPABASE_URL")!, secretKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

type MarketRef = { id: string; token_id: string; closed: boolean; in_catalog: boolean; category: Category };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return await res.json();
}

async function loadMarkets(): Promise<MarketRef[]> {
  const { data, error } = await db.from("markets").select("id, token_id, closed, in_catalog, category");
  if (error) throw new Error(`load markets: ${error.message}`);
  return data as MarketRef[];
}

async function loadFollowed(): Promise<Set<string>> {
  const { data, error } = await db.from("follows").select("market_id");
  if (error) throw new Error(`load follows: ${error.message}`);
  return new Set(data.map((f) => f.market_id));
}

async function lastCatalogRefresh(): Promise<Date | null> {
  const { data, error } = await db.from("worker_runs").select("started_at")
    .eq("catalog_refreshed", true).order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`load last catalog refresh: ${error.message}`);
  return data ? new Date(data.started_at) : null;
}

/** Step 2: the Catalog. Problems become warnings; they never fail the Run. */
async function refreshCatalog(
  now: Date,
  markets: MarketRef[],
  followed: Set<string>,
  warnings: string[],
): Promise<{ refreshed: boolean; changed: number }> {
  const lists = [];
  const parts: string[] = [];
  for (const list of CATALOG_LISTS) {
    try {
      const parsed = parseCatalog(await fetchJson(catalogUrl(list)), list.category, now);
      lists.push({ category: list.category, rows: parsed.rows });
      parts.push(describeList(list.category, parsed));
    } catch (e) {
      warnings.push(`gamma ${list.category}: ${message(e)}`);
      parts.push(`${list.category} FAILED`);
    }
  }

  // Followed Markets outside the fresh Catalog: has any of them Finished?
  const inFreshCatalog = new Set(lists.flatMap((l) => l.rows.map((r) => r.id)));
  const byId = new Map(markets.map((m) => [m.id, m]));
  const lookup = [...followed].filter((id) => byId.get(id) && !byId.get(id)!.closed && !inFreshCatalog.has(id));
  const categoryById = new Map(lookup.map((id) => [id, byId.get(id)!.category]));
  const finished = [];
  for (const ids of chunk(lookup, FINISHED_LOOKUP_CHUNK)) {
    try {
      finished.push(...parseFinished(await fetchJson(finishedLookupUrl(ids)), categoryById, now).rows);
    } catch (e) {
      warnings.push(`gamma finished lookup: ${message(e)}`);
    }
  }
  parts.push(`finished ${finished.length}/${lookup.length} followed outside`);

  if (lists.length === 0 && finished.length === 0) {
    console.log(`catalog: ${parts.join(" · ")} → nothing to save`);
    return { refreshed: false, changed: 0 };
  }

  const payload = buildCatalogPayload(lists, finished);
  parts.push(describePlaces(payload.markets));
  const { data, error } = await db.rpc("upsert_catalog", { payload });
  if (error) {
    warnings.push(`upsert_catalog: ${error.message}`);
    console.log(`catalog: ${parts.join(" · ")} → upsert_catalog FAILED: ${error.message}`);
    return { refreshed: false, changed: 0 };
  }
  console.log(`catalog: ${parts.join(" · ")} → upsert_catalog changed ${data}`);
  return { refreshed: lists.length > 0, changed: data as number };
}

/** Step 3: live Prices. Any failure here fails the Run. */
async function refreshPrices(markets: MarketRef[], followed: Set<string>): Promise<number> {
  const marketByToken = priceTargets(markets, followed);
  const tokens = [...marketByToken.keys()];
  const prices: { id: string; price: number }[] = [];
  let rejected = 0;
  let failure: string | null = null;
  const chunks = chunk(tokens, MIDPOINT_CHUNK);
  for (const part of chunks) {
    try {
      const json = await fetchJson(`${CLOB}/midpoints`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(part.map((token_id) => ({ token_id }))),
      });
      const parsed = parseMidpoints(json, marketByToken);
      prices.push(...parsed.prices);
      rejected += parsed.rejected;
    } catch (e) {
      failure ??= `CLOB midpoints: ${message(e)}`;
    }
  }

  // Save what did arrive, even if a chunk failed.
  let changed = 0;
  if (prices.length > 0) {
    const { data, error } = await db.rpc("apply_prices", { prices });
    if (error) throw new Error(`apply_prices: ${error.message}`);
    changed = data as number;
  }
  console.log(
    `prices: ${tokens.length} tokens in ${chunks.length} chunk(s) → ${prices.length} midpoints` +
      ` (${rejected} rejected) → apply_prices changed ${changed}${failure ? ` · ${failure}` : ""}`,
  );
  if (failure) throw new Error(failure);
  return changed;
}

async function run() {
  const started = new Date();
  const warnings: string[] = [];
  let ok = false;
  let skipped = false;
  let rowsChanged = 0;
  let catalogRefreshed = false;
  let error: string | null = null;
  let holder: string | null = null;

  try {
    // Step 1: the run lock.
    const lock = await db.rpc("try_run_lock");
    if (lock.error) throw new Error(`try_run_lock: ${lock.error.message}`);
    if (!lock.data) {
      skipped = true;
      console.log("lock: a previous Run still holds it → skipped");
      return;
    }
    holder = lock.data as string;

    let [markets, followed] = await Promise.all([loadMarkets(), loadFollowed()]);
    const lastRefresh = await lastCatalogRefresh();
    console.log(
      `lock: acquired · ${markets.length} markets, ${followed.size} followed · last catalog ${
        lastRefresh ? `${Math.round((started.getTime() - lastRefresh.getTime()) / 1000)} s ago` : "never"
      }`,
    );

    // Step 2: the Catalog, every ~5 minutes.
    if (catalogDue(lastRefresh, started)) {
      const catalog = await refreshCatalog(started, markets, followed, warnings);
      catalogRefreshed = catalog.refreshed;
      rowsChanged += catalog.changed;
      if (catalog.changed > 0) markets = await loadMarkets();
    }

    // Step 3: Prices, every Run.
    rowsChanged += await refreshPrices(markets, followed);
    ok = true;
  } catch (e) {
    error = message(e);
  } finally {
    if (holder) {
      const release = await db.rpc("release_run_lock", { lock_holder: holder });
      if (release.error) warnings.push(`release_run_lock: ${release.error.message}`);
    }
    // Step 4: record the Run.
    const finished = new Date();
    const record = {
      started_at: started.toISOString(),
      finished_at: finished.toISOString(),
      ok,
      skipped,
      rows_changed: rowsChanged,
      catalog_refreshed: catalogRefreshed,
      warnings,
      error,
      duration_ms: finished.getTime() - started.getTime(),
    };
    const insert = await db.from("worker_runs").insert(record);
    console.log(
      `run: ${skipped ? "skipped" : ok ? "ok" : "FAILED"} · ${rowsChanged} rows changed · ` +
        `${record.duration_ms} ms${warnings.length ? ` · warnings: ${warnings.join("; ")}` : ""}` +
        `${error ? ` · error: ${error}` : ""}${insert.error ? ` · worker_runs insert FAILED: ${insert.error.message}` : ""}`,
    );
    // deno-lint-ignore no-unsafe-finally
    return record;
  }
}

// Only our Cron knows the secret: it lives in Vault, and Postgres checks the header.
async function fromCron(req: Request): Promise<boolean> {
  const candidate = req.headers.get("x-cron-secret");
  if (!candidate) return false;
  const { data, error } = await db.rpc("check_cron_secret", { candidate });
  if (error) console.log(`auth: check_cron_secret FAILED: ${error.message}`);
  return data === true;
}

Deno.serve(async (req) => {
  if (!(await fromCron(req))) return new Response("forbidden", { status: 401 });
  return Response.json(await run());
});
