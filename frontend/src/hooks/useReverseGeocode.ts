import { useQuery } from "@tanstack/react-query";
import { ofetch } from "ofetch";

export interface GeocodeResult {
  country: string | null;
  code: string | null;
  displayName: string;
}

export function useReverseGeocode(
  lat: number,
  lon: number,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ["reverse-geocode", lat.toFixed(1), lon.toFixed(1)],
    queryFn: async () => {
      return ofetch<GeocodeResult>(
        `/api/reverse-geocode?lat=${lat}&lon=${lon}`
      );
    },
    enabled: options?.enabled !== false && !isNaN(lat) && !isNaN(lon),
    staleTime: 86400_000, // 24 hours (locations don't change)
    gcTime: 604800_000, // 7 days
  });
}

/**
 * Batch reverse geocode multiple coordinates
 */
export function useBatchReverseGeocode(
  coordinates: Array<{ lat: number; lon: number }>,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: [
      "batch-reverse-geocode",
      coordinates.map((c) => `${c.lat.toFixed(1)},${c.lon.toFixed(1)}`).join("|"),
    ],
    queryFn: async () => {
      const results = await Promise.all(
        coordinates.map(({ lat, lon }) =>
          ofetch<GeocodeResult>(`/api/reverse-geocode?lat=${lat}&lon=${lon}`)
        )
      );
      return results;
    },
    enabled: options?.enabled !== false && coordinates.length > 0,
    staleTime: 86400_000,
    gcTime: 604800_000,
  });
}
