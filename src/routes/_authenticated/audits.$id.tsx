import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppHeader } from "@/components/hct/AppHeader";
import { getAudit } from "@/lib/hct/audits.functions";
import {
  PROBLEM_CATEGORIES,
  BSPS_SOLUTIONS,
  DIAGNOSIS_TYPES,
  SHIFTS,
  labelOf,
  formatEUR,
  formatDate,
} from "@/lib/hct/constants";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/audits/$id")({
  head: () => ({ meta: [{ title: "Audit Entry — HCT" }] }),
  component: AuditDetail,
});

function AuditDetail() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getAudit);
  const q = useQuery({
    queryKey: ["audit", id],
    queryFn: () => getFn({ data: { id } }),
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Link
          to="/_authenticated/dashboard"
          className="inline-flex items-center font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-3 w-3" /> Back to console
        </Link>

        {q.isLoading && (
          <div className="mt-10 text-sm text-muted-foreground">Loading…</div>
        )}
        {q.error && (
          <div className="mt-10 text-sm text-destructive">
            {q.error instanceof Error ? q.error.message : "Failed to load"}
          </div>
        )}
        {q.data && (
          <article className="mt-6">
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Audit Entry
            </div>
            <h1 className="mt-3 text-2xl font-medium tracking-tight">
              {labelOf(PROBLEM_CATEGORIES, q.data.problem_category)}
            </h1>
            <div className="mt-2 font-mono text-xs text-muted-foreground">
              {formatDate(q.data.audit_date)} · {labelOf(SHIFTS, q.data.shift)}
            </div>

            <section className="mt-8 grid grid-cols-3 gap-4">
              <Meta label="Audited Loss" value={formatEUR(Number(q.data.estimated_loss_eur))} />
              <Meta label="Diagnosis" value={labelOf(DIAGNOSIS_TYPES, q.data.diagnosis_type)} />
              <Meta label="BSPS Module" value={q.data.bsps_solution} />
            </section>

            <section className="mt-10">
              <h2 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Bottleneck
              </h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">
                {q.data.bottleneck}
              </p>
            </section>

            <section className="mt-10">
              <h2 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Recommended BSPS Module
              </h2>
              <p className="mt-3 text-sm">{labelOf(BSPS_SOLUTIONS, q.data.bsps_solution)}</p>
            </section>

            {q.data.actionable_steps && (
              <section className="mt-10">
                <h2 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Actionable Steps
                </h2>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">
                  {q.data.actionable_steps}
                </p>
              </section>
            )}
          </article>
        )}
      </main>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-hairline bg-card p-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </div>
      <div className="tabular mt-2 text-lg">{value}</div>
    </div>
  );
}
