import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// Supported output languages for AI-generated content.
// Phase 1: only `actionable_steps` is localized, and only Greek is wired in the UI.
// Phase 2: a language selector in the UI will pass `language` to localize
// problem category labels, diagnosis explanation, and actionable steps.
export const AI_OUTPUT_LANGUAGES = ["el", "de", "en"] as const;
export type AiOutputLanguage = (typeof AI_OUTPUT_LANGUAGES)[number];
export const DEFAULT_AI_OUTPUT_LANGUAGE: AiOutputLanguage = "el";

const LANGUAGE_NAME: Record<AiOutputLanguage, string> = {
  el: "Greek (Ελληνικά)",
  de: "German (Deutsch)",
  en: "English",
};

const Input = z.object({
  bottleneck: z.string().min(4),
  language: z.enum(AI_OUTPUT_LANGUAGES).optional(),
  is_positive: z.boolean().optional(),
});

const CATEGORIES = [
  "kitchen_pass",
  "billing_checkout",
  "service_flow",
  "staff_fatigue",
  "leadership_boundaries",
] as const;
const DIAGNOSES = ["structure", "emotion", "both"] as const;
const BSPS = ["BSPS-01", "BSPS-02", "BSPS-03"] as const;

const AnalysisSchema = z.object({
  problem_category: z.enum(CATEGORIES),
  diagnosis_type: z.enum(DIAGNOSES),
  estimated_loss_eur: z.number().nonnegative(),
  bsps_solution: z.enum(BSPS),
  actionable_steps: z.array(z.string()).min(1),
});

export type Analysis = z.infer<typeof AnalysisSchema>;

function extractJson(raw: string): unknown {
  let s = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = s.search(/[{[]/);
  const openChar = start !== -1 ? s[start] : "";
  const endChar = openChar === "[" ? "]" : "}";
  const end = s.lastIndexOf(endChar);
  if (start === -1 || end === -1) throw new Error("No JSON found in model response");
  s = s.substring(start, end + 1);
  try {
    return JSON.parse(s);
  } catch {
    const repaired = s
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]")
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, "");
    return JSON.parse(repaired);
  }
}

function coerce(obj: Record<string, unknown>): Analysis {
  const pickEnum = <T extends readonly string[]>(
    val: unknown,
    list: T,
    fallback: T[number],
  ): T[number] => {
    if (typeof val !== "string") return fallback;
    const v = val.toLowerCase().replace(/[\s_-]+/g, "_");
    const hit = list.find((x) => x.toLowerCase() === v || v.includes(x.toLowerCase()));
    return (hit as T[number]) ?? fallback;
  };

  const num = (v: unknown): number => {
    if (typeof v === "number") return Math.max(0, v);
    if (typeof v === "string") {
      // strip currency, spaces, thousand separators (both . and ,)
      const cleaned = v.replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
      const n = parseFloat(cleaned);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    }
    return 0;
  };

  const steps = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.map(String).filter(Boolean).slice(0, 5);
    if (typeof v === "string") return v.split(/\n+/).map((s) => s.trim()).filter(Boolean).slice(0, 5);
    return [];
  };

  let bsps = pickEnum(obj.bsps_solution, BSPS, "BSPS-01");
  if (typeof obj.bsps_solution === "string") {
    const m = obj.bsps_solution.match(/BSPS[\s-]?0?([123])/i);
    if (m) bsps = `BSPS-0${m[1]}` as (typeof BSPS)[number];
  }

  const candidate = {
    problem_category: pickEnum(obj.problem_category, CATEGORIES, "service_flow"),
    diagnosis_type: pickEnum(obj.diagnosis_type, DIAGNOSES, "both"),
    estimated_loss_eur: num(obj.estimated_loss_eur),
    bsps_solution: bsps,
    actionable_steps: steps(obj.actionable_steps),
  };
  if (candidate.actionable_steps.length === 0) {
    candidate.actionable_steps = [
      "Συζητήστε την παρατήρηση με τον υπεύθυνο βάρδιας και ορίστε διορθωτική ενέργεια.",
    ];
  }
  return AnalysisSchema.parse(candidate);
}

