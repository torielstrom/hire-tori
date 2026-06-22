/**
 * Pluggable data source for the eval: Cloudflare R2 (default) or local files.
 * Both yield the same labeled cards + image bytes; pick via DATA_SOURCE env.
 */

import { readFile } from "node:fs/promises";
import { loadLabeledSamples } from "./data.js";
import { fetchR2Image, loadR2Samples } from "./r2.js";
import type { LabeledSample } from "./types.js";

export interface DataSource {
  name: string;
  load(perClass: number): Promise<LabeledSample[]>;
  image(sample: LabeledSample): Promise<Buffer>;
}

export function getDataSource(): DataSource {
  const which = (process.env.DATA_SOURCE || "r2").toLowerCase();
  if (which === "local") {
    return {
      name: "local",
      load: async (n) => loadLabeledSamples(n),
      image: (s) => readFile(s.imagePath!),
    };
  }
  return {
    name: "r2",
    load: (n) => loadR2Samples(n),
    image: (s) => fetchR2Image(s.remoteKey!),
  };
}
