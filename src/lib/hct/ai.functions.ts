import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, Output } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const Input = z.object({ bottleneck: z.string().min(4) });

const AnalysisSchema = z.object({
  problem_category: z.enum([
    "kitchen_pass",
    "billing_checkout",
    "service_flow",
    "staff_fatigue",
    "leadership_boundaries",
  ]),
  diagnosis_type: z.enum(["structure", "emotion", "both"]),
  estimated_loss_eur: z.number().nonnegative(),
  bsps_solution: z.enum(["BSPS-01", "BSPS-02", "BSPS-03"]),
  actionable_steps: z.array(z.string()).length(3),
});

export const analyzeBottleneck = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createOpenAICompatible({
      name: "lovable",
      baseURL: "https://ai.gateway.lovable.dev/v1",
      headers: {
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
    });

    const { experimental_output } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      experimental_output: Output.object({ schema: AnalysisSchema }),
      system:
        "You are HCT (Hospitality Diagnostic Tool), a restaurant operations auditor for Alexandros Chatziliadis. " +
        "Diagnose a single operational bottleneck observed during a restaurant shift. " +
        "Map to one problem_category, one diagnosis_type (structure / emotion / both), " +
        "estimate the audited financial loss in EUR per shift (a single number, conservative), " +
        "recommend one BSPS module, and write exactly three short imperative actionable_steps. " +
        "Be precise, B2B, no fluff.",
      prompt: `Bottleneck observed:\n"""${data.bottleneck}"""`,
    });

    return experimental_output;
  });
