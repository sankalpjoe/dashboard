/**
 * Tactical Data & Constants
 * Ported from the addition folder to the main ISR dashboard.
 */

export interface Theater {
  id: string;
  name: string;
  aor: string;
  color: string;
}

export interface OrbatUnit {
  id: string;
  theater: string;
  echelon: 'CORPS' | 'DIV' | 'BDE' | 'BN' | 'CO' | 'TM';
  symbol: string;
  name: string;
  strength: number;
  status: string;
  loc: string;
  subordinates: number;
}

export interface Route {
  id: string;
  name: string;
  from: string;
  to: string;
  distance: string;
  threatLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  eta: string;
  waypoints: number;
  status: string;
}

export const THEATERS: Theater[] = [
  { id: 'NORTH', name: 'NORTHERN THEATER', aor: 'J&K / Ladakh', color: '#FFB84D' },
  { id: 'WEST', name: 'WESTERN THEATER', aor: 'Punjab / Rajasthan', color: '#7FB069' },
  { id: 'EAST', name: 'EASTERN THEATER', aor: 'Sikkim / Arunachal', color: '#FF9933' },
  { id: 'MARITIME', name: 'MARITIME COMMAND', aor: 'Indian Ocean / Arabian Sea', color: '#00F0FF' },
  { id: 'SPECIAL', name: 'SPEC-OPS COMMAND', aor: 'Global / Classified', color: '#FF5757' }
];

export const ORBAT_UNITS: OrbatUnit[] = [
  // --- NORTHERN THEATER ---
  { id: 'U101', theater: 'NORTH', echelon: 'CORPS', symbol: '✕✕✕', name: 'XIV Corps (Fire & Fury)', strength: 55000, status: 'COMBAT-READY', loc: 'Leh, Ladakh', subordinates: 3 },
  { id: 'U102', theater: 'NORTH', echelon: 'DIV', symbol: '✕✕', name: '8 Mountain Division', strength: 14200, status: 'DEPLOYED', loc: 'Dras, Ladakh', subordinates: 3 },
  { id: 'U103', theater: 'NORTH', echelon: 'DIV', symbol: '✕✕', name: '3 Infantry Division', strength: 13800, status: 'COMBAT-READY', loc: 'Karu, Ladakh', subordinates: 3 },
  { id: 'U104', theater: 'NORTH', echelon: 'CORPS', symbol: '✕✕✕', name: 'XV Corps (Chinar)', strength: 52000, status: 'DEPLOYED', loc: 'Srinagar, JK', subordinates: 4 },
  { id: 'U105', theater: 'NORTH', echelon: 'DIV', symbol: '✕✕', name: '19 Infantry Division', strength: 12500, status: 'ACTIVE', loc: 'Baramulla, JK', subordinates: 3 },
  { id: 'U4', theater: 'NORTH', echelon: 'BN', symbol: '||', name: '5/4 Gorkha Rifles', strength: 850, status: 'DEPLOYED', loc: 'Point 4512', subordinates: 5 },
  { id: 'U5', theater: 'NORTH', echelon: 'CO', symbol: '|', name: 'Charlie Coy / 5/4 GR', strength: 140, status: 'ACTIVE', loc: 'Forward Post', subordinates: 0 },

  // --- WESTERN THEATER ---
  { id: 'U1', theater: 'WEST', echelon: 'CORPS', symbol: '✕✕✕', name: '1 Strike Corps', strength: 45000, status: 'COMBAT-READY', loc: 'Mathura, IN', subordinates: 3 },
  { id: 'U2', theater: 'WEST', echelon: 'DIV', symbol: '✕✕', name: '10 Infantry Division', strength: 12000, status: 'DEPLOYED', loc: 'Akhnoor, JK', subordinates: 3 },
  { id: 'U3', theater: 'WEST', echelon: 'BDE', symbol: '✕', name: '191 Field Brigade', strength: 3200, status: 'COMBAT-READY', loc: 'Chamb, JK', subordinates: 4 },
  { id: 'U201', theater: 'WEST', echelon: 'CORPS', symbol: '✕✕✕', name: 'IX Corps (Rising Star)', strength: 48000, status: 'STANDBY', loc: 'Yol, HP', subordinates: 3 },
  { id: 'U202', theater: 'WEST', echelon: 'DIV', symbol: '✕✕', name: '26 Infantry Division', strength: 11800, status: 'OPERATIONAL', loc: 'Jammu, JK', subordinates: 3 },
  
  // --- PK SIDE (OPFOR) ---
  { id: 'U6', theater: 'WEST', echelon: 'CORPS', symbol: '✕✕✕', name: '2 Strike Corps (Kharian)', strength: 42000, status: 'OPERATIONAL', loc: 'Kharian, PK', subordinates: 3 },
  { id: 'U7', theater: 'WEST', echelon: 'DIV', symbol: '✕✕', name: '17 Infantry Division', strength: 11500, status: 'STANDBY', loc: 'Pano Akil, PK', subordinates: 3 },

  // --- EASTERN THEATER ---
  { id: 'U301', theater: 'EAST', echelon: 'CORPS', symbol: '✕✕✕', name: 'III Corps (Spear)', strength: 44000, status: 'ACTIVE', loc: 'Dimapur, NL', subordinates: 3 },
  { id: 'U302', theater: 'EAST', echelon: 'DIV', symbol: '✕✕', name: '2 Mountain Division', strength: 13500, status: 'DEPLOYED', loc: 'Dinjan, AS', subordinates: 3 },
  { id: 'U303', theater: 'EAST', echelon: 'DIV', symbol: '✕✕', name: '5 Mountain Division', strength: 14100, status: 'COMBAT-READY', loc: 'Bomdila, AR', subordinates: 3 },
  { id: 'U304', theater: 'EAST', echelon: 'CORPS', symbol: '✕✕✕', name: 'XXXIII Corps (Trishakti)', strength: 46000, status: 'STANDBY', loc: 'Sukna, WB', subordinates: 3 },

  // --- MARITIME COMMAND ---
  { id: 'U401', theater: 'MARITIME', echelon: 'CORPS', symbol: '⚓', name: 'Western Naval Command', strength: 22000, status: 'ACTIVE', loc: 'Mumbai, MH', subordinates: 5 },
  { id: 'U402', theater: 'MARITIME', echelon: 'DIV', symbol: '✕✕', name: 'Carrier Battle Group 1', strength: 4500, status: 'AT-SEA', loc: 'Arabian Sea', subordinates: 4 },
  { id: 'U403', theater: 'MARITIME', echelon: 'BDE', symbol: '✕', name: 'Amphibious Task Force', strength: 1800, status: 'READY', loc: 'Kochi, KL', subordinates: 3 },

  // --- SPECIAL OPS ---
  { id: 'U8', theater: 'SPECIAL', echelon: 'TM', symbol: '⊕', name: 'ALPHA SQUAD (SSG)', strength: 12, status: 'ACTIVE', loc: 'CLASSIFIED', subordinates: 0 },
  { id: 'U501', theater: 'SPECIAL', echelon: 'BN', symbol: '||', name: '9 PARA (SF)', strength: 780, status: 'ACTIVE', loc: 'LEH AOR', subordinates: 4 },
  { id: 'U502', theater: 'SPECIAL', echelon: 'CO', symbol: '|', name: 'MARCOS UNIT 4', strength: 65, status: 'ACTIVE', loc: 'COASTAL', subordinates: 0 }
];

