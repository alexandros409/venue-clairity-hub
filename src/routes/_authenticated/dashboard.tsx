import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useMemo, useState } from "react";
import { AppHeader } from "@/components/hct/AppHeader";
import { VenueSelector } from "@/components/hct/VenueSelector";
import { Button } from "@/components/ui/button";
import { listVenues } from "@/lib/hct/venues.functions";
import { listAudits } from "@/lib/hct/audits.functions";
import {
  PROBLEM_CATEGORIES,
  BSPS_SOLUTIONS,
  SHIFTS,
  CONCEPT_TYPES,
  formatEUR,
  formatDate,
  labelOf,
  venueEconomics,
  applySafetyCap,
  isVenueProfileComplete,
  computeSeverity,
} from "@/lib/hct/constants";
import { downloadExecutiveReport } from "@/lib/hct/pdf";
import { generateChiefDiagnosis } from "@/lib/hct/ai.functions";
import { FileDown, Plus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const search = z.object({ venue: z.string().optional() });

export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: zodValidator(search),
  head: () => ({ meta: [{ title: "Dashboard — SDT" }] }),
  component: Dashboard,
  errorComponent: ({ error, reset }) => (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        Console unavailable
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        {error instanceof Error ? error.message : "Failed to load dashboard."}
      </p>
      <button
        onClick={reset}
        className="mt-6 inline-flex h-10 items-center rounded-sm border border-hairline bg-card px-5 font-mono text-xs uppercase tracking-[0.2em] hover:bg-muted"
      >
        Retry
      </button>
    </div>
  ),
  notFoundComponent: () => <div className="p-10 text-sm">Not found.</div>,
});

