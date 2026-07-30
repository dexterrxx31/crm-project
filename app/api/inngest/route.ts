import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { embedSourceOnChange } from "@/lib/inngest/functions/embed-source";
import { nightlyScoringSweep } from "@/lib/inngest/functions/nightly-scoring-sweep";
import { scoreDealOnRequest } from "@/lib/inngest/functions/score-deal";
import { scoreLeadOnRequest } from "@/lib/inngest/functions/score-lead";

/**
 * Registers every background function with Inngest. In local dev, `bun run
 * inngest:dev` starts the Inngest Dev Server, which polls this endpoint to
 * discover functions and drives them — see README for the two-process setup.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [scoreLeadOnRequest, scoreDealOnRequest, embedSourceOnChange, nightlyScoringSweep],
});
