import { useMemo } from 'react';
import { type Vessel } from './ship-service';

/**
 * Hardcoded dataset extracted from USNI News Fleet and Marine Tracker: March 9, 2026.
 * Plotted in approximate regional coordinates. 
 */
const USNI_VESSELS: Vessel[] = [
    // Japan (Yokosuka)
    {
        mmsi: -1001,
        name: 'USS George Washington (CVN-73)',
        lat: 35.2923, lon: 139.6601,
        shipClass: 'military', isDistress: false, isMilitary: true, isDark: false, lastUpdate: Date.now(),
        destination: 'Yokosuka, Japan',
        vesselClass: 'Nimitz-class Nuclear CVN',
        description: 'Nuclear-powered supercarrier. Forward deployed to Yokosuka, Japan as 7th Fleet flagship. ~90 aircraft, 5,000 crew.',
    },
    // Philippine Sea
    {
        mmsi: -1002,
        name: 'USS Tripoli (LHA-7)',
        lat: 18.0, lon: 130.0,
        shipClass: 'military', isDistress: false, isMilitary: true, isDark: false, lastUpdate: Date.now(),
        vesselClass: 'America-class Amphibious Assault',
        description: 'Large-deck amphibious assault ship. Embarks F-35B jets, AV-8B Harriers, MV-22 Ospreys and USMC ground forces.',
    },
    {
        mmsi: -1003,
        name: 'USS San Diego (LPD-22)',
        lat: 18.1, lon: 130.1,
        shipClass: 'military', isDistress: false, isMilitary: true, isDark: false, lastUpdate: Date.now(),
        vesselClass: 'San Antonio-class LPD',
        description: 'Amphibious transport dock. Carries landing craft, AAVs, and ~700 Marines for expeditionary operations.',
    },
    {
        mmsi: -1004,
        name: 'USS New Orleans (LPD-18)',
        lat: 17.9, lon: 129.9,
        shipClass: 'military', isDistress: false, isMilitary: true, isDark: false, lastUpdate: Date.now(),
        vesselClass: 'San Antonio-class LPD',
        description: 'Amphibious transport dock supporting ARG/MEU operations in the Philippine Sea.',
    },
    // Caribbean Sea
    {
        mmsi: -1005,
        name: 'USS Iwo Jima (LHD-7) ARG',
        lat: 15.0, lon: -75.0,
        shipClass: 'military', isDistress: false, isMilitary: true, isDark: false, lastUpdate: Date.now(),
        vesselClass: 'Wasp-class LHD',
        description: 'Amphibious assault ship leading an ARG. Carries ~1,800 Marines and rotary-wing aviation assets.',
    },
    {
        mmsi: -1006,
        name: 'USS Fort Lauderdale (LPD-28)',
        lat: 15.1, lon: -74.9,
        shipClass: 'military', isDistress: false, isMilitary: true, isDark: false, lastUpdate: Date.now(),
        vesselClass: 'San Antonio-class LPD (Flight II)',
        description: 'Latest-generation amphibious transport dock with enhanced C4ISR and F-35B support capability.',
    },
    {
        mmsi: -1007,
        name: 'USS San Antonio (LPD-17)',
        lat: 14.9, lon: -75.1,
        shipClass: 'military', isDistress: false, isMilitary: true, isDark: false, lastUpdate: Date.now(),
        vesselClass: 'San Antonio-class LPD',
        description: 'Lead ship of class. Multi-mission amphibious transport dock, Caribbean ARG.',
    },
    {
        mmsi: -1008,
        name: 'USS Lake Erie (CG-70)',
        lat: 16.0, lon: -76.0,
        shipClass: 'military', isDistress: false, isMilitary: true, isDark: false, lastUpdate: Date.now(),
        vesselClass: 'Ticonderoga-class Cruiser',
        description: 'Aegis guided-missile cruiser. Carries SM-2/SM-3/SM-6 missiles; proven BMD intercept record.',
    },
    {
        mmsi: -1009,
        name: 'USS Wichita (LCS-13)',
        lat: 16.2, lon: -75.8,
        shipClass: 'military', isDistress: false, isMilitary: true, isDark: false, lastUpdate: Date.now(),
        vesselClass: 'Freedom-class LCS',
        description: 'Littoral combat ship. High-speed surface combatant for coastal and counter-narcotics ops.',
    },
    // Eastern Mediterranean
    {
        mmsi: -1010,
        name: 'USS Roosevelt (DDG-80)',
        lat: 34.0, lon: 33.0,
        shipClass: 'military', isDistress: false, isMilitary: true, isDark: false, lastUpdate: Date.now(),
        vesselClass: 'Arleigh Burke-class DDG (Flight IIA)',
        description: 'Aegis guided-missile destroyer. Eastern Med patrol; carries Tomahawk cruise missiles and SM-2/6.',
    },
    {
        mmsi: -1011,
        name: 'USS Bulkeley (DDG-84)',
        lat: 34.1, lon: 33.2,
        shipClass: 'military', isDistress: false, isMilitary: true, isDark: false, lastUpdate: Date.now(),
        vesselClass: 'Arleigh Burke-class DDG (Flight IIA)',
        description: 'Aegis destroyer, Eastern Med. Anti-air/BMD capable; 90-cell VLS for cruise and air-defense missiles.',
    },
    {
        mmsi: -1012,
        name: 'USS Oscar Austin (DDG-79)',
        lat: 33.9, lon: 32.8,
        shipClass: 'military', isDistress: false, isMilitary: true, isDark: false, lastUpdate: Date.now(),
        vesselClass: 'Arleigh Burke-class DDG (Flight IIA)',
        description: 'Guided-missile destroyer supporting operations in the Eastern Mediterranean and Israel-Gaza corridor.',
    },
    {
        mmsi: -1013,
        name: 'USS Thomas Hudner (DDG-116)',
        lat: 34.2, lon: 32.5,
        shipClass: 'military', isDistress: false, isMilitary: true, isDark: false, lastUpdate: Date.now(),
        vesselClass: 'Arleigh Burke-class DDG (Flight IIA)',
        description: 'Most recent Arleigh Burke class; advanced radar/EW suite. Deployed to Mediterranean.',
    },
    // Red Sea
    {
        mmsi: -1014,
        name: 'USS Gerald R. Ford (CVN-78) CSG',
        lat: 19.0, lon: 39.0,
        shipClass: 'military', isDistress: false, isMilitary: true, isDark: false, lastUpdate: Date.now(),
        vesselClass: 'Gerald R. Ford-class Nuclear CVN',
        description: 'Next-generation supercarrier. Most advanced US warship; EMALS catapults, ~90 aircraft. Red Sea CSG operations.',
    },
    {
        mmsi: -1015,
        name: 'USS Winston S. Churchill (DDG-81)',
        lat: 19.1, lon: 39.1,
        shipClass: 'military', isDistress: false, isMilitary: true, isDark: false, lastUpdate: Date.now(),
        vesselClass: 'Arleigh Burke-class DDG (Flight IIA)',
        description: 'Aegis DDG assigned to Ford CSG; Red Sea escort duty, Houthi threat suppression.',
    },
    {
        mmsi: -1016,
        name: 'USS Bainbridge (DDG-96)',
        lat: 18.9, lon: 38.9,
        shipClass: 'military', isDistress: false, isMilitary: true, isDark: false, lastUpdate: Date.now(),
        vesselClass: 'Arleigh Burke-class DDG (Flight IIA)',
        description: 'CSG escort in Red Sea. Intercepted multiple Houthi anti-ship missiles and drones.',
    },
    {
        mmsi: -1017,
        name: 'USS Mahan (DDG-72)',
        lat: 19.2, lon: 38.8,
        shipClass: 'military', isDistress: false, isMilitary: true, isDark: false, lastUpdate: Date.now(),
        vesselClass: 'Arleigh Burke-class DDG (Flight I)',
        description: 'Guided-missile destroyer in Red Sea; Operation Prosperity Guardian escort duties.',
    },
    // Persian Gulf
    {
        mmsi: -1018,
        name: 'USS Canberra (LCS-30)',
        lat: 26.2, lon: 51.5,
        shipClass: 'military', isDistress: false, isMilitary: true, isDark: false, lastUpdate: Date.now(),
        vesselClass: 'Independence-class LCS',
        description: 'Trimaran littoral combat ship. Persian Gulf patrol; mine countermeasures and ISR missions.',
    },
    {
        mmsi: -1019,
        name: 'USS Tulsa (LCS-16)',
        lat: 26.3, lon: 51.6,
        shipClass: 'military', isDistress: false, isMilitary: true, isDark: false, lastUpdate: Date.now(),
        vesselClass: 'Freedom-class LCS',
        description: 'LCS forward deployed to Persian Gulf for presence and coastal patrol operations.',
    },
    {
        mmsi: -1020,
        name: 'USS Santa Barbara (LCS-32)',
        lat: 26.1, lon: 51.4,
        shipClass: 'military', isDistress: false, isMilitary: true, isDark: false, lastUpdate: Date.now(),
        vesselClass: 'Independence-class LCS',
        description: 'LCS operating in the Strait of Hormuz area; anti-mine and maritime security operations.',
    },
    // Arabian Sea
    {
        mmsi: -1021,
        name: 'USS Abraham Lincoln (CVN-72) CSG',
        lat: 15.0, lon: 65.0,
        shipClass: 'military', isDistress: false, isMilitary: true, isDark: false, lastUpdate: Date.now(),
        vesselClass: 'Nimitz-class Nuclear CVN',
        description: 'Nuclear-powered supercarrier leading CSG-3. Operating in Arabian Sea; ~90 aircraft embarked, 5,000 crew. Key asset monitoring India-Pakistan-Iran corridor.',
    }
];

export function useUSNIShips() {
    const usniVessels = useMemo(() => USNI_VESSELS, []);
    return { usniVessels };
}
