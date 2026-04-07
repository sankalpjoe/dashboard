import { useQuery } from "@tanstack/react-query";
import { ofetch } from "ofetch";

export interface CompanyEnrichmentData {
  company: {
    name: string;
    domain: string | null;
    description: string | null;
    location: string | null;
    website: string | null;
    founded: number | null;
  };
  github: {
    publicRepos: number;
    followers: number;
    avatarUrl: string;
  } | null;
  techStack: Array<{
    name: string;
    category: string;
    confidence: number;
  }> | null;
  secFilings: {
    totalFilings: number;
    recentFilings: Array<{
      form: string;
      date: string;
      description: string;
    }>;
  } | null;
  hackerNewsMentions: Array<{
    title: string;
    url: string;
    points: number;
    comments: number;
    date: string;
  }> | null;
  enrichedAt: string;
  sources: string[];
}

export function useCompanyEnrichment(
  domain?: string,
  name?: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ["company-enrichment", domain, name],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (domain) params.set("domain", domain);
      if (name) params.set("name", name);

      return ofetch<CompanyEnrichmentData>(
        `/api/enrichment/company?${params.toString()}`
      );
    },
    enabled: options?.enabled !== false && (!!domain || !!name),
    staleTime: 3600_000, // 1 hour
    gcTime: 7200_000, // 2 hours
  });
}