export const analyzeBottleneck = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<Analysis> => {
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

    const outputLang: AiOutputLanguage = data.language ?? DEFAULT_AI_OUTPUT_LANGUAGE;
    const stepsLangName = LANGUAGE_NAME[outputLang];
    const isPositive = Boolean(data.is_positive);

    const stepsInstruction = isPositive
      ? [
          `This is a POSITIVE observation (a good practice worth preserving), NOT a problem.`,
          `Actionable steps MUST be REINFORCEMENT-style — never corrective, never disciplinary, never a fix protocol.`,
          `Produce exactly 3 short imperative sentences in ${stepsLangName} that:`,
          `  (1) record/document the exact behavior or steps the team executed so they can be replicated;`,
          `  (2) publicly recognize/reward the team members who delivered it (e.g. at the next pre-shift briefing);`,
          `  (3) reuse the observation as a training case study or onboarding example.`,
          `NEVER use words like "διορθώστε", "πρόβλημα", "αδυναμία", "fix", "correct", "improve". This is reinforcement only.`,
        ].join("\n")
      : `actionable_steps: array of exactly 3 short imperative corrective sentences, written in ${stepsLangName}`;

    const system = [
      "You are SDT (Service Diagnostic Tool), a restaurant operations auditor for Alexandros Chatziliadis.",
      "The observation may be written in English, German, or Greek. Understand all three.",
      "You are a FOH (Front of House) consultant. Actionable Steps must NEVER mention: food cost, kitchen operations, BOH processes, cooking, recipes, or supplier management. Focus exclusively on: staff behavior, service flow, upselling techniques, guest communication, FOH leadership, billing procedures, and table management. Any kitchen-originated issue must be addressed only through its FOH consequence and the server's response to it.",
      "TONE: Write with a firm, professional, and constructive tone. Never attack individuals or use words like 'apathy', 'indifference', 'incompetence', or 'unprofessional'. Frame all issues as systemic failures: missing structure, absent protocols, undefined roles, lack of training. The owner must feel urgency to act — not shame about their staff. Example reframe: instead of 'staff show complete apathy' write 'the team operates without direction or defined service standards'.",
      "Respond with a single raw JSON object — no prose, no markdown fences.",
      "Schema (all keys required):",
      `{`,
      `  "problem_category": one of ${CATEGORIES.join(" | ")} (English enum value, do NOT translate),`,
      `  "diagnosis_type": one of ${DIAGNOSES.join(" | ")} (English enum value, do NOT translate),`,
      `  "estimated_loss_eur": number (EUR per shift, no thousand separators, no currency symbol),`,
      `  "bsps_solution": one of ${BSPS.join(" | ")} (English code, do NOT translate),`,
      `  ${stepsInstruction}`,
      `}`,
      `IMPORTANT: every string inside "actionable_steps" MUST be written in ${stepsLangName}, regardless of the input language. Do not mix languages.`,
      "Be precise, B2B, no fluff. Output JSON only.",
    ].join("\n");

    const { text } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system,
      prompt: `Bottleneck observed:\n"""${data.bottleneck}"""\n\nObservation type: ${isPositive ? "POSITIVE (reinforcement only — no corrective steps)" : "NEGATIVE (corrective)"}\nReturn the JSON object now. Remember: actionable_steps in ${stepsLangName}.`,
    });

    let parsed: unknown;
    try {
      parsed = extractJson(text);
    } catch (e) {
      throw new Error(
        `AI returned an unparseable response. ${e instanceof Error ? e.message : ""}`.trim(),
      );
    }
    if (!parsed || typeof parsed !== "object") {
      throw new Error("AI response was not a JSON object.");
    }
    return coerce(parsed as Record<string, unknown>);
  });

const DiagnosisInput = z.object({
  venueName: z.string().min(1),
  audits: z.array(
    z.object({
      audit_date: z.string(),
      shift: z.string(),
      problem_category: z.string(),
      diagnosis_type: z.string(),
      estimated_loss_eur: z.union([z.number(), z.string()]),
      bsps_solution: z.string(),
      bottleneck: z.string(),
      is_positive: z.boolean().optional(),
    }),
  ),
  language: z.enum(AI_OUTPUT_LANGUAGES).optional(),
  severity: z
    .object({
      level: z.enum(["good", "moderate", "critical"]),
      loss_pct_of_ceiling: z.number(),
      positive_observations: z.number(),
      negative_observations: z.number(),
    })
    .optional(),
});

