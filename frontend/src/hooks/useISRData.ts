/**
 * useISRData — Unified ISR (Intelligence, Surveillance, Reconnaissance) hook.
 *
 * Combines real-time data from:
 *   - ADS-B flights (adsb.lol)
 *   - AIS vessels (AISStream)
 *   - OSINT intel feeds (Google News RSS, CERT-IN, PIB, ReliefWeb)
 *
 * Supports AOI bounding-box filtering and emits a unified activity feed.
 */

import { useMemo } from 'react';
import { useIndiaFlights, useIndiaShips } from '@/hooks/useTracking';
import { useLiveIntel } from '@/hooks/useIntel';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface AOIBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export type ISRObjectType = 'flight' | 'vessel' | 'intel';

export interface ISRObject {
  id: string;
  type: ISRObjectType;
  label: string;
  sublabel?: string;
  lat: number;
  lon: number;
  isMilitary: boolean;
  isEmergency: boolean;
  confidence: number; // 0-100
  timestamp: number;
  raw: any; // original object for detail panels
}

export interface ISRStats {
  totalObjects: number;
  flights: number;
  vessels: number;
  intelHotspots: number;
  military: number;
  emergencies: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function inBounds(lat: number, lon: number, aoi: AOIBounds | null): boolean {
  if (!aoi) return true;
  return lat >= aoi.south && lat <= aoi.north && lon >= aoi.west && lon <= aoi.east;
}

// ─── Hook ───────────────────────────────────────────────────────────────────────

export function useISRData(aoi: AOIBounds | null) {
  const { flights, loading: flightsLoading } = useIndiaFlights();
  const { vessels, stats: shipStats } = useIndiaShips();
  const { intel, loading: intelLoading } = useLiveIntel();

  // Normalize all data into ISRObjects
  const allObjects = useMemo<ISRObject[]>(() => {
    const objs: ISRObject[] = [];

    // Flights
    flights.forEach(f => {
      if (f.lat == null || f.lon == null) return;
      objs.push({
        id: `flt-${f.hex}`,
        type: 'flight',
        label: f.callsign || `UNKN-${f.hex.substring(0, 4)}`,
        sublabel: f.isMilitary ? 'MILITARY' : f.isEmergency ? 'EMERGENCY' : 'CIVILIAN',
        lat: f.lat,
        lon: f.lon,
        isMilitary: f.isMilitary,
        isEmergency: f.isEmergency,
        confidence: 95,
        timestamp: f.lastSeen?.getTime?.() ?? Date.now(),
        raw: f,
      });
    });

    // Vessels
    vessels.forEach(v => {
      objs.push({
        id: `ves-${v.mmsi}`,
        type: 'vessel',
        label: v.name || `MMSI-${v.mmsi}`,
        sublabel: v.isMilitary ? 'MILITARY' : v.isDistress ? 'DISTRESS' : (v.shipClass ?? 'VESSEL').toUpperCase(),
        lat: v.lat,
        lon: v.lon,
        isMilitary: v.isMilitary,
        isEmergency: v.isDistress,
        confidence: 90,
        timestamp: Date.now(),
        raw: v,
      });
    });

    // Intel hotspots (only those with coordinates)
    intel.forEach(item => {
      if (item.lat == null || item.lon == null) return;
      objs.push({
        id: `int-${item.id}`,
        type: 'intel',
        label: item.headline.length > 60 ? item.headline.substring(0, 57) + '...' : item.headline,
        sublabel: `${item.source} · ${item.riskLevel.toUpperCase()}`,
        lat: item.lat,
        lon: item.lon,
        isMilitary: item.type === 'military',
        isEmergency: item.riskLevel === 'critical',
        confidence: item.riskLevel === 'critical' ? 95 : item.riskLevel === 'high' ? 80 : 60,
        timestamp: Date.now(),
        raw: item,
      });
    });

    return objs;
  }, [flights, vessels, intel]);

  // Filter by AOI
  const filteredObjects = useMemo(
    () => allObjects.filter(o => inBounds(o.lat, o.lon, aoi)),
    [allObjects, aoi],
  );

  // Activity feed — sorted newest first
  const activityFeed = useMemo(
    () => [...filteredObjects].sort((a, b) => b.timestamp - a.timestamp).slice(0, 50),
    [filteredObjects],
  );

  // Stats
  const stats = useMemo<ISRStats>(() => ({
    totalObjects: filteredObjects.length,
    flights: filteredObjects.filter(o => o.type === 'flight').length,
    vessels: filteredObjects.filter(o => o.type === 'vessel').length,
    intelHotspots: filteredObjects.filter(o => o.type === 'intel').length,
    military: filteredObjects.filter(o => o.isMilitary).length,
    emergencies: filteredObjects.filter(o => o.isEmergency).length,
  }), [filteredObjects]);

  return {
    objects: filteredObjects,
    allObjects,
    activityFeed,
    stats,
    loading: flightsLoading || intelLoading,
  };
}
