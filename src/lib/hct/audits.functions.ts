import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  lossForCategory,
  POSITIVE_REINFORCEMENT_TEXT,
  type VenueProfile,
} from "./constants";

const AUDIT_COLS =
  "id, venue_id, audit_date, shift, bottleneck, problem_category, diagnosis_type, estimated_loss_eur, is_positive, is_walkout, bsps_solution, actionable_steps, delay_minutes, affected_covers, created_at";

const VENUE_PROFILE_COLS =
  "concept_type, tables, avg_covers_per_table, avg_check_per_person, cycles_per_shift";

type VenueProfileRow = {
  concept_type: string | null;
  tables: number | null;
  avg_covers_per_table: number | string | null;
  avg_check_per_person: number | string | null;
  cycles_per_shift: number | string | null;
};

function rowToProfile(row: VenueProfileRow): VenueProfile {
  const n = (v: unknown) =>
    v === null || v === undefined || v === "" ? null : Number(v);
  return {
    concept_type: row.concept_type,
    tables: row.tables,
    avg_covers_per_table: n(row.avg_covers_per_table),
    avg_check_per_person: n(row.avg_check_per_person),
    cycles_per_shift: n(row.cycles_per_shift),
  };
}

/**
 * Authoritative server-side enforcement so neither stale client state nor a
 * pre-existing row can drift the math:
 *   - Positive observations → loss = 0 AND actionable_steps are forced to the
 *     canonical Greek reinforcement template (no corrective protocol can leak).
 *   - Negative observations → loss is recomputed from the venue profile +
 *     category + per-incident metrics (affected_covers, delay_minutes). The
 *     value submitted by the client is ignored, so the dashboard total can no
 *     longer be biased toward the safety cap by an inflated client input.
 */
function enforceServerSide(
  category: string,
  isPositive: boolean,
  metrics: { delay_minutes: number; affected_covers: number; is_walkout: boolean },
  actionable_steps: string,
  venue: VenueProfile,
): { estimated_loss_eur: number; actionable_steps: string } {
  if (isPositive) {
    return {
      estimated_loss_eur: 0,
      actionable_steps: POSITIVE_REINFORCEMENT_TEXT,
    };
  }
  const loss = lossForCategory(category, venue, metrics);
  return {
    estimated_loss_eur: Math.max(0, Math.round(loss)),
    actionable_steps,
  };
}


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
    const { data: venueRow, error: venueErr } = await context.supabase
      .from("venues")
      .select(VENUE_PROFILE_COLS)
      .eq("id", data.venue_id)
      .maybeSingle();
    if (venueErr) throw new Error(venueErr.message);
    if (!venueRow) throw new Error("Venue not found");

    const enforced = enforceServerSide(
      data.problem_category,
      data.is_positive,
      { delay_minutes: data.delay_minutes, affected_covers: data.affected_covers },
      data.actionable_steps,
      rowToProfile(venueRow as VenueProfileRow),
    );

    const { data: row, error } = await context.supabase
      .from("audits")
      .insert({
        ...data,
        estimated_loss_eur: enforced.estimated_loss_eur,
        actionable_steps: enforced.actionable_steps,
        owner_id: context.userId,
      })
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

    const { data: existing, error: existingErr } = await context.supabase
      .from("audits")
      .select("venue_id")
      .eq("id", id)
      .maybeSingle();
    if (existingErr) throw new Error(existingErr.message);
    if (!existing) throw new Error("Audit not found");

    const { data: venueRow, error: venueErr } = await context.supabase
      .from("venues")
      .select(VENUE_PROFILE_COLS)
      .eq("id", existing.venue_id)
      .maybeSingle();
    if (venueErr) throw new Error(venueErr.message);
    if (!venueRow) throw new Error("Venue not found");

    const enforced = enforceServerSide(
      patch.problem_category,
      patch.is_positive,
      { delay_minutes: patch.delay_minutes, affected_covers: patch.affected_covers },
      patch.actionable_steps,
      rowToProfile(venueRow as VenueProfileRow),
    );

    const { error } = await context.supabase
      .from("audits")
      .update({
        ...patch,
        estimated_loss_eur: enforced.estimated_loss_eur,
        actionable_steps: enforced.actionable_steps,
      })
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
