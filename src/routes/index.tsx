import { createFileRoute, Link } from "@tanstack/react-router";
import { APP_LONG_NAME, APP_NAME, CONSULTANT_NAME } from "@/lib/hct/constants";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SDT — Service Diagnostic Tool" },
      {
        name: "description",
        content:
          "Premium B2B diagnostic & audit tool for restaurant operations. Quantify bottlenecks, financial loss, and BSPS solutions.",
      },
      { property: "og:title", content: "SDT — Service Diagnostic Tool" },
      {
        property: "og:description",
        content:
          "Restaurant operational audits, executive reporting, BSPS recommendations.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-8">
        <header className="flex items-center justify-between py-8">
          <div className="flex items-center gap-3">
            <span className="inline-block h-6 w-[3px] bg-gold" />
            <span className="font-mono text-sm tracking-[0.2em]">{APP_NAME}</span>
          </div>
          <Link
            to="/auth"
            className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
          >
            Sign in →
          </Link>
        </header>

        <section className="flex flex-1 flex-col justify-center pb-24 pt-12">
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Service Operational Diagnostics
          </div>
          <h1 className="mt-6 max-w-3xl text-5xl font-medium leading-[1.05] tracking-tight md:text-7xl">
            {APP_LONG_NAME}.
          </h1>
          <p className="mt-8 max-w-xl text-base leading-relaxed text-muted-foreground">
            A premium B2B audit instrument. Quantify bottlenecks, audited financial
            loss, and the exact BSPS module that fixes them. Built for consulting
            engagements where evidence and clarity are the deliverable.
          </p>

          <div className="mt-12 flex items-center gap-4">
            <Link
              to="/auth"
              className="inline-flex h-12 items-center justify-center rounded-sm bg-foreground px-6 font-mono text-xs uppercase tracking-[0.2em] text-background transition hover:bg-foreground/90"
            >
              Enter Console
            </Link>
            <div className="flex items-center gap-3 border-l border-hairline pl-4">
              <span className="inline-block h-2 w-2 rounded-full bg-gold" />
              <span className="font-mono text-xs text-muted-foreground">
                Consultant: {CONSULTANT_NAME}
              </span>
            </div>
          </div>
        </section>

        <footer className="border-t border-hairline py-6 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {APP_NAME} · Confidential Audit Environment
        </footer>
      </div>
    </main>
  );
}
