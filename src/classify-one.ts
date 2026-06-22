/**
 * Classify a single card photo — quick smoke test / demo.
 *   npm run classify -- /path/to/card.jpg
 */

import "dotenv/config";
import { classifyFinish, createClient, createPostHog } from "./classifier.js";

async function main() {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error("usage: npm run classify -- <path-to-card-image>");
    process.exit(1);
  }
  const posthog = createPostHog();
  const client = createClient(posthog);
  try {
    const c = await classifyFinish(client, imagePath, { distinctId: "manual-classify" });
    console.log(JSON.stringify(c, null, 2));
  } finally {
    await posthog.shutdown();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
