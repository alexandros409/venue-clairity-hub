import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useState } from "react";
import { AppHeader } from "@/components/hct/AppHeader";
import { listAudits, deleteAudit } from "@/lib/hct/audits.functions";
import { listVenues } from "@/lib/hct/venues.functions";
import {
  PROBLEM_CATEGORIES,
  FOH_IMPACT_DISCLAIMER,
  isFohImpactCategory,
  BSPS_SOLUTIONS,
  SHIFTS,
  formatEUR,
  formatDate,
  labelOf,
} from "@/lib/hct/constants";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

const search = z.object({ venue: z.string().optional() });

export const Route = createFileRoute("/_authenticated/audits/")({
  validateSearch: zodValidator(search),
  head: () => ({ meta: [{ title: "All Audits — SDT" }] }),
  component: AuditsList,
});

function AuditsList() {
  const { venue } = Route.useSearch();
  const listAuditsFn = useServerFn(listAudits);
  const listVenuesFn = useServerFn(listVenues);
  const deleteFn = useServerFn(deleteAudit);
  const qc = useQueryClient();

  const venuesQ = useQuery({ queryKey: ["venues"], queryFn: () => listVenuesFn() });
  const activeVenue = (venuesQ.data ?? []).find((v) => v.id === venue);

  const q = useQuery({
    queryKey: ["audits", venue ?? "none"],
    queryFn: () => listAuditsFn({ data: { venueId: venue! } }),
    enabled: !!venue,
  });

  const [pendingDelete, setPendingDelete] = useState<{ id: string; date: string } | null>(null);

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Audit entry deleted.");
      qc.invalidateQueries({ queryKey: ["audits"] });
      setPendingDelete(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete entry"),
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
          <ul className="mt-8 divide-y divide-hairline overflow-hidden rounded-sm border border-hairline bg-card">
            {audits.map((a) => (
              <li
                key={a.id}
                className="flex items-stretch gap-2 hover:bg-muted/40"
              >
                <Link
                  to="/audits/$id"
                  params={{ id: a.id }}
                  className="flex min-w-0 flex-1 flex-col gap-1 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="tabular text-sm font-medium">
                      {formatDate(a.audit_date)}
                    </span>
                    <span className="tabular text-sm font-medium">
                      {(() => {
                        const t = (a as { observation_type?: string }).observation_type
                          ?? ((a as { is_positive?: boolean }).is_positive ? "positive" : "negative");
                        const imp = (a as { experience_impact?: string | null }).experience_impact;
                        if (t === "positive") {
                          return (
                            <span className="rounded-sm bg-emerald-600/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.18em] text-emerald-700">
                              Positive Observation
                            </span>
                          );
                        }
                        if (t === "emotional") {
                          return (
                            <span className="rounded-sm bg-indigo-600/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.18em] text-indigo-700">
                              Emotional · {(imp ?? "med").toString().toUpperCase()}
                            </span>
                          );
                        }
                        return formatEUR(Number(a.estimated_loss_eur));
                      })()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                    <span className="truncate">
                      {labelOf(SHIFTS, a.shift)} · {labelOf(PROBLEM_CATEGORIES, a.problem_category)}
                    </span>
                    <span className="inline-flex shrink-0 items-center rounded-sm border border-gold/40 bg-gold/10 px-2 py-0.5 font-mono text-[10px] text-foreground">
                      {labelOf(BSPS_SOLUTIONS, a.bsps_solution).split(" — ")[0]}
                    </span>
                  </div>
                  {isFohImpactCategory(a.problem_category) && (
                    <div className="text-[10px] leading-snug text-gold">
                      {FOH_IMPACT_DISCLAIMER}
                    </div>
                  )}
                </Link>
                <button
                  type="button"
                  aria-label="Delete entry"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPendingDelete({ id: a.id, date: a.audit_date });
                  }}
                  className="flex w-12 shrink-0 items-center justify-center border-l border-hairline text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && !del.isPending && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this audit entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `Entry from ${formatDate(pendingDelete.date)} will be permanently removed. This cannot be undone.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={del.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete) del.mutate(pendingDelete.id);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {del.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