export const generateChiefDiagnosis = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => DiagnosisInput.parse(d))
  .handler(async ({ data }): Promise<{ text: string }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    if (data.audits.length === 0) {
      return { text: "" };
    }

    const gateway = createOpenAICompatible({
      name: "lovable",
      baseURL: "https://ai.gateway.lovable.dev/v1",
      headers: {
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
    });

    const outputLang: AiOutputLanguage = data.language ?? DEFAULT_AI_OUTPUT_LANGUAGE;
    const langName = LANGUAGE_NAME[outputLang];

    const totalLoss = data.audits.reduce(
      (a, b) => a + Number(b.estimated_loss_eur || 0),
      0,
    );

    const summaryLines = data.audits
      .map(
        (a, i) =>
          `${i + 1}. ${a.is_positive ? "[POS]" : "[NEG]"} [${a.audit_date} · ${a.shift}] cat=${a.problem_category} diag=${a.diagnosis_type} loss=${a.estimated_loss_eur}€ bsps=${a.bsps_solution} — ${a.bottleneck.slice(0, 240)}`,
      )
      .join("\n");

    const severity = data.severity;
    const toneBlock = (() => {
      if (!severity) return "TONE: Balanced professional. Acknowledge both strengths and weaknesses honestly.";
      if (severity.level === "good") {
        return [
          "TONE: POSITIVE and ENCOURAGING. The venue is operating well overall.",
          "Open by recognizing what is working (smooth service, engaged staff, positive guest experience).",
          "Frame issues as MINOR refinements or growth opportunities — never 'serious failures', never 'systemic breakdown', never dramatic language.",
          "Do NOT use words like: σοβαρές αστοχίες, αποδιοργάνωση, κρίσιμα προβλήματα, επείγον, severe, critical failure, disorganization.",
          "Use words like: ευκαιρίες βελτίωσης, εξέλιξη, καλή βάση, μικρές προσαρμογές, refinement, polish, opportunity.",
        ].join(" ");
      }
      if (severity.level === "moderate") {
        return [
          "TONE: BALANCED. Acknowledge BOTH what works well AND what needs attention.",
          "Open by recognizing operational strengths, then clearly name the 1-2 patterns that need correction.",
          "Avoid dramatic / urgent vocabulary. Avoid words like: αποδιοργάνωση, σοβαρές συστημικές αστοχίες, επείγον, κρίσιμα.",
          "Use words like: σημεία προς βελτίωση, στοχευμένες παρεμβάσεις, ενίσχυση πρωτοκόλλων, areas to strengthen.",
        ].join(" ");
      }
      return [
        "TONE: URGENT and DIRECT. The venue shows critical operational issues that require immediate action.",
        "Name the systemic failures clearly. Use firm, decisive vocabulary.",
        "Words like κρίσιμες αστοχίες, επείγουσα ανάγκη παρέμβασης, αποδιοργάνωση πρωτοκόλλων are appropriate.",
        "Still: frame as systemic (missing structure, absent protocols), never attack individuals.",
      ].join(" ");
    })();

    const system = [
      "You are SDT (Service Diagnostic Tool), senior restaurant operations auditor for Alexandros Chatziliadis.",
      "You write a single executive paragraph called 'Chief Diagnosis' for the venue owner.",
      "You are a FOH (Front of House) consultant. Your diagnosis must NEVER mention kitchen operations, food cost, BOH (back of house), or cooking processes. Focus exclusively on: service flow, staff behavior, upselling, guest experience, FOH leadership, billing, and table management. Any issue that originates in the kitchen must be reframed as its FOH consequence only.",
      toneBlock,
      "Never attack individuals. Frame issues as systemic (missing structure, absent protocols, undefined roles, lack of training) — never personal traits.",
      "CRITICAL: Your tone MUST match the severity level provided. Mismatched tone (e.g. dramatic language for a 'good' venue) makes the report unreliable and will be rejected by the client.",
      `Write strictly in ${langName}. Do not mix languages.`,
      "Exactly 3 to 5 sentences. No bullet lists, no headings, no markdown — plain prose only.",
      "Cover: (1) overall operational situation of the venue (calibrated to severity), (2) the most relevant pattern across the audits, (3) where the owner should focus next.",
      "Be specific, B2B, no fluff, no greetings, no closing line.",
    ].join("\n");

    const severityLine = severity
      ? `Overall severity: ${severity.level.toUpperCase()} (loss ${Math.round(severity.loss_pct_of_ceiling)}% of cap, ${severity.positive_observations} positive vs ${severity.negative_observations} negative observations)`
      : "Overall severity: unspecified";

    const prompt = [
      `Venue: ${data.venueName}`,
      severityLine,
      `Total audited financial loss: ${totalLoss}€`,
      `Number of observations: ${data.audits.length}`,
      "",
      "Observations (POS = positive/reinforcement, NEG = negative/corrective):",
      summaryLines,
      "",
      `Now write the Chief Diagnosis paragraph in ${langName}, calibrated to the ${severity?.level ?? "moderate"} severity level.`,
    ].join("\n");

    const { text } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system,
      prompt,
    });

    return { text: text.trim() };
  });
