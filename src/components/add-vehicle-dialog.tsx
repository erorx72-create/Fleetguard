import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { useInvalidateFleet } from "@/hooks/use-fleet";
import { decodeNhtsaVin } from "@/lib/gov-lookup.functions";
import { VIN_REGEX, normalizeVin, vehicleFormSchema } from "@/lib/validation";

const EMPTY = {
  unit_number: "",
  vin: "",
  plate: "",
  year: "",
  make: "",
  model: "",
  kind: "truck" as "truck" | "trailer",
};

export function AddVehicleDialog() {
  const { company } = useCompany();
  const invalidate = useInvalidateFleet();
  const navigate = useNavigate();
  const runVinDecode = useServerFn(decodeNhtsaVin);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const [vinHint, setVinHint] = useState<string | null>(null);
  const lastDecodedVinRef = useRef<string>("");
  const [form, setForm] = useState(EMPTY);

  async function handleDecodeVin(rawVin: string, silent = false) {
    const cleanVin = normalizeVin(rawVin);
    if (!VIN_REGEX.test(cleanVin)) {
      if (!silent) {
        toast.error("Enter a valid 17-character VIN (letters excluding I/O/Q and digits).");
      }
      return;
    }
    if (silent && lastDecodedVinRef.current === cleanVin) return;
    lastDecodedVinRef.current = cleanVin;
    setDecoding(true);
    setVinHint("Querying NHTSA vPIC database…");
    try {
      const res = await runVinDecode({ data: { vin: cleanVin } });
      if (res.found) {
        setForm((f) => ({
          ...f,
          vin: res.vin,
          year: res.year ? String(res.year) : f.year,
          make: res.make || f.make,
          model: res.model || f.model,
        }));
        const summary = [res.year, res.make, res.model].filter(Boolean).join(" ");
        setVinHint(`NHTSA verified: ${summary}`);
        if (!silent) toast.success(`Decoded ${summary}`);
      } else {
        setVinHint(res.message ?? "VIN not matched — enter Year, Make & Model manually.");
        if (!silent) toast.info(res.message ?? "VIN lookup unavailable — enter details manually.");
      }
    } catch {
      setVinHint("NHTSA lookup unavailable — enter Year, Make & Model manually.");
      if (!silent) toast.info("Could not reach NHTSA vPIC right now — enter details manually.");
    } finally {
      setDecoding(false);
    }
  }

  useEffect(() => {
    const cleanVin = normalizeVin(form.vin);
    if (!open || !VIN_REGEX.test(cleanVin)) return;
    const timer = window.setTimeout(() => {
      void handleDecodeVin(cleanVin, true);
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.vin, open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!company) return;

    const parsed = vehicleFormSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check vehicle details and try again.");
      return;
    }

    setBusy(true);
    const { data, error } = await supabase
      .from("vehicles")
      .insert({
        company_id: company.id,
        kind: parsed.data.kind,
        unit_number: parsed.data.unit_number,
        vin: parsed.data.vin || null,
        plate: parsed.data.plate || null,
        year: parsed.data.year,
        make: parsed.data.make || null,
        model: parsed.data.model || null,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error) {
      toast.error(error.message || "Could not add unit");
      return;
    }
    toast.success(`Unit #${parsed.data.unit_number} added`);
    await invalidate();
    setOpen(false);
    setForm(EMPTY);
    setVinHint(null);
    lastDecodedVinRef.current = "";
    navigate({ to: "/trucks/$vehicleId", params: { vehicleId: data.id } });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setVinHint(null);
          lastDecodedVinRef.current = "";
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="signal" size="lg">
          <Plus /> Add Truck
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Add a truck or trailer</DialogTitle>
            <DialogDescription>
              Enter a 17-character VIN to auto-fill Year, Make, and Model from US NHTSA vPIC.
            </DialogDescription>
          </DialogHeader>
          <ToggleGroup
            type="single"
            variant="outline"
            value={form.kind}
            onValueChange={(v) => v && setForm((f) => ({ ...f, kind: v as "truck" | "trailer" }))}
            className="w-full"
          >
            <ToggleGroupItem value="truck" className="flex-1">
              Truck
            </ToggleGroupItem>
            <ToggleGroupItem value="trailer" className="flex-1">
              Trailer
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="v-unit">Unit #</Label>
              <Input
                id="v-unit"
                required
                placeholder="305"
                value={form.unit_number}
                onChange={(e) => setForm((f) => ({ ...f, unit_number: e.target.value }))}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-plate">License plate</Label>
              <Input
                id="v-plate"
                placeholder="TX 8KL-2291"
                value={form.plate}
                onChange={(e) => setForm((f) => ({ ...f, plate: e.target.value }))}
                className="h-11 font-mono uppercase"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="v-vin">VIN (17 characters)</Label>
            <div className="flex gap-2">
              <Input
                id="v-vin"
                maxLength={17}
                placeholder="1FUJGLDR5CLBP8834"
                value={form.vin}
                onChange={(e) => setForm((f) => ({ ...f, vin: e.target.value.toUpperCase() }))}
                className="h-11 font-mono uppercase"
              />
              <Button
                type="button"
                variant="surface"
                className="h-11 shrink-0"
                disabled={decoding || normalizeVin(form.vin).length < 17}
                onClick={() => void handleDecodeVin(form.vin, false)}
              >
                {decoding ? <Loader2 className="animate-spin" /> : <Sparkles />}
                Decode
              </Button>
            </div>
            {vinHint ? (
              <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                <CheckCircle2 className="size-3.5 shrink-0" />
                {vinHint}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                VIN is permanently locked after creation and cannot be edited later.
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="v-year">Year</Label>
              <Input
                id="v-year"
                inputMode="numeric"
                maxLength={4}
                placeholder="2023"
                value={form.year}
                onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
                className="h-10 font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-make">Make</Label>
              <Input
                id="v-make"
                placeholder="FREIGHTLINER"
                value={form.make}
                onChange={(e) => setForm((f) => ({ ...f, make: e.target.value }))}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-model">Model</Label>
              <Input
                id="v-model"
                placeholder="CASCADIA"
                value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                className="h-10"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="signal" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Add unit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
