import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useState } from "react";
import { AppHeader } from "@/components/hct/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listVenues } from "@/lib/hct/venues.functions";
import { createAudit } from "@/lib/hct/audits.functions";
import { analyzeBottleneck } from "@/lib/hct/ai.functions";
import {
  SHIFTS,
  PROBLEM_CATEGORIES,
  DIAGNOSIS_TYPES,
  BSPS_SOLUTIONS,
  formatEUR,
  isVenueProfileComplete,
  lossForCategory,
  labelOf,
} from "@/lib/hct/constants";
import { Sparkles, ArrowLeft, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const search = z.object({ venue: fallback(z.string().optional(), undefined) });

export const Route = createFileRoute("/_authenticated/audits/new")({
  validateSearch: zodValidator(search),
  head: () => ({ meta: [{ title: "New Audit — SDT" }] }),
  component: NewAudit,
});

function NewAudit() {
  const { venue } = Route.useSearch();
  const navigate = useNavigate();
  const listVenuesFn = useServerFn(listVenues);
  const createFn = useServerFn(createAudit);
  const analyzeFn = useServerFn(analyzeBottleneck);

  const venuesQ = useQuery({ queryKey: ["venues"], queryFn: () => listVenuesFn() });
  const venues = venuesQ.data ?? [];

  const [form, setForm] = useState({
    venue_id: venue ?? "",
    audit_date: new Date().toISOString().slice(0, 10),
    shift: "abend" as "morgen" | "abend",
    bottleneck: "",
    problem_category: "",
    diagnosis_type: "" as "" | "structure" | "emotion" | "both",
    estimated_loss_eur: "" as string | number,
    bsps_solution: "",
    actionable_steps: "",
  });
  const [analyzing, setAnalyzing] = useState(false);

  const activeVenue = venues.find((v) => v.id === form.venue_id);
  const venueProfile = activeVenue
    ? {
        concept_type: activeVenue.concept_type ?? null,
        tables: activeVenue.tables ?? null,
        avg_covers_per_table:
          activeVenue.avg_covers_per_table != null ? Number(activeVenue.avg_covers_per_table) : null,
        avg_check_per_person:
          activeVenue.avg_check_per_person != null ? Number(activeVenue.avg_check_per_person) : null,
        cycles_per_shift:
          activeVenue.cycles_per_shift != null ? Number(activeVenue.cycles_per_shift) : null,
      }
    : null;
  const profileOk = isVenueProfileComplete(venueProfile);
  const computedLoss = profileOk && form.problem_category
    ? lossForCategory(form.problem_category, venueProfile)
    : 0;

  function patch<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function runAi() {
    if (form.bottleneck.trim().length < 6) {
      toast.error("Describe the bottleneck first (min 6 chars).");
      return;
    }
    setAnalyzing(true);
    try {
      const r = await analyzeFn({ data: { bottleneck: form.bottleneck } });
      setForm((f) => ({
        ...f,
        problem_category: r.problem_category,
        diagnosis_type: r.diagnosis_type,
        bsps_solution: r.bsps_solution,
        actionable_steps: r.actionable_steps.map((s, i) => `${i + 1}. ${s}`).join("\n"),
      }));
      toast.success("AI diagnosis ready — review and edit before saving.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  const m = useMutation({
    mutationFn: () => {
      if (!profileOk) throw new Error("Complete the venue profile first.");
      return createFn({
        data: {
          venue_id: form.venue_id,
          audit_date: form.audit_date,
          shift: form.shift,
          bottleneck: form.bottleneck,
          problem_category: form.problem_category,
          diagnosis_type: form.diagnosis_type as "structure" | "emotion" | "both",
          estimated_loss_eur: Math.round(computedLoss),
          bsps_solution: form.bsps_solution,
          actionable_steps: form.actionable_steps,
        },
      });
    },
    onSuccess: () => {
      toast.success("Audit entry saved.");
      navigate({
        to: "/dashboard",
        search: { venue: form.venue_id },
      });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not save entry"),
  });

  const canSubmit =
    form.venue_id &&
    profileOk &&
    form.bottleneck &&
    form.problem_category &&
    form.diagnosis_type &&
    form.bsps_solution;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Link
          to="/dashboard"
          search={{ venue: form.venue_id || undefined }}
          className="inline-flex items-center font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-3 w-3" /> Back to console
        </Link>
        <h1 className="mt-6 text-3xl font-medium tracking-tight">New Audit Entry</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Log a single observed bottleneck. Use AI Audit to auto-diagnose, then refine.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) m.mutate();
          }}
          className="mt-8 space-y-6"
        >
          <Field label="Venue">
            <Select
              value={form.venue_id}
              onValueChange={(v) => patch("venue_id", v)}
            >
              <SelectTrigger className="h-11 rounded-sm border-hairline">
                <SelectValue placeholder="Select venue" />
              </SelectTrigger>
              <SelectContent>
                {venues.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Audit Date">
              <Input
                type="date"
                value={form.audit_date}
                onChange={(e) => patch("audit_date", e.target.value)}
                className="h-11 rounded-sm border-hairline"
              />
            </Field>
            <Field label="Shift">
              <Select
                value={form.shift}
                onValueChange={(v) => patch("shift", v as "morgen" | "abend")}
              >
                <SelectTrigger className="h-11 rounded-sm border-hairline">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHIFTS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field
            label="Bottleneck Observation"
            action={
              <button
                type="button"
                onClick={runAi}
                disabled={analyzing}
                className="inline-flex items-center gap-1 rounded-sm border border-gold/40 bg-gold/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground hover:bg-gold/20 disabled:opacity-50"
              >
                <Sparkles className="h-3 w-3" />
                {analyzing ? "Analyzing…" : "AI Audit"}
              </button>
            }
          >
            <Textarea
              rows={5}
              value={form.bottleneck}
              onChange={(e) => patch("bottleneck", e.target.value)}
              placeholder="e.g. During Abend-Schicht, the pass backed up for 12 minutes…"
              className="rounded-sm border-hairline"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Problem Category">
              <Select
                value={form.problem_category}
                onValueChange={(v) => patch("problem_category", v)}
              >
                <SelectTrigger className="h-11 rounded-sm border-hairline">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {PROBLEM_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Diagnosis Type">
              <Select
                value={form.diagnosis_type}
                onValueChange={(v) =>
                  patch("diagnosis_type", v as "structure" | "emotion" | "both")
                }
              >
                <SelectTrigger className="h-11 rounded-sm border-hairline">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {DIAGNOSIS_TYPES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Estimated Loss (EUR / shift)">
              <Input
                inputMode="numeric"
                value={form.estimated_loss_eur}
                onChange={(e) => patch("estimated_loss_eur", e.target.value)}
                placeholder="0"
                className="tabular h-11 rounded-sm border-hairline"
              />
            </Field>
            <Field label="BSPS Solution">
              <Select
                value={form.bsps_solution}
                onValueChange={(v) => patch("bsps_solution", v)}
              >
                <SelectTrigger className="h-11 rounded-sm border-hairline">
                  <SelectValue placeholder="Select module" />
                </SelectTrigger>
                <SelectContent>
                  {BSPS_SOLUTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Actionable Steps">
            <Textarea
              rows={5}
              value={form.actionable_steps}
              onChange={(e) => patch("actionable_steps", e.target.value)}
              placeholder="1. …&#10;2. …&#10;3. …"
              className="rounded-sm border-hairline"
            />
          </Field>

          <div className="flex justify-end gap-3 border-t border-hairline pt-6">
            <Button
              type="submit"
              disabled={!canSubmit || m.isPending}
              className="h-11 rounded-sm bg-foreground px-6 font-mono text-xs uppercase tracking-[0.2em] text-background hover:bg-foreground/90"
            >
              {m.isPending ? "Saving…" : "Save Entry"}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}

function Field({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </label>
        {action}
      </div>
      {children}
    </div>
  );
}