export const ROUTES: Route[] = [
  { id: 'RT-A1', name: 'GT ROAD AXIS', from: 'Amritsar', to: 'Lahore', distance: '50 km', threatLevel: 'HIGH', eta: '1h 15m', waypoints: 4, status: 'MONITORED' },
  { id: 'RT-B2', name: 'SILK ROUTE', from: 'Srinagar', to: 'Leh', distance: '420 km', threatLevel: 'MEDIUM', eta: '12h 45m', waypoints: 8, status: 'CLEAR' },
  { id: 'RT-C3', name: 'INDUS HIGHWAY', from: 'Karachi', to: 'Peshawar', distance: '1200 km', threatLevel: 'HIGH', eta: '18h 30m', waypoints: 12, status: 'COMPROMISED' },
  { id: 'RT-D4', name: 'LINE OF CONTROL', from: 'Poonch', to: 'Uri', distance: '160 km', threatLevel: 'CRITICAL', eta: 'NO-GO', waypoints: 6, status: 'BLOCKED' }
];

export const MAP_TILE_SOURCES = {
  dark: {
    label: 'CARTO Dark Matter',
    attribution: 'CARTO / OpenStreetMap',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c', 'd'],
    minZoom: 1,
    maxZoom: 19
  },
  satellite: {
    label: 'Esri World Imagery',
    attribution: 'Esri, Maxar, Earthstar Geographics',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    minZoom: 1,
    maxZoom: 19
  },
  topographic: {
    label: 'OpenTopoMap',
    attribution: 'OpenTopoMap / OpenStreetMap',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c'],
    minZoom: 1,
    maxZoom: 17
  }
};
