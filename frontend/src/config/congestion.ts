/**
 * Known congestion choke-points per city — the "Intersection Matrix" lookup the
 * Traffic & Routing agent cross-references an X→Y route against.
 *
 * Each entry: a junction/flyover/corridor with coordinates, the feeder areas
 * that spill over when it's blocked, and a short restriction note.
 */

export interface ChokePoint {
  name: string;
  lat: number;
  lon: number;
  feeders: string[];   // adjacent areas that gridlock on spillover
  note: string;        // typical restriction when an event hits this point
}

export type CongestionCity = 'BANGALORE' | 'MUMBAI' | 'DELHI' | 'HYDERABAD' | 'CHENNAI';

export const CONGESTION_DB: Record<CongestionCity, ChokePoint[]> = {
  BANGALORE: [
    { name: 'Silk Board Junction',     lat: 12.9172, lon: 77.6230, feeders: ['HSR Layout', 'BTM Layout', 'Hosur Road', 'Outer Ring Road'], note: 'Multi-arm junction; full gridlock when any arm is blocked.' },
    { name: 'KR Puram Bridge',         lat: 13.0073, lon: 77.6958, feeders: ['Tin Factory', 'Whitefield', 'Old Madras Road'], note: 'Single bridge bottleneck over the railway/ORR.' },
    { name: 'Marathahalli Bridge',     lat: 12.9591, lon: 77.6974, feeders: ['Outer Ring Road', 'Sarjapur Road', 'Brookefield'], note: 'ORR funnel; diversions back up to Bellandur.' },
    { name: 'Hebbal Flyover',          lat: 13.0358, lon: 77.5970, feeders: ['Bellary Road', 'Outer Ring Road', 'Airport Road'], note: 'Airport-bound traffic; ramps clog quickly.' },
    { name: 'Tin Factory (Baiyappanahalli)', lat: 13.0008, lon: 77.6700, feeders: ['KR Puram', 'Old Madras Road', 'Banaswadi'], note: 'Chronic bottleneck on Old Madras Road.' },
    { name: 'Richmond Circle / Flyover', lat: 12.9650, lon: 77.5990, feeders: ['Residency Road', 'Double Road', 'Hosur Road'], note: 'Central; protest marches to Town Hall pass here.' },
    { name: 'Goraguntepalya / Yeshwanthpur', lat: 13.0287, lon: 77.5380, feeders: ['Tumkur Road', 'Outer Ring Road', 'Peenya'], note: 'Highway merge; metro works compound delays.' },
    { name: 'Electronic City Flyover', lat: 12.8440, lon: 77.6610, feeders: ['Hosur Road', 'Bommanahalli', 'Bommasandra'], note: 'Elevated expressway; toll-plaza spillback.' },
    { name: 'Town Hall / Anand Rao Circle', lat: 12.9760, lon: 77.5820, feeders: ['JC Road', 'KG Road', 'Majestic'], note: 'Common protest/march terminus in the CBD.' },
    { name: 'Sarjapur Road – ORR', lat: 12.9250, lon: 77.6850, feeders: ['Bellandur', 'HSR Layout', 'Iblur'], note: 'Tech-park rush; one incident locks the corridor.' },
  ],
  MUMBAI: [
    { name: 'Sion Circle',             lat: 19.0440, lon: 72.8620, feeders: ['Eastern Express Highway', 'Dharavi', 'Matunga'], note: 'EEH–city junction; protests choke both arms.' },
    { name: 'Dadar TT Circle',         lat: 19.0190, lon: 72.8440, feeders: ['Dadar', 'Parel', 'Matunga'], note: 'Dense rally/march point; rail+road convergence.' },
    { name: 'Kalanagar Junction (BKC)', lat: 19.0560, lon: 72.8510, feeders: ['Bandra', 'BKC', 'Western Express Highway', 'Sea Link'], note: 'WEH + Sea Link + BKC; VIP movement common.' },
    { name: 'WEH – Andheri (Western Express Hwy)', lat: 19.1190, lon: 72.8470, feeders: ['Andheri', 'Jogeshwari', 'JVLR'], note: 'Arterial highway; lane closures ripple for km.' },
    { name: 'JJ Flyover / CSMT',       lat: 18.9560, lon: 72.8330, feeders: ['CSMT', 'Crawford Market', 'Mohammed Ali Road'], note: 'South Mumbai approach; processions terminate here.' },
    { name: 'Mahim Causeway',          lat: 19.0410, lon: 72.8400, feeders: ['Mahim', 'Bandra', 'Dadar'], note: 'Narrow causeway link between island city and suburbs.' },
    { name: 'Chembur (EEH)',           lat: 19.0620, lon: 72.8990, feeders: ['Eastern Express Highway', 'Govandi', 'Ghatkopar'], note: 'EEH bottleneck; monsoon waterlogging.' },
    { name: 'Worli – Sea Link approach', lat: 19.0290, lon: 72.8170, feeders: ['Worli', 'Prabhadevi', 'Lower Parel'], note: 'Sea Link toll approach; VIP convoys.' },
  ],
  DELHI: [
    { name: 'ITO Junction',            lat: 28.6300, lon: 77.2410, feeders: ['Ring Road', 'Bahadur Shah Zafar Marg', 'Pragati Maidan'], note: 'Major protest/march terminus near govt offices.' },
    { name: 'Ashram Chowk',            lat: 28.5720, lon: 77.2590, feeders: ['Ring Road', 'Mathura Road', 'Lajpat Nagar'], note: 'Chronic chokepoint; underpass works.' },
    { name: 'Dhaula Kuan',             lat: 28.5920, lon: 77.1610, feeders: ['Ring Road', 'NH-48', 'Airport Road'], note: 'Multi-level interchange; airport/cantt traffic.' },
    { name: 'AIIMS Flyover',           lat: 28.5670, lon: 77.2080, feeders: ['Ring Road', 'Aurobindo Marg', 'South Ex'], note: 'Hospital + arterial; ambulances + protests.' },
    { name: 'Moolchand',               lat: 28.5660, lon: 77.2360, feeders: ['Lajpat Nagar', 'Defence Colony', 'Ring Road'], note: 'Ring Road bottleneck.' },
    { name: 'Mukarba Chowk',           lat: 28.7350, lon: 77.1660, feeders: ['Outer Ring Road', 'NH-44', 'GT Karnal Road'], note: 'North Delhi highway interchange; farmer marches.' },
    { name: 'Rajghat / Ring Road',     lat: 28.6410, lon: 77.2490, feeders: ['Ring Road', 'ISBT', 'Yamuna bank'], note: 'Processions and memorials; frequent diversions.' },
    { name: 'Jantar Mantar',           lat: 28.6270, lon: 77.2160, feeders: ['Connaught Place', 'Parliament Street', 'Patel Chowk'], note: 'Designated protest site; CP arms restricted.' },
  ],
  HYDERABAD: [
    { name: 'Mehdipatnam',             lat: 17.3960, lon: 78.4380, feeders: ['PV Narasimha Rao Expressway', 'Masab Tank', 'Tolichowki'], note: 'Bus hub + arterial; rallies converge here.' },
    { name: 'Panjagutta / Punjagutta', lat: 17.4260, lon: 78.4520, feeders: ['Khairatabad', 'Ameerpet', 'Banjara Hills'], note: 'Central junction; flyover ramps clog.' },
    { name: 'Khairatabad',             lat: 17.4140, lon: 78.4610, feeders: ['Lakdikapul', 'NTR Marg', 'Telugu Talli flyover'], note: 'Near Secretariat; VIP movement + protests.' },
    { name: 'Hitec City / Cyber Towers', lat: 17.4480, lon: 78.3760, feeders: ['Gachibowli', 'Madhapur', 'Kondapur'], note: 'IT corridor; peak-hour gridlock.' },
    { name: 'Gachibowli Flyover',      lat: 17.4400, lon: 78.3490, feeders: ['ORR', 'Financial District', 'Nanakramguda'], note: 'ORR feeder; tech-park exodus.' },
    { name: 'Paradise Circle (Secunderabad)', lat: 17.4410, lon: 78.4870, feeders: ['SP Road', 'Begumpet', 'James Street'], note: 'Cantonment junction; processions.' },
    { name: 'LB Nagar',                lat: 17.3470, lon: 78.5520, feeders: ['ORR', 'Dilsukhnagar', 'Vanasthalipuram'], note: 'SE interchange; metro + highway merge.' },
    { name: 'Dilsukhnagar',            lat: 17.3690, lon: 78.5250, feeders: ['LB Nagar', 'Chaderghat', 'Kothapet'], note: 'Dense market+transit hub.' },
  ],
  CHENNAI: [
    { name: 'Kathipara Junction',      lat: 13.0090, lon: 80.2010, feeders: ['GST Road', 'Mount Road', 'Inner Ring Road', 'Airport'], note: 'Cloverleaf interchange; airport + arterial.' },
    { name: 'Koyambedu',               lat: 13.0700, lon: 80.1940, feeders: ['CMBT', 'Poonamallee High Road', 'Inner Ring Road'], note: 'Bus terminus; market spillover.' },
    { name: 'T Nagar (Usman Road)',    lat: 13.0410, lon: 80.2340, feeders: ['Pondy Bazaar', 'Panagal Park', 'GN Chetty Road'], note: 'Retail district; pedestrian + vehicle chaos.' },
    { name: 'Anna Salai / Mount Road', lat: 13.0610, lon: 80.2600, feeders: ['Gemini', 'Teynampet', 'Nandanam'], note: 'Central arterial; processions to Marina.' },
    { name: 'Maduravoyal',             lat: 13.0660, lon: 80.1640, feeders: ['Poonamallee High Road', 'Outer Ring Road', 'Porur'], note: 'ORR + arterial junction; flyover works.' },
    { name: 'Guindy',                  lat: 13.0070, lon: 80.2200, feeders: ['GST Road', 'Anna Salai', 'Velachery Road'], note: 'Industrial + arterial convergence.' },
    { name: 'Marina / Kamarajar Salai', lat: 13.0560, lon: 80.2830, feeders: ['Triplicane', 'Anna Salai', 'Beach Road'], note: 'Common protest/rally terminus.' },
    { name: 'Tambaram',                lat: 12.9250, lon: 80.1270, feeders: ['GST Road', 'Velachery', 'Mudichur'], note: 'Southern gateway; rail + road bottleneck.' },
  ],
};

/** Haversine distance in metres. */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