function Dashboard() {
  const { venue } = Route.useSearch();
  const navigate = useNavigate({ from: "/dashboard" });
  const listVenuesFn = useServerFn(listVenues);
  const listAuditsFn = useServerFn(listAudits);

  const venuesQ = useQuery({
    queryKey: ["venues"],
    queryFn: () => listVenuesFn(),
  });

  const venues = venuesQ.data ?? [];
  const activeVenue = venues.find((v) => v.id === venue);
  const activeId = activeVenue?.id;

  const auditsQ = useQuery({
    queryKey: ["audits", activeId ?? "none"],
    queryFn: () => listAuditsFn({ data: { venueId: activeId! } }),
    enabled: !!activeId,
  });

  const audits = auditsQ.data ?? [];

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
  const economics = venueEconomics(venueProfile);

  const capped = useMemo(
    () =>
      applySafetyCap(
        audits.map((a) => {
          const t = (a as { observation_type?: string; is_positive?: boolean }).observation_type
            ?? ((a as { is_positive?: boolean }).is_positive ? "positive" : "negative");
          return t === "negative" ? Number(a.estimated_loss_eur || 0) : 0;
        }),
        venueProfile,
      ),
    [audits, venueProfile],
  );

  const cappedAudits = useMemo(
    () =>
      audits.map((a, i) => {
        const obsType = ((a as { observation_type?: string }).observation_type
          ?? ((a as { is_positive?: boolean }).is_positive ? "positive" : "negative")) as
          "negative" | "positive" | "emotional";
        const positive = obsType === "positive";
        const emotional = obsType === "emotional";
        return {
          ...a,
          observation_type: obsType,
          experience_impact:
            (a as { experience_impact?: "high" | "medium" | "low" | null }).experience_impact
            ?? null,
          is_positive: positive,
          capped_loss_eur:
            positive || emotional
              ? 0
              : Math.round(capped.capped[i] ?? Number(a.estimated_loss_eur || 0)),
        };
      }),
    [audits, capped],
  );

  const totals = useMemo(() => {
    const structural = cappedAudits.filter((a) => a.observation_type === "negative").length;
    const emotional = cappedAudits.filter((a) => a.observation_type === "positive").length;
    const experiential = cappedAudits.filter((a) => a.observation_type === "emotional").length;
    return {
      count: audits.length,
      total: Math.round(capped.capped_total),
      raw_total: Math.round(capped.total),
      capped: capped.capped_total < capped.total,
      structural,
      emotional,
      experiential,
    };
  }, [audits, capped, cappedAudits]);

  const severity = useMemo(
    () => computeSeverity(cappedAudits, capped.capped_total, economics),
    [cappedAudits, capped, economics],
  );

  const topCritical = useMemo(
    () =>
      [...cappedAudits]
        .sort((a, b) => b.capped_loss_eur - a.capped_loss_eur)
        .slice(0, 5),
    [cappedAudits],
  );

  const [exporting, setExporting] = useState(false);
  const diagnosisFn = useServerFn(generateChiefDiagnosis);
  async function onExport() {
    if (!activeVenue) return;
    setExporting(true);
    try {
      let chiefDiagnosis = "";
      try {
        const r = await diagnosisFn({
          data: {
            venueName: activeVenue.name,
            audits: audits.map((a) => ({
              audit_date: a.audit_date,
              shift: a.shift,
              problem_category: a.problem_category,
              diagnosis_type: a.diagnosis_type,
              estimated_loss_eur: (a as { is_positive?: boolean }).is_positive
                ? 0
                : a.estimated_loss_eur,
              bsps_solution: a.bsps_solution,
              bottleneck: a.bottleneck,
              is_positive: Boolean((a as { is_positive?: boolean }).is_positive),
            })),
            severity: {
              level: severity.level,
              loss_pct_of_ceiling: severity.loss_pct_of_ceiling,
              positive_observations: severity.positive_observations,
              negative_observations: severity.negative_observations,
            },
          },
        });
        chiefDiagnosis = r.text;
      } catch (e) {
        toast.warning(
          "Chief Diagnosis unavailable — exporting without AI summary.",
        );
        console.error(e);
      }
      await downloadExecutiveReport(
        activeVenue.name,
        cappedAudits.map((a) => ({
          ...a,
          estimated_loss_eur: a.capped_loss_eur,
        })),
        chiefDiagnosis,
        economics,
        severity,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  function setVenue(id: string) {
    navigate({ search: { venue: id } });
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Operational Diagnostics
            </div>
            <h1 className="mt-1 text-xl font-medium tracking-tight sm:text-2xl">
              Audit Console
            </h1>
          </div>
          {activeVenue && (
            <div className="flex flex-wrap gap-2">
              <Link
                to="/audits/new"
                search={{ venue: activeId }}
                className="inline-flex h-9 items-center rounded-sm border border-hairline bg-card px-3 font-mono text-[10px] uppercase tracking-[0.2em] hover:bg-muted"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" /> New
              </Link>
              <Button
                onClick={onExport}
                disabled={exporting || audits.length === 0}
                className="h-9 rounded-sm bg-foreground px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-background hover:bg-foreground/90"
              >
                <FileDown className="mr-1.5 h-3.5 w-3.5" />
                {exporting ? "Generating…" : "Export PDF"}
              </Button>
            </div>
          )}
        </div>

        <div className="mt-4 rounded-sm border border-hairline bg-card p-4">
          <VenueSelector
            venues={venues}
            value={activeId}
            onChange={setVenue}
          />
        </div>

        {!activeVenue ? (
          venues.length === 0 ? (
            <EmptyState
              title="No venue yet"
              body="Add your first venue to begin logging operational bottlenecks."
            />
          ) : (
            <EmptyState
              title="Select a venue to begin"
              body="Choose a venue from the selector above to view audits and metrics."
            />
          )
        ) : (
          <>
            {!profileOk && (
              <div className="mt-3 flex items-start gap-3 rounded-sm border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <div className="font-medium">Venue profile incomplete.</div>
                  <div className="mt-1 text-destructive/80">
                    Open <strong>Setup Profile</strong> and fill in concept, tables, covers, average check and cycles. Observations cannot be saved until this is done.
                  </div>
                </div>
              </div>
            )}

            {profileOk && economics && (
              <>
                {audits.length > 0 && (
                  <div className="mt-3">
                    <SeverityBanner severity={severity} />
                  </div>
                )}

                <section className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MiniStat label="Bottlenecks" value={String(totals.count)} />
                  <MiniStat
                    label="Audited Loss"
                    value={formatEUR(totals.total)}
                    hint={
                      totals.capped
                        ? `Capped · raw ${formatEUR(totals.raw_total)}`
                        : undefined
                    }
                    accent
                  />
                  <MiniStat
                    label="Str · Emo · Exp"
                    value={`${totals.structural}/${totals.emotional}/${totals.experiential}`}
                    hint="Structural / Emotional / Experiential"
                  />

                  <MiniStat
                    label="Max Loss Cap"
                    value={formatEUR(Math.round(economics.max_total_loss))}
                    hint={`${Math.round((economics.max_total_loss / economics.revenue_ceiling) * 100)} % of ceiling`}
                  />
                </section>

                <section className="mt-3 grid grid-cols-3 gap-2 rounded-sm border border-hairline bg-card px-3 py-2 text-[11px]">
                  <MicroStat label="Concept" value={labelOf(CONCEPT_TYPES, activeVenue!.concept_type ?? "")} />
                  <MicroStat label="Covers / Shift" value={String(economics.covers)} />
                  <MicroStat
                    label="Revenue Ceiling"
                    value={formatEUR(Math.round(economics.revenue_ceiling))}
                  />
                </section>
              </>
            )}

            <section className="mt-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  Recent Critical Bottlenecks
                </h2>
                <Link
                  to="/audits"
                  search={{ venue: activeId }}
                  className="shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
                >
                  View all →
                </Link>
              </div>
              <div className="mt-2 overflow-hidden rounded-sm border border-hairline bg-card">
                {topCritical.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No audit entries yet for this venue.
                  </div>
                ) : (
                  <table className="w-full text-xs sm:text-sm">
                    <thead className="border-b border-hairline text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                      <tr>
                        <th className="px-2 py-2 text-left font-normal sm:px-4">Date</th>
                        <th className="hidden px-4 py-2 text-left font-normal sm:table-cell">Shift</th>
                        <th className="px-2 py-2 text-left font-normal sm:px-4">Category</th>
                        <th className="px-2 py-2 text-right font-normal sm:px-4">Loss</th>
                        <th className="px-2 py-2 text-right font-normal sm:px-4">BSPS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topCritical.map((a) => (
                        <tr
                          key={a.id}
                          className="border-b border-hairline last:border-0 hover:bg-muted/40"
                        >
                          <td className="tabular px-2 py-2 sm:px-4">
                            {formatDate(a.audit_date)}
                          </td>
                          <td className="hidden px-4 py-2 text-muted-foreground sm:table-cell">
                            {labelOf(SHIFTS, a.shift)}
                          </td>
                          <td className="px-2 py-2 sm:px-4">
                            <Link
                              to="/audits/$id"
                              params={{ id: a.id }}
                              className="hover:underline"
                            >
                              {labelOf(PROBLEM_CATEGORIES, a.problem_category)}
                            </Link>
                          </td>
                          <td className="tabular px-2 py-2 text-right font-medium sm:px-4">
                            {a.is_positive ? (
                              <span className="text-emerald-700">€0</span>
                            ) : (
                              formatEUR(a.capped_loss_eur)
                            )}
                          </td>
                          <td className="px-2 py-2 text-right sm:px-4">
                            <span className="inline-flex items-center rounded-sm border border-gold/40 bg-gold/10 px-1.5 py-0.5 font-mono text-[9px] text-foreground">
                              {labelOf(BSPS_SOLUTIONS, a.bsps_solution).split(" — ")[0]}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <div className="mt-6 border-t border-hairline pt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {activeVenue.name}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function MiniStat({
  label,
  value,
  hint,
  accent,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-sm border border-hairline bg-card p-3">
      <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </div>
      <div
        className={`tabular mt-1 text-lg font-medium leading-tight sm:text-xl ${
          accent ? "text-foreground" : ""
        }`}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-[9px] uppercase tracking-[0.16em] text-gold">
          {hint}
        </div>
      )}
      {children}
    </div>
  );
}

function MicroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </div>
      <div className="tabular mt-0.5 truncate text-xs font-medium sm:text-sm">
        {value}
      </div>
    </div>
  );
}



function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-8 rounded-sm border border-dashed border-hairline bg-card px-6 py-16 text-center">
      <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        {title}
      </div>
      <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground">
        {body}
      </p>
    </div>
  );
}


function SeverityBanner({
  severity,
}: {
  severity: ReturnType<typeof computeSeverity>;
}) {
  const styles: Record<string, { box: string; text: string; pill: string }> = {
    good: {
      box: "border-emerald-300 bg-emerald-50",
      text: "text-emerald-800",
      pill: "bg-emerald-600 text-white",
    },
    moderate: {
      box: "border-amber-300 bg-amber-50",
      text: "text-amber-800",
      pill: "bg-amber-600 text-white",
    },
    critical: {
      box: "border-red-300 bg-red-50",
      text: "text-red-800",
      pill: "bg-red-600 text-white",
    },
  };
  const s = styles[severity.level];
  return (
    <div className={`flex items-center gap-3 rounded-sm border px-3 py-2 ${s.box}`}>
      <span className={`rounded-sm px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] ${s.pill}`}>
        {severity.label}
      </span>
      <div className={`min-w-0 text-[11px] leading-tight ${s.text}`}>
        <div className="text-[9px] uppercase tracking-[0.2em]">Overall Severity</div>
        <div className="truncate">
          Loss {Math.round(severity.loss_pct_of_ceiling)} % of cap · {severity.positive_observations} pos / {severity.negative_observations} neg
        </div>
      </div>
    </div>
  );
}

