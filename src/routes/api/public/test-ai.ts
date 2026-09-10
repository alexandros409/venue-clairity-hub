import { createFileRoute } from "@tanstack/react-router";
import { analyzeBottleneck } from "@/lib/hct/ai.functions";

export const Route = createFileRoute("/api/public/test-ai")({
  server: {
    handlers: {
      POST: async () => {
        const result = await analyzeBottleneck({
          data: {
            bottleneck:
              "Ο σερβιτόρος χαμογέλασε αυθόρμητα στον πελάτη καθώς έφερνε το πιάτο.",
            is_positive: true,
            observation_type: "positive",
          },
        });
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
