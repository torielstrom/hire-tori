/**
 * Loads ground-truth labeled card photos from tcg-lister.
 *
 * tcg-lister retains every committed scan as a labeled training sample:
 *   training_samples(card_id, printing, image_path, ...)  [schema.sql:164-189]
 * `printing` is the operator-confirmed finish, `image_path` is the real photo.
 * That's our eval set — no synthetic data, just cards Tori actually scanned.
 */

import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import { FINISHES, toFinish, type Finish, type LabeledSample } from "./types.js";

function tcgDir(): string {
  const d = process.env.TCG_LISTER_DIR;
  if (!d) throw new Error("TCG_LISTER_DIR not set (path to your tcg-lister project)");
  return d;
}

/** Resolve a stored image_path to a file that actually exists.
 * The DB holds absolute paths from before the project moved, so we fall back to
 * matching by basename inside TRAINING_IMAGES_DIR (and a couple of sane defaults). */
function resolveImage(p: string): string {
  if (existsSync(p)) return p;
  const base = basename(p);
  const dirs = [
    process.env.TRAINING_IMAGES_DIR,
    join(tcgDir(), "data", "training", "images"),
  ].filter(Boolean) as string[];
  for (const d of dirs) {
    const candidate = join(d, base);
    if (existsSync(candidate)) return candidate;
  }
  const rel = isAbsolute(p) ? p : join(tcgDir(), p);
  return rel; // may not exist; caller filters
}

interface Row {
  card_id: string | null;
  detected_name: string | null;
  printing: string | null;
  image_path: string | null;
}

/** Pull labeled samples, balanced across normal/holo/reverse so the confusion
 * matrix is meaningful (an all-"normal" set would flatter the model). */
export function loadLabeledSamples(perClass: number): LabeledSample[] {
  const dbPath = join(tcgDir(), "data", "inventory.db");
  if (!existsSync(dbPath)) throw new Error(`inventory.db not found at ${dbPath}`);

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  let rows: Row[] = [];
  try {
    rows = db
      .prepare(
        `SELECT card_id, detected_name, printing, image_path
         FROM training_samples
         WHERE printing IS NOT NULL AND image_path IS NOT NULL AND side = 'front'`,
      )
      .all() as Row[];
  } finally {
    db.close();
  }

  // Bucket by collapsed finish, keeping only rows whose image file is on disk.
  const byFinish: Record<Finish, LabeledSample[]> = { normal: [], holo: [], reverse: [] };
  for (const r of rows) {
    const label = toFinish(r.printing);
    if (!label || !r.image_path) continue;
    const imagePath = resolveImage(r.image_path);
    if (!existsSync(imagePath)) continue;
    byFinish[label].push({ cardId: r.card_id, cardName: r.detected_name, imagePath, label });
  }

  const out: LabeledSample[] = [];
  for (const f of FINISHES) {
    out.push(...shuffle(byFinish[f]).slice(0, perClass));
  }
  return shuffle(out);
}

export function countByLabel(samples: LabeledSample[]): Record<Finish, number> {
  const c: Record<Finish, number> = { normal: 0, holo: 0, reverse: 0 };
  for (const s of samples) c[s.label]++;
  return c;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
