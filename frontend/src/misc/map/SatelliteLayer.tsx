import { useEffect, useMemo } from "react";
import { Layer } from "@deck.gl/core";
import { ScatterplotLayer } from "@deck.gl/layers";
import { useSatellites } from "@/hooks/useSatellites";

interface SatelliteLayerProps {
  visible?: boolean;
  onLayerCreate?: (layer: Layer) => void;
}

// Simple TLE orbit calculation (simplified for demo)
function calculateSatellitePosition(tle: { line1: string; line2: string }) {
  // In production, use satellite.js or similar library for accurate orbit prediction
  // This is a simplified mock for demonstration
  
  // Extract inclination and RAAN from TLE line 2
  const line2 = tle.line2;
  const inclination = parseFloat(line2.substring(8, 16).trim());
  const raan = parseFloat(line2.substring(17, 25).trim());
  
  // Generate a pseudo-random position based on TLE data
  const time = Date.now() / 10000;
  const lon = ((raan + time) % 360) - 180;
  const lat = Math.sin((inclination + time) * Math.PI / 180) * 60;
  
  return { lon, lat, alt: 400000 }; // 400km altitude
}

export function SatelliteLayer({ visible = true, onLayerCreate }: SatelliteLayerProps) {
  const { data: satelliteData, isLoading } = useSatellites({ enabled: visible });

  const satellitePositions = useMemo(() => {
    if (!satelliteData?.satellites) return [];

    return satelliteData.satellites.map((sat) => {
      const pos = calculateSatellitePosition({ line1: sat.line1, line2: sat.line2 });
      return {
        id: sat.id,
        name: sat.name,
        position: [pos.lon, pos.lat, pos.alt],
        category: sat.category || "unknown",
        country: sat.country || "unknown",
      };
    });
  }, [satelliteData]);

  const layer = useMemo(() => {
    if (!visible || isLoading || satellitePositions.length === 0) return null;

    return new ScatterplotLayer({
      id: "satellites",
      data: satellitePositions,
      pickable: true,
      opacity: 0.8,
      stroked: true,
      filled: true,
      radiusScale: 1,
      radiusMinPixels: 2,
      radiusMaxPixels: 8,
      lineWidthMinPixels: 1,
      getPosition: (d: any) => d.position,
      getRadius: 50000, // 50km radius
      getFillColor: (d: any) => {
        // Color by category
        switch (d.category?.toLowerCase()) {
          case "starlink":
            return [100, 200, 255, 200];
          case "military":
            return [255, 100, 100, 200];
          case "weather":
            return [100, 255, 100, 200];
          case "communications":
            return [255, 200, 100, 200];
          default:
            return [200, 200, 200, 200];
        }
      },
      getLineColor: [255, 255, 255, 100],
      updateTriggers: {
        getPosition: satellitePositions,
      },
    });
  }, [visible, isLoading, satellitePositions]);

  useEffect(() => {
    if (layer && onLayerCreate) {
      onLayerCreate(layer);
    }
  }, [layer, onLayerCreate]);

  return null; // This component doesn't render DOM elements
}

// Export a hook for easier integration
export function useSatelliteLayer(visible: boolean = true) {
  const { data, isLoading, error } = useSatellites({ enabled: visible });

  const satellitePositions = useMemo(() => {
    if (!data?.satellites) return [];

    return data.satellites.map((sat) => {
      const pos = calculateSatellitePosition({ line1: sat.line1, line2: sat.line2 });
      return {
        id: sat.id,
        name: sat.name,
        position: [pos.lon, pos.lat, pos.alt],
        category: sat.category || "unknown",
        country: sat.country || "unknown",
      };
    });
  }, [data]);

  const layer = useMemo(() => {
    if (!visible || isLoading || satellitePositions.length === 0) return null;

    return new ScatterplotLayer({
      id: "satellites",
      data: satellitePositions,
      pickable: true,
      opacity: 0.8,
      stroked: true,
      filled: true,
      radiusScale: 1,
      radiusMinPixels: 2,
      radiusMaxPixels: 8,
      lineWidthMinPixels: 1,
      getPosition: (d: any) => d.position,
      getRadius: 50000,
      getFillColor: (d: any) => {
        switch (d.category?.toLowerCase()) {
          case "starlink":
            return [100, 200, 255, 200];
          case "military":
            return [255, 100, 100, 200];
          case "weather":
            return [100, 255, 100, 200];
          case "communications":
            return [255, 200, 100, 200];
          default:
            return [200, 200, 200, 200];
        }
      },
      getLineColor: [255, 255, 255, 100],
      updateTriggers: {
        getPosition: satellitePositions,
      },
    });
  }, [visible, isLoading, satellitePositions]);

  return {
    layer,
    satelliteCount: satellitePositions.length,
    isLoading,
    error,
  };
}
