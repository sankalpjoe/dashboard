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
        status: 'ACTIVE_CONFLICT',
        description: 'Controls ~20% of global oil trade. Iranian naval presence. US 5th Fleet operating nearby.',
        traffic: '~21M bbl/day oil transit',
    },
    {
        id: 'suez',
        name: 'Suez Canal',
        shortName: 'SUEZ',
        lat: 30.5852,
        lon: 32.2653,
        radiusKm: 50,
        status: 'ELEVATED',
        description: 'Key trade route between Mediterranean and Red Sea. Houthi missile activity affecting traffic.',
        traffic: '~19,000 vessels/year',
    },
    {
        id: 'bosphorus',
        name: 'Bosphorus Strait',
        shortName: 'BOSPHORUS',
        lat: 41.1253,
        lon: 29.0603,
        radiusKm: 35,
        status: 'MONITORED',
        description: 'Turkish-controlled strait. Black Sea access for Russia and Ukraine. Montreux Convention applies.',
        traffic: '~45,000 vessels/year',
    },
    {
        id: 'malacca',
        name: 'Strait of Malacca',
        shortName: 'MALACCA',
        lat: 2.5,
        lon: 101.5,
        radiusKm: 70,
        status: 'MONITORED',
        description: 'World\'s busiest shipping lane. Connects Indian Ocean to Pacific. Piracy risk. Chinese naval interest.',
        traffic: '~90,000 vessels/year',
    },
    {
        id: 'bab-el-mandeb',
        name: 'Bab-el-Mandeb',
        shortName: 'BAB EL-MANDEB',
        lat: 12.5839,
        lon: 43.3648,
        radiusKm: 55,
        status: 'ACTIVE_CONFLICT',
        description: 'Red Sea entry point. Houthi drone and missile attacks targeting commercial shipping since Oct 2023.',
        traffic: '~6M bbl/day oil transit',
    },
    {
        id: 'taiwan-strait',
        name: 'Taiwan Strait',
        shortName: 'TAIWAN STR.',
        lat: 24.5,
        lon: 119.5,
        radiusKm: 55,
        status: 'ELEVATED',
        description: 'PLA exercises increasing. US carrier groups conducting Freedom of Navigation operations.',
        traffic: '~48% of global container shipping',
    },
    {
        id: 'djibouti',
        name: 'Gulf of Aden',
        shortName: 'GULF OF ADEN',
        lat: 12.0,
        lon: 47.5,
        radiusKm: 90,
        status: 'ACTIVE_CONFLICT',
        description: 'Active Houthi anti-ship operations. Coalition naval forces conducting escort missions.',
        traffic: 'Major Europe-Asia corridor',
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
