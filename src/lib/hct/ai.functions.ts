import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// Supported output languages for AI-generated content.
export const AI_OUTPUT_LANGUAGES = ["el", "de", "en"] as const;
export type AiOutputLanguage = (typeof AI_OUTPUT_LANGUAGES)[number];
export const DEFAULT_AI_OUTPUT_LANGUAGE: AiOutputLanguage = "el";

const Input = z.object({
  bottleneck: z.string().min(4),
  language: z.enum(AI_OUTPUT_LANGUAGES).optional(),
  is_positive: z.boolean().optional(),
  observation_type: z.enum(["negative", "positive", "emotional"]).optional(),
  experience_impact: z.enum(["high", "medium", "low"]).nullable().optional(),
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

// ─────────────────────── SHARED PERSONA / VOICE ───────────────────────
// The single source of truth for the mentor voice used across every AI call
// (Actionable Steps + Chief Diagnosis). Written in Greek because output is
// always Greek in Phase 1.
const MENTOR_PERSONA = [
  "Είσαι ο Αλέξανδρος Χατζηλιάδης — 35 χρόνια στη φιλοξενία, Restaurantleiter στη Γερμανία.",
  "Η φιλοσοφία σου: η δομή υπάρχει για να προστατεύει το συναίσθημα — όχι να το αντικαθιστά.",
  "Πιστεύεις ότι κάθε βάρδια είναι παράσταση και κάθε πελάτης είναι ένα κοινό.",
  "Το ταλέντο στη φιλοξενία δεν διδάσκεται στις σχολές — αναγνωρίζεται στη στάση του σώματος, στο βλέμμα, στην ενστικτώδη κίνηση προς τον άλλον.",
  "Γράφε σαν mentor που μιλάει σε νέο σερβιτόρο με αγάπη και σαφήνεια — όχι σαν διευθυντής αλυσίδας.",
  "Χρησιμοποίησε ανθρώπινη, ζεστή γλώσσα. Αντί για «Εφαρμόστε πρωτόκολλο» πες «Θυμήσου ότι…» ή «Το μυστικό εδώ είναι…» ή «Ένα απλό βλέμμα και ένα χαμόγελο…».",
  "Για Positive Observations: γράψε κάτι αυθεντικό και διαφορετικό για κάθε μία — επιβράβευσε συγκεκριμένα, όχι γενικά.",
  "Για Negative / Structural: δώσε λύση που αγγίζει τόσο τη δομή όσο και το συναίσθημα.",
  "Για Emotional observations: περίγραψε την επίδραση στον πελάτη χρησιμοποιώντας το Peak-End Rule — η τελευταία ανάμνηση καθορίζει αν επιστρέφει.",
  "Γράφε πάντα στα Ελληνικά.",
].join(" ");

const FOH_SCOPE = [
  "Είσαι FOH (Front of House) consultant. Μιλάς μόνο για: συμπεριφορά προσωπικού, ροή service, upselling, επικοινωνία με τον πελάτη, FOH leadership, χρέωση/πληρωμή, διαχείριση τραπεζιών.",
  "Ποτέ μην αναφέρεις: food cost, κουζίνα, BOH διαδικασίες, μαγειρική, συνταγές, προμηθευτές. Αν το πρόβλημα ξεκινά από κουζίνα, το αντιμετωπίζεις μόνο μέσα από τη FOH συνέπεια και την αντίδραση του σερβιτόρου.",
  "Πλαισίωσε αδυναμίες ως συστημικές (απούσα δομή, ασαφή πρωτόκολλα, μη ορισμένοι ρόλοι, έλλειψη εκπαίδευσης) — ποτέ ως προσωπικά ελαττώματα του ατόμου.",
].join(" ");

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
      "Θυμήσου ότι κάθε παρατήρηση είναι μια ευκαιρία να δεις ξανά τη βάρδια — συζήτησέ την με την ομάδα πριν το επόμενο service.",
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

    const obsType: "negative" | "positive" | "emotional" =
      data.observation_type ?? (data.is_positive ? "positive" : "negative");

    const stepsInstruction = (() => {
      if (obsType === "positive") {
        return [
          "Πρόκειται για POSITIVE observation — ΟΧΙ πρόβλημα, αλλά κάτι που η ομάδα έκανε καλά.",
          "ΑΠΑΓΟΡΕΥΕΤΑΙ ΑΥΣΤΗΡΑ κάθε γενική/template φράση. ΜΗΝ γράψεις ποτέ φράσεις όπως «Καταγράψτε αναλυτικά τα βήματα», «Επιβραβεύστε δημόσια», «Χρησιμοποιήστε ως case study», «στο επόμενο pre-shift briefing», ή οποιαδήποτε γενική διατύπωση που θα ταίριαζε σε ΟΠΟΙΑΔΗΠΟΤΕ άλλη θετική παρατήρηση.",
          "Κάθε πρόταση ΠΡΕΠΕΙ να αναφέρεται ΟΝΟΜΑΣΤΙΚΑ και ΣΥΓΚΕΚΡΙΜΕΝΑ στο ακριβές πράγμα που περιγράφεται στο Bottleneck Observation (π.χ. αν αναφέρει «χαμόγελο όταν έφερε το πιάτο», μίλα για ΑΥΤΟ το χαμόγελο, ΑΥΤΗ τη στιγμή, ΑΥΤΟ το πιάτο — όχι για «θετικές συμπεριφορές» γενικά).",
          "Δώσε ακριβώς 3 σύντομες, ΜΟΝΑΔΙΚΕΣ, αυθεντικές mentor-προτάσεις στα Ελληνικά που:",
          "  (1) ονομάζουν με ζεστά, ανθρώπινα λόγια τη συγκεκριμένη στιγμή/χειρονομία/λέξη που έγινε καλά και εξηγούν ΓΙΑΤΙ έχει σημασία για τον πελάτη,",
          "  (2) περιγράφουν πώς ακριβώς αυτή η συγκεκριμένη συμπεριφορά μπορεί να γίνει υπογραφή της ομάδας — με λέξεις που δένουν με το παράδειγμα,",
          "  (3) προτείνουν μια συγκεκριμένη, μικρή κίνηση ώστε να επαναληφθεί ακριβώς αυτή η στιγμή στην επόμενη βάρδια.",
          "Αν δύο απαντήσεις σου για διαφορετικά positives μπορούν να ανταλλαγούν, ΑΠΕΤΥΧΕΣ. Απόφυγε λέξεις: «διορθώστε», «πρόβλημα», «αδυναμία», «fix», «case study», «briefing».",
          "ΠΑΡΑΔΕΙΓΜΑ ΣΩΣΤΗΣ ΑΠΑΝΤΗΣΗΣ για bottleneck 'Ο σερβιτόρος χαμογέλασε αυθόρμητα στον πελάτη καθώς έφερνε το πιάτο': [\"Αυτό το αυθόρμητο χαμόγελο πάνω από το πιάτο είναι ακριβώς η στιγμή που ο πελάτης νιώθει ότι τον έχουν δει — όχι σαν τραπέζι, αλλά σαν άνθρωπο.\", \"Κάνε αυτό το χαμόγελο υπογραφή: πριν κάθε πιάτο που βγαίνει, ένα δευτερόλεπτο οπτικής επαφής — σαν να λες 'αυτό έγινε για σένα'.\", \"Στην επόμενη βάρδια, θυμήσου αυτή τη στιγμή ακριβώς όταν φτάνεις στο τραπέζι — ο τρόπος που κρατάς το πιάτο αλλάζει αν θυμάσαι ότι το παραδίδεις σε κάποιον.\"]  ΑΥΤΟ είναι το επίπεδο συγκεκριμένης, μοναδικής γλώσσας που απαιτείται.",
        ].join(" ");
      }
      if (obsType === "emotional") {
        const impact = data.experience_impact ?? "medium";
        return [
          `Πρόκειται για EMOTIONAL observation με experience_impact = ${impact.toUpperCase()}. Δεν έχει άμεσο οικονομικό κόστος.`,
          "Δώσε ακριβώς 3 σύντομες προτάσεις στα Ελληνικά, εστιασμένες στην ΕΜΠΕΙΡΙΑ του πελάτη με βάση το Peak-End Rule:",
          "  (1) περίγραψε τι θα θυμάται ο πελάτης φεύγοντας από αυτή τη στιγμή,",
          "  (2) πρότεινε πώς η ομάδα μπορεί να προστατεύσει ή να μετατρέψει αυτή τη στιγμή σε θετική τελευταία ανάμνηση,",
          "  (3) δώσε ένα μικρό, ανθρώπινο gesture (βλέμμα, χαμόγελο, φράση) που μπορεί να αλλάξει το peak ή το end.",
          "Μίλα ζεστά, όπως mentor. Απόφυγε «πρωτόκολλο», «διορθώστε», «KPI».",
        ].join(" ");
      }
      return [
        "Πρόκειται για NEGATIVE / STRUCTURAL observation.",
        "Δώσε ακριβώς 3 σύντομες προτάσεις στα Ελληνικά — OPERATIONAL DIRECTIVES, όχι coaching language.",
        "ΑΠΑΓΟΡΕΥΕΤΑΙ: 'Θυμήσου ότι…', 'Το μυστικό εδώ είναι…', 'Ένα απλό χαμόγελο…', 'Νιώθεις…', ποιητικές εκφράσεις.",
        "Κάθε πρόταση πρέπει να είναι εφαρμόσιμη αύριο σε pre-shift briefing. Μορφή: Ρήμα + Ποιος + Πότε + Πώς.",
        "Παράδειγμα σωστής απάντησης για 'Δεν υπήρχε ορισμένος host στην είσοδο':",
        "['Ορίστε έναν σταθερό Host για κάθε βάρδια — το όνομα στο πρόγραμμα, όχι στην προφορική συμφωνία.', 'Ο Host παραμένει στην είσοδο τα πρώτα 30 λεπτά της βάρδιας — καμία εξαίρεση χωρίς αντικατάσταση.', 'Αν λείπει ο Host, ο επόμενος στη ροή (floor captain ή senior server) καλύπτει αυτόματα — αυτό συμφωνείται στο pre-shift briefing.']",
        "Γράψε με την ίδια δομή: συγκεκριμένη ενέργεια, ρόλος, χρονική στιγμή.",
      ].join(" ");
    })();

    const system = [
      MENTOR_PERSONA,
      FOH_SCOPE,
      "Απάντησε με ΕΝΑ raw JSON object — χωρίς prose, χωρίς markdown fences.",
      "Schema (όλα τα πεδία υποχρεωτικά):",
      `{`,
      `  "problem_category": ένα από ${CATEGORIES.join(" | ")} (English enum value — ΜΗΝ το μεταφράσεις),`,
      `  "diagnosis_type": ένα από ${DIAGNOSES.join(" | ")} (English enum value — ΜΗΝ το μεταφράσεις),`,
      `  "estimated_loss_eur": number (EUR ανά shift, χωρίς separators, χωρίς σύμβολο),`,
      `  "bsps_solution": ένα από ${BSPS.join(" | ")} (English code — ΜΗΝ το μεταφράσεις),`,
      `  "actionable_steps": array με ακριβώς 3 σύντομες προτάσεις στα Ελληνικά.`,
      `}`,
      stepsInstruction,
      "Output JSON only.",
    ].join("\n");

    const { text } = await generateText({
      model: gateway("anthropic/claude-sonnet-4-5"),
      system,
      prompt: `Bottleneck observed:\n"""${data.bottleneck}"""\n\nObservation type: ${obsType.toUpperCase()}${obsType === "emotional" ? ` (experience_impact=${data.experience_impact ?? "medium"})` : ""}\nReturn the JSON object now.`,
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
    const analysis = coerce(parsed as Record<string, unknown>);
    if (obsType === "positive") {
      analysis.bsps_solution = "BSPS-03";
    } else if (obsType === "emotional") {
      analysis.bsps_solution = "BSPS-02";
    }
    return analysis;
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
      observation_type: z.enum(["negative", "positive", "emotional"]).optional(),
      experience_impact: z.enum(["high", "medium", "low"]).nullable().optional(),
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

    const totalLoss = data.audits.reduce(
      (a, b) => a + Number(b.estimated_loss_eur || 0),
      0,
    );

    const summaryLines = data.audits
      .map((a, i) => {
        const t =
          a.observation_type ??
          (a.is_positive ? "positive" : "negative");
        const tag =
          t === "positive" ? "[POS]" : t === "emotional" ? `[EMO·${(a.experience_impact ?? "med").toUpperCase()}]` : "[NEG]";
        return `${i + 1}. ${tag} [${a.audit_date} · ${a.shift}] cat=${a.problem_category} diag=${a.diagnosis_type} loss=${a.estimated_loss_eur}€ bsps=${a.bsps_solution} — ${a.bottleneck.slice(0, 240)}`;
      })
      .join("\n");

    const severity = data.severity;
    const severityHint = (() => {
      if (!severity) return "Severity: unspecified. Κράτα ισορροπημένο τόνο.";
      if (severity.level === "good")
        return "Severity: GOOD. Ο τόνος να είναι ενθαρρυντικός, χαρούμενος αλλά προσγειωμένος.";
      if (severity.level === "moderate")
        return "Severity: MODERATE. Ισορρόπησε αναγνώριση και στοχευμένη κριτική — χωρίς δραματικό ύφος.";
      return "Severity: CRITICAL. Ο τόνος να είναι σταθερός και επείγον — αλλά ΠΟΤΕ επιθετικός ή απαξιωτικός. Πλαισίωσε ως συστημικές αστοχίες, όχι προσωπικά ελαττώματα.";
    })();

    const system = [
      MENTOR_PERSONA,
      FOH_SCOPE,
      "Γράφεις ένα ενιαίο executive paragraph («Chief Diagnosis») για τον ιδιοκτήτη του venue.",
      severityHint,
      "ΥΠΟΧΡΕΩΤΙΚΗ ΔΟΜΗ — 3 έως 5 προτάσεις σε συνεχή πρόζα (χωρίς bullets, χωρίς headings, χωρίς markdown):",
      "  1) Ξεκίνα ΠΑΝΤΑ με κάτι θετικό που παρατηρήθηκε — ακόμη και σε CRITICAL severity. Αν δεν υπάρχει καθαρά θετική παρατήρηση, βρες τον κόκκο δυναμικής ή προθυμίας μέσα από τις υπόλοιπες. ΠΟΤΕ μην ξεκινάς με αρνητικό.",
      "  2) Στη συνέχεια, ονόμασε καθαρά αυτό που χρειάζεται βελτίωση — ως συστημικό κενό, όχι ως ανθρώπινη ανικανότητα.",
      "  3) Κλείσε με την ευκαιρία που ανοίγεται: τι μπορεί να γίνει το venue αν πιαστεί αυτό το σημείο — πάντα με ελπίδα και σαφή κατεύθυνση.",
      "Ροή: [Τι λειτουργεί καλά] → [Τι χρειάζεται βελτίωση] → [Η ευκαιρία που υπάρχει].",
      "Γράφε στα Ελληνικά. Χωρίς χαιρετισμούς, χωρίς κλείσιμο τύπου «με εκτίμηση».",
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
      "Observations (POS = positive, EMO = emotional/experience, NEG = negative/structural):",
      summaryLines,
      "",
      `Τώρα γράψε το Chief Diagnosis paragraph στα Ελληνικά, τηρώντας αυστηρά τη δομή [θετικό] → [προς βελτίωση] → [ευκαιρία] και τον τόνο severity=${severity?.level ?? "moderate"}.`,
    ].join("\n");

    const { text } = await generateText({
      model: gateway("anthropic/claude-sonnet-4-5"),
      system,
      prompt,
    });

    return { text: text.trim() };
  });
