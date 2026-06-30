import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createVenue, updateVenueProfile, deleteVenue } from "@/lib/hct/venues.functions";
import { CONCEPT_TYPES, isVenueProfileComplete } from "@/lib/hct/constants";
import { Plus, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Venue = {
  id: string;
  name: string;
  concept_type?: string | null;
  tables?: number | null;
  avg_covers_per_table?: number | string | null;
  avg_check_per_person?: number | string | null;
  cycles_per_shift?: number | string | null;
};

export function VenueSelector({
  venues,
  value,
  onChange,
}: {
  venues: Venue[];
  value: string | undefined;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const qc = useQueryClient();
  const create = useServerFn(createVenue);
  const m = useMutation({
    mutationFn: (n: string) => create({ data: { name: n } }),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["venues"] });
      setOpen(false);
      setName("");
      if (row?.id) onChange(row.id);
    },
  });

  const active = venues.find((v) => v.id === value);

  return (
    <div className="flex items-end gap-3">
      <div className="flex-1">
        <label className="mb-2 block text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Venue
        </label>
        <Select value={value ?? ""} onValueChange={onChange}>
          <SelectTrigger className="h-12 rounded-sm border-hairline bg-card text-left text-base">
            <SelectValue placeholder="Select a venue…" />
          </SelectTrigger>
          <SelectContent>
            {venues.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.name}
              </SelectItem>
            ))}
            {venues.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                No venues yet.
              </div>
            )}
          </SelectContent>
        </Select>
      </div>

      {active && (
        <ProfileDialog
          venue={active}
          incomplete={!isVenueProfileComplete({
            concept_type: active.concept_type ?? null,
            tables: active.tables ?? null,
            avg_covers_per_table: numOrNull(active.avg_covers_per_table),
            avg_check_per_person: numOrNull(active.avg_check_per_person),
            cycles_per_shift: numOrNull(active.cycles_per_shift),
          })}
        />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="h-12 rounded-sm border-hairline">
            <Plus className="mr-1 h-4 w-4" /> Add Venue
          </Button>
        </DialogTrigger>
        <DialogContent className="rounded-sm">
          <DialogHeader>
            <DialogTitle>Add new venue</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="e.g. Ristorante Marenostro"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-sm"
          />
          <DialogFooter>
            <Button
              onClick={() => name.trim() && m.mutate(name.trim())}
              disabled={!name.trim() || m.isPending}
              className="rounded-sm bg-foreground text-background"
            >
              {m.isPending ? "Adding…" : "Add Venue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function ProfileDialog({ venue, incomplete }: { venue: Venue; incomplete: boolean }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const updateFn = useServerFn(updateVenueProfile);

  const [form, setForm] = useState({
    concept_type: venue.concept_type ?? "",
    tables: venue.tables != null ? String(venue.tables) : "",
    avg_covers_per_table:
      venue.avg_covers_per_table != null ? String(venue.avg_covers_per_table) : "",
    avg_check_per_person:
      venue.avg_check_per_person != null ? String(venue.avg_check_per_person) : "",
    cycles_per_shift:
      venue.cycles_per_shift != null ? String(venue.cycles_per_shift) : "",
  });

  useEffect(() => {
    setForm({
      concept_type: venue.concept_type ?? "",
      tables: venue.tables != null ? String(venue.tables) : "",
      avg_covers_per_table:
        venue.avg_covers_per_table != null ? String(venue.avg_covers_per_table) : "",
      avg_check_per_person:
        venue.avg_check_per_person != null ? String(venue.avg_check_per_person) : "",
      cycles_per_shift:
        venue.cycles_per_shift != null ? String(venue.cycles_per_shift) : "",
    });
  }, [venue.id, venue.concept_type, venue.tables, venue.avg_covers_per_table, venue.avg_check_per_person, venue.cycles_per_shift]);

  const m = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          id: venue.id,
          concept_type: form.concept_type,
          tables: Number(form.tables),
          avg_covers_per_table: Number(form.avg_covers_per_table),
          avg_check_per_person: Number(form.avg_check_per_person),
          cycles_per_shift: Number(form.cycles_per_shift),
        },
      }),
    onSuccess: () => {
      toast.success("Venue profile saved.");
      qc.invalidateQueries({ queryKey: ["venues"] });
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const canSave =
    !!form.concept_type &&
    Number(form.tables) > 0 &&
    Number(form.avg_covers_per_table) > 0 &&
    Number(form.avg_check_per_person) > 0 &&
    Number(form.cycles_per_shift) > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className={`h-12 rounded-sm border-hairline ${incomplete ? "border-destructive/60 text-destructive" : ""}`}
          title="Edit venue profile"
        >
          <Settings2 className="mr-1 h-4 w-4" />
          {incomplete ? "Setup Profile" : "Profile"}
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-sm sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Venue Setup — {venue.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Concept Type">
            <Select
              value={form.concept_type}
              onValueChange={(v) => setForm((f) => ({ ...f, concept_type: v }))}
            >
              <SelectTrigger className="h-11 rounded-sm border-hairline">
                <SelectValue placeholder="Select concept" />
              </SelectTrigger>
              <SelectContent>
                {CONCEPT_TYPES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tables (total)">
              <Input
                inputMode="numeric"
                value={form.tables}
                onChange={(e) => setForm((f) => ({ ...f, tables: e.target.value }))}
                className="h-11 rounded-sm border-hairline"
              />
            </Field>
            <Field label="Avg Covers / Table">
              <Input
                inputMode="decimal"
                value={form.avg_covers_per_table}
                onChange={(e) => setForm((f) => ({ ...f, avg_covers_per_table: e.target.value }))}
                className="h-11 rounded-sm border-hairline"
              />
            </Field>
            <Field label="Avg Check / Person (€)">
              <Input
                inputMode="decimal"
                value={form.avg_check_per_person}
                onChange={(e) => setForm((f) => ({ ...f, avg_check_per_person: e.target.value }))}
                className="h-11 rounded-sm border-hairline"
              />
            </Field>
            <Field label="Cycles / Shift">
              <Input
                inputMode="decimal"
                value={form.cycles_per_shift}
                onChange={(e) => setForm((f) => ({ ...f, cycles_per_shift: e.target.value }))}
                className="h-11 rounded-sm border-hairline"
              />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => m.mutate()}
            disabled={!canSave || m.isPending}
            className="rounded-sm bg-foreground text-background"
          >
            {m.isPending ? "Saving…" : "Save Profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
