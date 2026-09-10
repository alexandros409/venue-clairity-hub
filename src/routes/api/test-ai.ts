import { json } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { analyzeBottleneck } from "@/lib/hct/ai.functions";

export const Route = createFileRoute("/api/test-ai")({
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
        return json(result);
      },
    },
  },
});
