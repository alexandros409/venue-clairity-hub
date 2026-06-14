import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createVenue } from "@/lib/hct/venues.functions";
import { Plus } from "lucide-react";

type Venue = { id: string; name: string };

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
