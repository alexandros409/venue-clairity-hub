import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
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
import { getAudit, updateAudit } from "@/lib/hct/audits.functions";
import { listVenues } from "@/lib/hct/venues.functions";
import {
  PROBLEM_CATEGORIES,
  PROBLEM_CATEGORY_DESCRIPTIONS,
  FOH_IMPACT_DISCLAIMER,
  isFohImpactCategory,
  BSPS_SOLUTIONS,
  DIAGNOSIS_TYPES,
  SHIFTS,
  formatEUR,
  isVenueProfileComplete,
  lossForCategory,
} from "@/lib/hct/constants";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/audits/$id")({
  head: () => ({ meta: [{ title: "Audit Entry — SDT" }] }),
  component: AuditDetail,
});

type FormState = {
  venue_id: string;
  audit_date: string;
  shift: "morgen" | "abend";
  bottleneck: string;
  problem_category: string;
  diagnosis_type: "" | "structure" | "emotion" | "both";
  estimated_loss_eur: string;
  bsps_solution: string;
  actionable_steps: string;
  is_positive: boolean;
};

function AuditDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getAudit);
  const updateFn = useServerFn(updateAudit);
  const listVenuesFn = useServerFn(listVenues);

  const q = useQuery({
    queryKey: ["audit", id],
    queryFn: () => getFn({ data: { id } }),
  });
  const venuesQ = useQuery({ queryKey: ["venues"], queryFn: () => listVenuesFn() });

  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    if (q.data && !form) {
      setForm({
        venue_id: q.data.venue_id,
        audit_date: q.data.audit_date,
        shift: q.data.shift as "morgen" | "abend",
        bottleneck: q.data.bottleneck ?? "",
        problem_category: q.data.problem_category ?? "",
        diagnosis_type: (q.data.diagnosis_type ?? "") as FormState["diagnosis_type"],
        estimated_loss_eur: String(q.data.estimated_loss_eur ?? ""),
        bsps_solution: q.data.bsps_solution ?? "",
        actionable_steps: q.data.actionable_steps ?? "",
        is_positive: Boolean((q.data as { is_positive?: boolean }).is_positive ?? false),
      });
    }
  }, [q.data, form]);

  function patch<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => (f ? { ...f, [k]: v } : f));
  }

  const activeVenue = (venuesQ.data ?? []).find((v) => v.id === form?.venue_id);
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
  const rawLoss = profileOk && form?.problem_category
    ? lossForCategory(form.problem_category, venueProfile)
    : 0;
  const computedLoss = form?.is_positive ? 0 : rawLoss;

  const m = useMutation({
    mutationFn: () => {
      if (!form) throw new Error("Form not ready");
      if (!profileOk) throw new Error("Complete the venue profile first.");
      return updateFn({
        data: {
          id,
          audit_date: form.audit_date,
          shift: form.shift,
          bottleneck: form.bottleneck,
          problem_category: form.problem_category,
          diagnosis_type: form.diagnosis_type as "structure" | "emotion" | "both",
          estimated_loss_eur: form.is_positive ? 0 : Math.round(computedLoss),
          is_positive: form.is_positive,
          bsps_solution: form.bsps_solution,
          actionable_steps: form.actionable_steps,
        },
      });
    },
    onSuccess: () => {
      toast.success("Audit entry updated.");
      qc.invalidateQueries({ queryKey: ["audit", id] });
      qc.invalidateQueries({ queryKey: ["audits"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not update entry"),
  });

  const canSubmit =
    !!form &&
    profileOk &&
    form.bottleneck &&
    form.problem_category &&
    form.diagnosis_type &&
    form.bsps_solution;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <button
          onClick={() =>
            navigate({
              to: "/audits",
              search: { venue: form?.venue_id ?? q.data?.venue_id },
            })
          }
          className="inline-flex items-center font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-3 w-3" /> Back to all audits
        </button>

        {q.isLoading && (
          <div className="mt-10 text-sm text-muted-foreground">Loading…</div>
        )}
        {q.error && (
          <div className="mt-10 text-sm text-destructive">
            {q.error instanceof Error ? q.error.message : "Failed to load"}
          </div>
        )}

        {form && (
          <>
            <div className="mt-6 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Edit Audit Entry
            </div>
            <h1 className="mt-2 text-3xl font-medium tracking-tight">
              Audit Entry
            </h1>

            {!profileOk && (
              <div className="mt-6 flex items-start gap-3 rounded-sm border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <div className="font-medium">Venue profile incomplete.</div>
                  <div className="mt-1 text-destructive/80">
                    Open the venue from the console and fill the Setup Profile (concept, tables, covers, check, cycles) before saving changes.
                  </div>
                </div>
              </div>
            )}


            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (canSubmit) m.mutate();
              }}
              className="mt-8 space-y-6"
            >
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

              <Field label="Observation Type">
                <div className="inline-flex rounded-sm border border-hairline overflow-hidden">
                  <button
                    type="button"
                    onClick={() => patch("is_positive", false)}
                    className={`px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] transition ${
                      !form.is_positive
                        ? "bg-foreground text-background"
                        : "bg-card text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    Negative
                  </button>
                  <button
                    type="button"
                    onClick={() => patch("is_positive", true)}
                    className={`border-l border-hairline px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] transition ${
                      form.is_positive
                        ? "bg-emerald-600 text-white"
                        : "bg-card text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    Positive
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {form.is_positive
                    ? "Positive observation — financial loss is fixed at €0 and excluded from the safety cap and Chief Diagnosis."
                    : "Negative observation — financial loss is auto-calculated from the category formula."}
                </p>
              </Field>

              <Field label="Bottleneck Observation">
                <Textarea
                  rows={5}
                  value={form.bottleneck}
                  onChange={(e) => patch("bottleneck", e.target.value)}
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
                  {PROBLEM_CATEGORY_DESCRIPTIONS[form.problem_category] && (
                    <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                      {PROBLEM_CATEGORY_DESCRIPTIONS[form.problem_category]}
                    </p>
                  )}
                </Field>
                <Field label="Diagnosis Type">
                  <Select
                    value={form.diagnosis_type}
                    onValueChange={(v) =>
                      patch(
                        "diagnosis_type",
                        v as "structure" | "emotion" | "both",
                      )
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

              {isFohImpactCategory(form.problem_category) && (
                <div className="flex items-start gap-2 rounded-sm border border-gold/40 bg-gold/10 px-3 py-2 text-[11px] leading-snug text-foreground">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
                  <span>{FOH_IMPACT_DISCLAIMER}</span>
                </div>
              )}


              <div className="grid grid-cols-2 gap-4">
                <Field label="Computed Loss (€ / incident)">
                  <div className="tabular flex h-11 items-center rounded-sm border border-hairline bg-muted/40 px-3 text-sm font-medium">
                    {form.is_positive
                      ? <span className="text-emerald-700">Positive Observation · €0</span>
                      : profileOk && form.problem_category
                        ? formatEUR(Math.round(computedLoss))
                        : "—"}
                  </div>
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
                  rows={6}
                  value={form.actionable_steps}
                  onChange={(e) => patch("actionable_steps", e.target.value)}
                  className="rounded-sm border-hairline"
                />
              </Field>

              <div className="flex items-center justify-between gap-3 border-t border-hairline pt-6">
                <Link
                  to="/audits"
                  search={{ venue: form.venue_id }}
                  className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </Link>
                <Button
                  type="submit"
                  disabled={!canSubmit || m.isPending}
                  className="h-11 rounded-sm bg-foreground px-6 font-mono text-xs uppercase tracking-[0.2em] text-background hover:bg-foreground/90"
                >
                  {m.isPending ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </form>
          </>
        )}
      </main>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </label>
      </div>
      {children}
    </div>
  );
}
