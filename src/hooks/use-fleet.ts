import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/hooks/use-company";
import { supabase } from "@/integrations/supabase/client";
import { fleetQuery, type FleetData } from "@/lib/fleet";

const EMPTY: FleetData = { drivers: [], vehicles: [], documents: [] };

export function useFleet() {
  const { company } = useCompany();
  const qc = useQueryClient();
  const companyId = company?.id;

  const query = useQuery({
    ...fleetQuery(companyId ?? "none"),
    enabled: Boolean(companyId),
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (!companyId) return;

    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.startsWith("fleetguard.mock")) {
        void qc.invalidateQueries({ queryKey: ["fleet", companyId] });
        void qc.invalidateQueries({ queryKey: ["submissions", companyId] });
      }
    };
    window.addEventListener("storage", onStorage);

    const clientWithRealtime = supabase as unknown as {
      channel?: (name: string) => {
        on: (
          event: string,
          filter: Record<string, unknown>,
          callback: () => void,
        ) => {
          on: (
            event: string,
            filter: Record<string, unknown>,
            callback: () => void,
          ) => {
            on: (
              event: string,
              filter: Record<string, unknown>,
              callback: () => void,
            ) => { subscribe: () => unknown };
          };
        };
      };
      removeChannel?: (ch: unknown) => void;
    };

    const channel =
      typeof clientWithRealtime.channel === "function"
        ? clientWithRealtime
            .channel(`fleet-live-${companyId}`)
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "documents",
                filter: `company_id=eq.${companyId}`,
              },
              () => {
                void qc.invalidateQueries({ queryKey: ["fleet", companyId] });
              },
            )
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "drivers",
                filter: `company_id=eq.${companyId}`,
              },
              () => {
                void qc.invalidateQueries({ queryKey: ["fleet", companyId] });
              },
            )
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "document_submissions",
                filter: `company_id=eq.${companyId}`,
              },
              () => {
                void qc.invalidateQueries({ queryKey: ["fleet", companyId] });
                void qc.invalidateQueries({ queryKey: ["submissions", companyId] });
              },
            )
            .subscribe()
        : null;

    return () => {
      window.removeEventListener("storage", onStorage);
      if (channel && typeof clientWithRealtime.removeChannel === "function") {
        clientWithRealtime.removeChannel(channel);
      }
    };
  }, [companyId, qc]);

  return {
    company,
    data: query.data ?? EMPTY,
    isLoading: !company || query.isLoading,
    error: query.error,
  };
}

export function useInvalidateFleet() {
  const qc = useQueryClient();
  const { company } = useCompany();
  return () => qc.invalidateQueries({ queryKey: ["fleet", company?.id] });
}
