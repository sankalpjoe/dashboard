import { useQuery } from "@tanstack/react-query";
import { ofetch } from "ofetch";

export type SignalType =
  | "hiring_surge"
  | "funding_event"
  | "expansion_signal"
  | "technology_adoption"
  | "executive_movement"
  | "financial_trigger"
  | "press_release";

export type SignalStrength = "critical" | "high" | "medium" | "low";

export interface CompanySignal {
  type: SignalType;
  title: string;
  url: string;
  source: string;
  sourceTier: number;
  timestamp: string;
  strength: SignalStrength;
  engagement: {
    points?: number;
    comments?: number;
    stars?: number;
    forks?: number;
    mentions?: number;
  };
}

export interface CompanySignalsData {
  company: string;
  domain: string | null;
  signals: CompanySignal[];
  summary: {
    totalSignals: number;
    byType: Record<SignalType, number>;
    strongestSignal: CompanySignal | null;
    signalDiversity: number;
  };
  discoveredAt: string;
}

export function useCompanySignals(
  company: string,
  domain?: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ["company-signals", company, domain],
    queryFn: async () => {
      const params = new URLSearchParams({ company });
      if (domain) params.set("domain", domain);

      return ofetch<CompanySignalsData>(
        `/api/enrichment/signals?${params.toString()}`
      );
    },
    enabled: options?.enabled !== false && !!company,
    staleTime: 1800_000, // 30 minutes
    gcTime: 3600_000, // 1 hour
  });
}
