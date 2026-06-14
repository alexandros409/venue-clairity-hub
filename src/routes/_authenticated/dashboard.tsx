import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
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
  formatEUR,
  formatDate,
  labelOf,
} from "@/lib/hct/constants";
import { downloadExecutiveReport } from "@/lib/hct/pdf";
import { FileDown, Plus } from "lucide-react";
import { toast } from "sonner";

const search = z.object({ venue: fallback(z.string().optional(), undefined) });

export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: zodValidator(search),
  head: () => ({ meta: [{ title: "Dashboard — HCT" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { venue } = Route.useSearch();
  const navigate = useNavigate({ from: "/_authenticated/dashboard" });
  const listVenuesFn = useServerFn(listVenues);
  const listAuditsFn = useServerFn(listAudits);

  const venuesQ = useQuery({
    queryKey: ["venues"],
    queryFn: () => listVenuesFn(),
  });

  const venues = venuesQ.data ?? [];
  const activeVenue =
    venues.find((v) => v.id === venue) ?? venues[0];
  const activeId = activeVenue?.id;

  const auditsQ = useQuery({
    queryKey: ["audits", activeId ?? "none"],
    queryFn: () => listAuditsFn({ data: { venueId: activeId! } }),
    enabled: !!activeId,
  });

  const audits = auditsQ.data ?? [];

  const totals = useMemo(() => {
    const total = audits.reduce(
      (a, b) => a + Number(b.estimated_loss_eur || 0),
      0,
    );
    const struct = audits.filter((a) => a.diagnosis_type !== "emotion").length;
    const emo = audits.filter((a) => a.diagnosis_type !== "structure").length;
    const denom = struct + emo || 1;
    return {
      count: audits.length,
      total,
      structPct: Math.round((struct / denom) * 100),
      emoPct: Math.round((emo / denom) * 100),
    };
  }, [audits]);

  const topCritical = useMemo(
    () =>
      [...audits]
        .sort(
          (a, b) => Number(b.estimated_loss_eur) - Number(a.estimated_loss_eur),
        )
        .slice(0, 5),
    [audits],
  );

  const [exporting, setExporting] = useState(false);
  async function onExport() {
    if (!activeVenue) return;
    setExporting(true);
    try {
      await downloadExecutiveReport(activeVenue.name, audits);
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
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Operational Diagnostics
        </div>
        <h1 className="mt-3 text-3xl font-medium tracking-tight">
          Audit Console
        </h1>

        <div className="mt-8 rounded-sm border border-hairline bg-card p-6">
          <VenueSelector
            venues={venues}
            value={activeId}
            onChange={setVenue}
          />
        </div>

        {!activeVenue ? (
          <EmptyState
            title="No venue yet"
            body="Add your first venue to begin logging operational bottlenecks."
          />
        ) : (
          <>
            <section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
              <KpiCard label="Total Bottlenecks">
                <span className="tabular text-4xl font-medium">{totals.count}</span>
              </KpiCard>
              <KpiCard label="Audited Financial Loss">
                <span className="tabular text-4xl font-medium">
                  {formatEUR(totals.total)}
                </span>
              </KpiCard>
              <KpiCard label="Structural · Emotional">
                <div className="mt-1 flex items-end gap-3">
                  <span className="tabular text-2xl font-medium">
                    {totals.structPct}
                    <span className="text-base text-muted-foreground"> / {totals.emoPct}</span>
                  </span>
                </div>
                <div className="mt-3 flex h-1.5 overflow-hidden rounded-sm bg-muted">
                  <div
                    className="bg-foreground"
                    style={{ width: `${totals.structPct}%` }}
                  />
                  <div className="bg-gold" style={{ width: `${totals.emoPct}%` }} />
                </div>
              </KpiCard>
            </section>

            <section className="mt-10">
              <div className="flex items-center justify-between">
                <h2 className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  Recent Critical Bottlenecks
                </h2>
                <Link
                  to="/_authenticated/audits/new"
                  search={{ venue: activeId }}
                  className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
                >
                  View all →
                </Link>
              </div>
              <div className="mt-4 overflow-hidden rounded-sm border border-hairline bg-card">
                {topCritical.length === 0 ? (
                  <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                    No audit entries yet for this venue.
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="border-b border-hairline text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 text-left font-normal">Date</th>
                        <th className="px-4 py-3 text-left font-normal">Shift</th>
                        <th className="px-4 py-3 text-left font-normal">Category</th>
                        <th className="px-4 py-3 text-right font-normal">Loss</th>
                        <th className="px-4 py-3 text-right font-normal">BSPS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topCritical.map((a) => (
                        <tr
                          key={a.id}
                          className="border-b border-hairline last:border-0 hover:bg-muted/40"
                        >
                          <td className="tabular px-4 py-3">
                            {formatDate(a.audit_date)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {labelOf(SHIFTS, a.shift)}
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              to="/_authenticated/audits/$id"
                              params={{ id: a.id }}
                              className="hover:underline"
                            >
                              {labelOf(PROBLEM_CATEGORIES, a.problem_category)}
                            </Link>
                          </td>
                          <td className="tabular px-4 py-3 text-right font-medium">
                            {formatEUR(Number(a.estimated_loss_eur))}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="inline-flex items-center rounded-sm border border-gold/40 bg-gold/10 px-2 py-0.5 font-mono text-[10px] text-foreground">
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

            <section className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-hairline pt-8">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {activeVenue.name}
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/_authenticated/audits/new"
                  search={{ venue: activeId }}
                  className="inline-flex h-11 items-center rounded-sm border border-hairline bg-card px-5 font-mono text-xs uppercase tracking-[0.2em] hover:bg-muted"
                >
                  <Plus className="mr-2 h-4 w-4" /> New Audit
                </Link>
                <Button
                  onClick={onExport}
                  disabled={exporting || audits.length === 0}
                  className="h-11 rounded-sm bg-foreground px-5 font-mono text-xs uppercase tracking-[0.2em] text-background hover:bg-foreground/90"
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  {exporting ? "Generating…" : "Export Executive Report"}
                </Button>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function KpiCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-sm border border-hairline bg-card p-6">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-4">{children}</div>
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
