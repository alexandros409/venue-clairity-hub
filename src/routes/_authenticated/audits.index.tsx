import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { AppHeader } from "@/components/hct/AppHeader";
import { listAudits } from "@/lib/hct/audits.functions";
import { listVenues } from "@/lib/hct/venues.functions";
import {
  PROBLEM_CATEGORIES,
  BSPS_SOLUTIONS,
  SHIFTS,
  formatEUR,
  formatDate,
  labelOf,
} from "@/lib/hct/constants";
import { ArrowLeft, Plus } from "lucide-react";

const search = z.object({ venue: z.string().optional() });

export const Route = createFileRoute("/_authenticated/audits/")({
  validateSearch: zodValidator(search),
  head: () => ({ meta: [{ title: "All Audits — HCT" }] }),
  component: AuditsList,
});

function AuditsList() {
  const { venue } = Route.useSearch();
  const listAuditsFn = useServerFn(listAudits);
  const listVenuesFn = useServerFn(listVenues);

  const venuesQ = useQuery({ queryKey: ["venues"], queryFn: () => listVenuesFn() });
  const activeVenue = (venuesQ.data ?? []).find((v) => v.id === venue);

  const q = useQuery({
    queryKey: ["audits", venue ?? "none"],
    queryFn: () => listAuditsFn({ data: { venueId: venue! } }),
    enabled: !!venue,
  });

  const audits = q.data ?? [];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Link
          to="/dashboard"
          search={{ venue }}
          className="inline-flex items-center font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-3 w-3" /> Back to console
        </Link>

        <div className="mt-6 flex items-end justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              {activeVenue?.name ?? "Venue"}
            </div>
            <h1 className="mt-2 text-3xl font-medium tracking-tight">
              All Audit Entries
            </h1>
          </div>
          {venue && (
            <Link
              to="/audits/new"
              search={{ venue }}
              className="inline-flex h-11 items-center rounded-sm border border-hairline bg-card px-4 font-mono text-xs uppercase tracking-[0.2em] hover:bg-muted"
            >
              <Plus className="mr-2 h-4 w-4" /> New
            </Link>
          )}
        </div>

        {!venue && (
          <div className="mt-10 text-sm text-muted-foreground">
            No venue selected. Return to the console to pick one.
          </div>
        )}

        {q.isLoading && (
          <div className="mt-10 text-sm text-muted-foreground">Loading…</div>
        )}

        {venue && !q.isLoading && audits.length === 0 && (
          <div className="mt-10 rounded-sm border border-dashed border-hairline bg-card px-6 py-16 text-center text-sm text-muted-foreground">
            No audit entries yet for this venue.
          </div>
        )}

        {audits.length > 0 && (
          <div className="mt-8 overflow-hidden rounded-sm border border-hairline bg-card">
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
                {audits.map((a) => (
                  <tr
                    key={a.id}
                    className="cursor-pointer border-b border-hairline last:border-0 hover:bg-muted/40"
                  >
                    <td className="tabular px-4 py-3">
                      <Link
                        to="/audits/$id"
                        params={{ id: a.id }}
                        className="block"
                      >
                        {formatDate(a.audit_date)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <Link to="/audits/$id" params={{ id: a.id }} className="block">
                        {labelOf(SHIFTS, a.shift)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link to="/audits/$id" params={{ id: a.id }} className="block hover:underline">
                        {labelOf(PROBLEM_CATEGORIES, a.problem_category)}
                      </Link>
                    </td>
                    <td className="tabular px-4 py-3 text-right font-medium">
                      <Link to="/audits/$id" params={{ id: a.id }} className="block">
                        {formatEUR(Number(a.estimated_loss_eur))}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to="/audits/$id" params={{ id: a.id }} className="block">
                        <span className="inline-flex items-center rounded-sm border border-gold/40 bg-gold/10 px-2 py-0.5 font-mono text-[10px] text-foreground">
                          {labelOf(BSPS_SOLUTIONS, a.bsps_solution).split(" — ")[0]}
                        </span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
