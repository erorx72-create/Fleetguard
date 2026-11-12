import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { AlertOctagon, Link2, MessageSquareText, Users } from "lucide-react";
import { AddDriverDialog } from "@/components/add-driver-dialog";
import { EntityCard, InitialsAvatar } from "@/components/entity-card";
import { MagicLinkDialog } from "@/components/magic-link-dialog";
import { EmptyState, PageHeader } from "@/components/page-header";
import { SendReminderDialog } from "@/components/send-reminder-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useFleet } from "@/hooks/use-fleet";
import { DRIVER_DOC_TYPES } from "@/lib/compliance";
import { docsFor, ownerStatus, type EnrichedDoc } from "@/lib/fleet";

export const Route = createFileRoute("/_authenticated/_shell/drivers/")({
  head: () => ({
    meta: [
      { title: "Drivers (DQF) — FleetGuard" },
      {
        name: "description",
        content: "Driver qualification files with CDL, medical card, MVR and drug test tracking.",
      },
      { property: "og:title", content: "Drivers (DQF) — FleetGuard" },
      {
        property: "og:description",
        content: "Driver qualification files with CDL, medical card, MVR and drug test tracking.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DriversPage,
});

function pickPriorityDoc(docs: EnrichedDoc[]): EnrichedDoc | undefined {
  return [...docs].sort((a, b) => (a.days ?? -100000) - (b.days ?? -100000))[0];
}

function DriversPage() {
  const { data, isLoading, error: fleetError } = useFleet();
  const [remindingDoc, setRemindingDoc] = useState<EnrichedDoc | null>(null);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Drivers · DQF"
        title="Driver qualification files"
        description="CDL, DOT medical card, MVR and Clearinghouse — one card per driver."
        actions={<AddDriverDialog />}
      />
      {isLoading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : fleetError ? (
        <Alert variant="destructive">
          <AlertOctagon className="size-4" />
          <AlertTitle>Unable to load drivers</AlertTitle>
          <AlertDescription>
            {fleetError instanceof Error ? fleetError.message : "Please refresh and try again."}
          </AlertDescription>
        </Alert>
      ) : data.drivers.length === 0 ? (
        <EmptyState
          icon={<Users className="size-6" />}
          title="No drivers yet"
          body="Add your first driver to start their qualification file."
          action={<AddDriverDialog />}
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.drivers.map((d, i) => {
            const docs = docsFor(data, d.id).sort(
              (a, b) => DRIVER_DOC_TYPES.indexOf(a.doc_type) - DRIVER_DOC_TYPES.indexOf(b.doc_type),
            );
            const targetDoc = pickPriorityDoc(docs);
            return (
              <div key={d.id} className="flex flex-col gap-2">
                <Link to="/drivers/$driverId" params={{ driverId: d.id }} className="block">
                  <EntityCard
                    avatar={<InitialsAvatar name={d.full_name} />}
                    title={d.full_name}
                    subtitle={
                      <>
                        {d.phone ?? "No phone"}
                        {d.hire_date &&
                          ` · Hired ${format(new Date(d.hire_date + "T00:00:00"), "MMM yyyy")}`}
                      </>
                    }
                    status={ownerStatus(data, d.id)}
                    docs={docs}
                    delay={i * 0.04}
                  />
                </Link>
                <div className="flex items-center justify-end gap-2 px-1">
                  <MagicLinkDialog
                    driver={d}
                    compact
                    trigger={
                      <Button variant="ghost" size="sm" className="h-8 text-xs">
                        <Link2 /> Magic Link
                      </Button>
                    }
                  />
                  {targetDoc && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setRemindingDoc(targetDoc)}
                    >
                      <MessageSquareText /> Send Reminder
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SendReminderDialog
        doc={remindingDoc}
        data={data}
        open={Boolean(remindingDoc)}
        onOpenChange={(o) => !o && setRemindingDoc(null)}
      />
    </div>
  );
}
