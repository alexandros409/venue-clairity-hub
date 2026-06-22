import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const VENUE_COLS =
  "id, name, created_at, concept_type, tables, avg_covers_per_table, avg_check_per_person, cycles_per_shift";

export const listVenues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("venues")
      .select(VENUE_COLS)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const CreateInput = z.object({ name: z.string().min(1).max(120) });

export const createVenue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("venues")
      .insert({ name: data.name, owner_id: context.userId })
      .select(VENUE_COLS)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const ProfileInput = z.object({
  id: z.string().uuid(),
  concept_type: z.string().min(1),
  tables: z.number().int().positive(),
  avg_covers_per_table: z.number().positive(),
  avg_check_per_person: z.number().positive(),
  cycles_per_shift: z.number().positive(),
});

export const updateVenueProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProfileInput.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { data: row, error } = await context.supabase
      .from("venues")
      .update(patch)
      .eq("id", id)
      .select(VENUE_COLS)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
