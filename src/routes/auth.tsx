import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/hct/constants";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — HCT" }] }),
  component: AuthPage,
});

function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.navigate({ to: "/dashboard" });
    });
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
        toast.success("Account created. You're signed in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-10 flex items-center gap-3">
          <span className="inline-block h-6 w-[3px] bg-gold" />
          <span className="font-mono text-sm tracking-[0.2em]">{APP_NAME}</span>
        </Link>
        <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {mode === "signin" ? "Sign in" : "Create account"}
        </div>
        <h1 className="mt-3 text-2xl font-medium tracking-tight">
          Consultant Console
        </h1>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label className="mb-2 block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Email
            </label>
            <Input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 rounded-sm border-hairline"
            />
          </div>
          <div>
            <label className="mb-2 block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Password
            </label>
            <Input
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 rounded-sm border-hairline"
            />
          </div>
          <Button
            type="submit"
            disabled={busy}
            className="h-11 w-full rounded-sm bg-foreground font-mono text-xs uppercase tracking-[0.2em] text-background hover:bg-foreground/90"
          >
            {busy ? "…" : mode === "signin" ? "Enter Console" : "Create Account"}
          </Button>
        </form>
        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
        >
          {mode === "signin"
            ? "Need an account? Create one →"
            : "Have an account? Sign in →"}
        </button>
      </div>
    </main>
  );
}
