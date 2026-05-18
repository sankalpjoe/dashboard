/**
 * Strategic Maritime Chokepoints
 * Named zones rendered as highlighted regions and text labels on the map.
 */

export interface Chokepoint {
    id: string;
    name: string;
    shortName: string;
    lat: number;
    lon: number;
    /** Approximate bounding radius in km for circle overlay */
    radiusKm: number;
    status: 'ACTIVE_CONFLICT' | 'ELEVATED' | 'MONITORED' | 'NORMAL';
    description: string;
    traffic: string; // annual shipping stats
}

export const CHOKEPOINTS: Chokepoint[] = [
    {
        id: 'hormuz',
        name: 'Strait of Hormuz',
        shortName: 'HORMUZ',
        lat: 26.5667,
        lon: 56.25,
        radiusKm: 60,
        status: 'ELEVATED',
        description: 'Controls ~20% of global oil trade. Critical for India\'s energy imports. Iranian naval presence.',
        traffic: '~21M bbl/day oil transit — 80% of India\'s crude',
    },
    {
        id: 'bab-el-mandeb',
        name: 'Bab-el-Mandeb',
        shortName: 'BAB EL-MANDEB',
        lat: 12.5839,
        lon: 43.3648,
        radiusKm: 55,
        status: 'ACTIVE_CONFLICT',
        description: 'Red Sea entry point. Houthi attacks affecting India-EU trade. Indian Navy escort ops active.',
        traffic: '~6M bbl/day — vital India-Europe route',
    },
    {
        id: 'malacca',
        name: 'Strait of Malacca',
        shortName: 'MALACCA',
        lat: 2.5,
        lon: 101.5,
        radiusKm: 70,
        status: 'MONITORED',
        description: 'World\'s busiest shipping lane. Connects Indian Ocean to Pacific. Critical for India-ASEAN trade. Chinese naval interest.',
        traffic: '~90,000 vessels/year — India\'s eastern gateway',
    },
    {
        id: 'six-degree',
        name: 'Six Degree Channel',
        shortName: '6° CHANNEL',
        lat: 6.0,
        lon: 73.0,
        radiusKm: 50,
        status: 'MONITORED',
        description: 'Strategic channel between Maldives and Minicoy. Indian Navy patrol zone. China-Maldives port deal under watch.',
        traffic: 'Major East-West shipping route',
    },
    {
        id: 'palk-strait',
        name: 'Palk Strait',
        shortName: 'PALK STRAIT',
        lat: 9.5,
        lon: 79.5,
        radiusKm: 30,
        status: 'MONITORED',
        description: 'Navigable channel between India and Sri Lanka. Fishing disputes and smuggling routes. Strategic for southern naval ops.',
        traffic: 'Fishing vessels + small commercial traffic',
    },
    {
        id: 'andaman-sea',
        name: 'Andaman Sea / Malacca Approach',
        shortName: 'ANDAMAN SEA',
        lat: 10.0,
        lon: 95.0,
        radiusKm: 80,
        status: 'MONITORED',
        description: 'Approach to Malacca Strait. India\'s Andaman & Nicobar Command monitors this chokepoint. Chinese naval activity increasing.',
        traffic: 'Gateway to South China Sea',
    },
    {
        id: 'gulf-of-aden',
        name: 'Gulf of Aden',
        shortName: 'GULF OF ADEN',
        lat: 12.0,
        lon: 47.5,
        radiusKm: 90,
        status: 'ACTIVE_CONFLICT',
        description: 'Active Houthi anti-ship ops. Indian Navy INS Tarkash, INS Kochi deployed for escort missions.',
        traffic: 'Major India-Europe maritime corridor',
    },
];

export const CHOKEPOINT_STATUS_COLORS: Record<Chokepoint['status'], [number, number, number, number]> = {
    ACTIVE_CONFLICT: [240, 76, 53, 160],
    ELEVATED: [251, 146, 60, 140],
    MONITORED: [234, 179, 8, 100],
    NORMAL: [100, 200, 100, 80],
};

export const CHOKEPOINT_LINE_COLORS: Record<Chokepoint['status'], [number, number, number, number]> = {
    ACTIVE_CONFLICT: [240, 76, 53, 255],
    ELEVATED: [251, 146, 60, 240],
    MONITORED: [234, 179, 8, 220],
    NORMAL: [100, 200, 100, 200],
};
