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
      });
    }
  }, [q.data, form]);

  function patch<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => (f ? { ...f, [k]: v } : f));
  }

  const m = useMutation({
    mutationFn: () => {
      if (!form) throw new Error("Form not ready");
      return updateFn({
        data: {
          id,
          audit_date: form.audit_date,
          shift: form.shift,
          bottleneck: form.bottleneck,
          problem_category: form.problem_category,
          diagnosis_type: form.diagnosis_type as "structure" | "emotion" | "both",
          estimated_loss_eur: Number(form.estimated_loss_eur || 0),
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

              <div className="grid grid-cols-2 gap-4">
                <Field label="Estimated Loss (EUR / shift)">
                  <Input
                    inputMode="numeric"
                    value={form.estimated_loss_eur}
                    onChange={(e) => patch("estimated_loss_eur", e.target.value)}
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
