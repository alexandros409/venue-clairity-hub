import { Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { CONSULTANT_NAME, APP_NAME } from "@/lib/hct/constants";
import { Button } from "@/components/ui/button";

export function AppHeader() {
  const router = useRouter();
  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  }
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/_authenticated/dashboard" className="flex items-center gap-3">
          <span className="inline-block h-6 w-[3px] bg-gold" />
          <span className="font-mono text-sm tracking-[0.2em] text-foreground">
            {APP_NAME}
          </span>
          <span className="hidden text-xs uppercase tracking-[0.18em] text-muted-foreground sm:inline">
            Hospitality Diagnostic Tool
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <div className="hidden text-right sm:block">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Consultant
            </div>
            <div className="font-mono text-xs text-foreground">{CONSULTANT_NAME}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} className="text-xs">
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
