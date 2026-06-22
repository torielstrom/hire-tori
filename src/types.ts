/** The three foil finishes a vision model can actually distinguish from a photo. */
export type Finish = "normal" | "holo" | "reverse";

export const FINISHES: Finish[] = ["normal", "holo", "reverse"];

/** tcg-lister stores 7 `printing` values; for finish detection they collapse to 3.
 * (1st-edition / unlimited are *stamps*, orthogonal to foil — we fold them into
 * their foil class so the eval measures the thing the model can see.) */
export function toFinish(printing: string | null | undefined): Finish | null {
  switch ((printing || "").toLowerCase()) {
    case "normal":
    case "unlimited":
    case "first-edition":
      return "normal";
    case "holo":
    case "first-edition-holo":
    case "unlimited-holo":
      return "holo";
    case "reverse":
      return "reverse";
    default:
      return null;
  }
}

export interface Classification {
  finish: Finish;
  confidence: number; // 0..1
  reasoning: string;
}

export interface LabeledSample {
  cardId: string | null;
  cardName: string | null;
  label: Finish;
  imagePath?: string; // set by the local source
  remoteKey?: string; // set by the R2 source
}
