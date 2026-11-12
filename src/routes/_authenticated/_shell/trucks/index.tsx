import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertOctagon, Truck } from "lucide-react";
import { AddVehicleDialog } from "@/components/add-vehicle-dialog";
import { EntityCard, VehicleAvatar } from "@/components/entity-card";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useFleet } from "@/hooks/use-fleet";
import { VEHICLE_DOC_TYPES } from "@/lib/compliance";
import { docsFor, ownerStatus, vehicleName } from "@/lib/fleet";

export const Route = createFileRoute("/_authenticated/_shell/trucks/")({
  head: () => ({
    meta: [
      { title: "Trucks & Trailers — FleetGuard" },
      {
        name: "description",
        content: "Annual inspections, registrations and insurance for every unit.",
      },
      { property: "og:title", content: "Trucks & Trailers — FleetGuard" },
      {
        property: "og:description",
        content: "Annual inspections, registrations and insurance for every unit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TrucksPage,
});

function TrucksPage() {
  const { data, isLoading, error: fleetError } = useFleet();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Trucks & Trailers"
        title="Equipment compliance"
        description="Annual DOT inspection, cab card and insurance — tracked per unit."
        actions={<AddVehicleDialog />}
      />
      {isLoading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : fleetError ? (
        <Alert variant="destructive">
          <AlertOctagon className="size-4" />
          <AlertTitle>Unable to load equipment</AlertTitle>
          <AlertDescription>
            {fleetError instanceof Error ? fleetError.message : "Please refresh and try again."}
          </AlertDescription>
        </Alert>
      ) : data.vehicles.length === 0 ? (
        <EmptyState
          icon={<Truck className="size-6" />}
          title="No units yet"
          body="Add your first truck or trailer to start tracking its paperwork."
          action={<AddVehicleDialog />}
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.vehicles.map((v, i) => {
            const docs = docsFor(data, v.id).sort(
              (a, b) =>
                VEHICLE_DOC_TYPES.indexOf(a.doc_type) - VEHICLE_DOC_TYPES.indexOf(b.doc_type),
            );
            const spec = [v.year, v.make, v.model].filter(Boolean).join(" ");
            return (
              <Link key={v.id} to="/trucks/$vehicleId" params={{ vehicleId: v.id }}>
                <EntityCard
                  avatar={<VehicleAvatar kind={v.kind} />}
                  title={vehicleName(v)}
                  subtitle={
                    <span className="font-mono text-xs">
                      {spec ? `${spec} · ` : ""}
                      {v.plate ?? "No plate"} · {v.vin ?? "No VIN"}
                    </span>
                  }
                  status={ownerStatus(data, v.id)}
                  docs={docs}
                  delay={i * 0.04}
                />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
