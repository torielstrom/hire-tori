/**
 * R2 data source — reads the *real* Cloudflare dataset via your existing wrangler
 * login. No S3 token required: this shells out to `wrangler r2 object get --remote`
 * using the same OAuth that `tcg-lister/r2Mirror.ts` used to upload the data.
 *
 * tcg-lister keeps a self-describing `manifest.jsonl` in the `tcg-lister-training`
 * bucket (one row per image: remote_key + label + card metadata), so labels and
 * images both come straight from R2 — nothing local needed.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { FINISHES, toFinish, type Finish, type LabeledSample } from "./types.js";

const BUCKET = process.env.R2_TRAINING_BUCKET || "tcg-lister-training";

/** Prefer a locally-installed wrangler (fast); fall back to npx. */
function wrangler(): { cmd: string; pre: string[] } {
  const local = resolve(process.cwd(), "node_modules/.bin/wrangler");
  return existsSync(local) ? { cmd: local, pre: [] } : { cmd: "npx", pre: ["--yes", "wrangler"] };
}

function run(args: string[]): Promise<void> {
  const { cmd, pre } = wrangler();
  return new Promise((res, rej) => {
    const p = spawn(cmd, [...pre, ...args], { stdio: ["ignore", "ignore", "pipe"] });
    const err: Buffer[] = [];
    p.stderr.on("data", (b) => err.push(b));
    p.on("error", rej);
    p.on("close", (c) =>
      c === 0 ? res() : rej(new Error(`wrangler ${args.slice(0, 3).join(" ")} exited ${c}: ${Buffer.concat(err).toString().slice(0, 200)}`)),
    );
  });
}

let _cache: string | null = null;
function cacheDir(): string {
  if (!_cache) _cache = mkdtempSync(join(tmpdir(), "tcg-r2-"));
  return _cache;
}

/** Download an object once (cached for the run) and return its bytes. */
async function objectGet(key: string): Promise<Buffer> {
  const dest = join(cacheDir(), key.replace(/\//g, "__"));
  if (!existsSync(dest)) await run(["r2", "object", "get", `${BUCKET}/${key}`, "--file", dest, "--remote"]);
  return readFile(dest);
}

interface ManifestRow {
  remote_key: string;
  printing: string | null;
  card_id: string | null;
  card_name: string | null;
}

/** Pull manifest.jsonl, keep front images with a known finish, balance per class. */
export async function loadR2Samples(perClass: number): Promise<LabeledSample[]> {
  const text = (await objectGet("manifest.jsonl")).toString("utf8");
  const rows = text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as ManifestRow);

  const byFinish: Record<Finish, LabeledSample[]> = { normal: [], holo: [], reverse: [] };
  for (const r of rows) {
    if (!r.remote_key || !r.remote_key.endsWith("__front.jpg")) continue; // foil reads off the front
    const label = toFinish(r.printing);
    if (!label) continue;
    byFinish[label].push({ cardId: r.card_id, cardName: r.card_name, label, remoteKey: r.remote_key });
  }

  const out: LabeledSample[] = [];
  for (const f of FINISHES) out.push(...shuffle(byFinish[f]).slice(0, perClass));
  return shuffle(out);
}

export function fetchR2Image(remoteKey: string): Promise<Buffer> {
  return objectGet(remoteKey);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
