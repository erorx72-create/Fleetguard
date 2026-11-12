import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BrandMark } from "@/components/brand";
import { getMagicLinkInfo } from "@/lib/magic-link.functions";
import { prepareSubmission, completeSubmission } from "@/lib/submissions.functions";
import { resolveFileMimeType } from "@/lib/submission-validation";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeText } from "@/lib/validation";

const IS_REMOTE_SUPABASE = Boolean(
  import.meta.env["VITE_SUPABASE_URL"] && import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"],
);

type UploadDocType = "cdl" | "medical_card" | "annual_inspection";

function parseDocTypeParam(): UploadDocType | null {
  if (typeof window === "undefined") return null;
  const t = new URLSearchParams(window.location.search).get("type");
  if (t === "cdl" || t === "medical_card" || t === "annual_inspection") return t;
  return null;
}

export function DriverUploadForm({ token }: { token: string }) {
  const qc = useQueryClient();
  const info = useQuery({
    queryKey: ["magic", token],
    queryFn: async () => {
      if (IS_REMOTE_SUPABASE) {
        return getMagicLinkInfo({ data: { token } });
      }
      const { data: driver, error } = await supabase
        .from("drivers")
        .select("id,full_name,company_id")
        .eq("magic_token", token)
        .maybeSingle();
      if (error || !driver) throw new Error("This upload link is invalid or has been reset");
      const { data: company } = await supabase
        .from("companies")
        .select("name")
        .eq("id", driver.company_id)
        .maybeSingle();
      return {
        driverId: driver.id,
        companyId: driver.company_id,
        driverName: driver.full_name,
        companyName: company?.name ?? "Your carrier",
      };
    },
    retry: false,
  });

  const prepare = useServerFn(prepareSubmission);
  const complete = useServerFn(completeSubmission);
  const input = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<UploadDocType>(() => parseDocTypeParam() ?? "cdl");
  const [state, setState] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const param = parseDocTypeParam();
    if (param) setType(param);
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    const contentType = resolveFileMimeType(file);
    if (file.size > 20 * 1024 * 1024 || !contentType) {
      toast.error("Choose an image or PDF up to 20MB");
      return;
    }

    const cleanState = type === "cdl" ? sanitizeText(state, 80) : "";
    const cleanFileName = sanitizeText(file.name, 200) || "upload";

    setBusy(true);
    try {
      if (IS_REMOTE_SUPABASE) {
        const slot = await prepare({ data: { token, docType: type, fileName: cleanFileName } });
        const { error } = await supabase.storage
          .from("document-uploads")
          .uploadToSignedUrl(slot.path, slot.token, file, { contentType });
        if (error) throw error;
        await complete({
          data: {
            token,
            submissionId: slot.submissionId,
            state: cleanState || undefined,
          },
        });
      } else {
        const { data: driver, error: dErr } = await supabase
          .from("drivers")
          .select("id,company_id")
          .eq("magic_token", token)
          .maybeSingle();
        if (dErr || !driver) throw new Error("This upload link is no longer valid");

        const submissionId = crypto.randomUUID();
        const safeName = cleanFileName.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80);
        const path = `${driver.company_id}/${driver.id}/${submissionId}/${safeName}`;

        const { error: reserveErr } = await supabase.from("document_submissions").insert({
          id: submissionId,
          company_id: driver.company_id,
          driver_id: driver.id,
          doc_type: type,
          file_path: path,
          file_name: cleanFileName,
          review_status: "rejected",
        });
        if (reserveErr) throw reserveErr;

        const { error: upErr } = await supabase.storage
          .from("document-uploads")
          .upload(path, file, { contentType });
        if (upErr) throw upErr;

        const { error: finishErr } = await supabase
          .from("document_submissions")
          .update({
            review_status: "pending",
            state_of_issuance: cleanState || null,
          })
          .eq("id", submissionId);
        if (finishErr) throw finishErr;
      }

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["submissions"] }),
        qc.invalidateQueries({ queryKey: ["fleet"] }),
      ]);
      setSent(true);
      setFile(null);
      setState("");
      toast.success("Document uploaded for safety review");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload — please retry");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-5 py-10">
      <div className="mx-auto max-w-md space-y-8">
        <BrandMark className="size-10" />
        {info.isLoading ? (
          <Loader2 className="animate-spin" aria-label="Loading" />
        ) : info.error ? (
          <>
            <h1 className="text-2xl font-bold">This link isn’t working</h1>
            <p className="text-muted-foreground">Ask your safety manager for a new upload link.</p>
          </>
        ) : (
          <>
            <header>
              <p className="text-sm font-semibold text-muted-foreground">
                {info.data?.companyName}
              </p>
              <h1 className="mt-2 text-3xl font-bold">{info.data?.driverName}</h1>
            </header>
            {sent ? (
              <div className="space-y-4" role="status">
                <CheckCircle2 className="size-12 text-success-foreground" />
                <h2 className="text-xl font-bold">Document sent for review</h2>
                <p className="text-sm text-muted-foreground">
                  Your safety manager can now verify and approve it in real time.
                </p>
                <Button variant="surface" onClick={() => setSent(false)}>
                  Upload another document
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-6">
                <Button
                  type="button"
                  variant="signal"
                  className="h-16 w-full text-base"
                  disabled={busy}
                  onClick={() => input.current?.click()}
                >
                  <Camera /> {file ? "Replace photo / file" : "Take photo / choose file"}
                </Button>
                <input
                  ref={input}
                  type="file"
                  accept="image/*,application/pdf"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
                {file && <p className="break-all text-sm font-medium">{file.name}</p>}
                <div className="space-y-2">
                  <Label>Document type</Label>
                  <Select
                    value={type}
                    disabled={busy}
                    onValueChange={(v) => {
                      if (v === "cdl" || v === "medical_card" || v === "annual_inspection")
                        setType(v);
                    }}
                  >
                    <SelectTrigger className="h-12 w-full" aria-label="Document type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cdl">CDL</SelectItem>
                      <SelectItem value="medical_card">Medical Card</SelectItem>
                      <SelectItem value="annual_inspection">Annual Inspection</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {type === "cdl" && (
                  <div className="space-y-2">
                    <Label htmlFor="issuance">State of Issuance (optional)</Label>
                    <Input
                      id="issuance"
                      maxLength={80}
                      value={state}
                      disabled={busy}
                      onChange={(e) => setState(e.target.value)}
                      className="h-12"
                    />
                  </div>
                )}
                <Button
                  type="submit"
                  variant="signal"
                  disabled={!file || busy}
                  className="h-12 w-full"
                >
                  {busy && <Loader2 className="animate-spin" />}{" "}
                  {busy ? "Sending…" : "Submit document"}
                </Button>
              </form>
            )}
          </>
        )}
      </div>
    </main>
  );
}
