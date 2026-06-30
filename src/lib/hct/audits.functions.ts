import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AUDIT_COLS =
  "id, venue_id, audit_date, shift, bottleneck, problem_category, diagnosis_type, estimated_loss_eur, is_positive, bsps_solution, actionable_steps, delay_minutes, affected_covers, created_at";

export const listAudits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ venueId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("audits")
      .select(AUDIT_COLS)
      .order("audit_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (data.venueId) q = q.eq("venue_id", data.venueId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("audits")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Not found");
    return row;
  });

const CreateInput = z.object({
  venue_id: z.string().uuid(),
  audit_date: z.string().min(8),
  shift: z.enum(["morgen", "abend"]),
  bottleneck: z.string().min(1),
  problem_category: z.string().min(1),
  diagnosis_type: z.enum(["structure", "emotion", "both"]),
  estimated_loss_eur: z.number().nonnegative(),
  is_positive: z.boolean().default(false),
  bsps_solution: z.string().min(1),
  actionable_steps: z.string().default(""),
  delay_minutes: z.number().nonnegative().default(5),
  affected_covers: z.number().nonnegative().default(4),
});

export const createAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("audits")
      .insert({ ...data, owner_id: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const UpdateInput = z.object({
  id: z.string().uuid(),
  audit_date: z.string().min(8),
  shift: z.enum(["morgen", "abend"]),
  bottleneck: z.string().min(1),
  problem_category: z.string().min(1),
  diagnosis_type: z.enum(["structure", "emotion", "both"]),
  estimated_loss_eur: z.number().nonnegative(),
  is_positive: z.boolean().default(false),
  bsps_solution: z.string().min(1),
  actionable_steps: z.string().default(""),
  delay_minutes: z.number().nonnegative().default(5),
  affected_covers: z.number().nonnegative().default(4),
});

export const updateAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase
      .from("audits")
      .update(patch)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { id };
  });

export const deleteAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("audits")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { id: data.id };
  });
