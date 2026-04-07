import { useQuery } from "@tanstack/react-query";
import { ofetch } from "ofetch";

export interface SatelliteTLE {
  id: string;
  name: string;
  line1: string;
  line2: string;
  category?: string;
  country?: string;
  launchDate?: string;
}

export interface SatelliteData {
  satellites: SatelliteTLE[];
  fetchedAt: string;
  totalCount: number;
  categories?: Record<string, number>;
}

export function useSatellites(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["satellites"],
    queryFn: async () => {
      return ofetch<SatelliteData>("/api/satellites");
    },
    enabled: options?.enabled !== false,
    staleTime: 600_000, // 10 minutes
    gcTime: 1800_000, // 30 minutes
    refetchInterval: 600_000, // Refetch every 10 minutes
  });
}
