import { useMutation } from "@tanstack/react-query";
import { ofetch } from "ofetch";

export interface OSINTDorkRequest {
  name: string;
  company: string;
  queries?: string[];
}

export interface OSINTDorkResult {
  executive: {
    name: string;
    company: string;
  };
  queries: Record<string, string>;
  findings: Record<string, {
    query: string;
    note: string;
    results: any[];
  }>;
  summary: {
    totalFindings: number;
    riskLevel: string;
    sentiment: string;
    recommendation: string;
  };
}

export function useCXODorking() {
  return useMutation({
    mutationFn: async (request: OSINTDorkRequest) => {
      return ofetch<OSINTDorkResult>("/api/osint/dork-cxo", {
        method: "POST",
        body: request,
      });
    },
  });
}
