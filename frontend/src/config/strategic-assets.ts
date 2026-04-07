export interface StrategicAsset {
    id: string;
    name: string;
    type: 'nuclear' | 'base' | 'spaceport' | 'cable' | 'pipeline' | 'datacenter';
    lat: number;
    lon: number;
    status: 'active' | 'construction' | 'critical';
    details?: string;
}

export const STRATEGIC_ASSETS: StrategicAsset[] = [
    // Nuclear Power Plants
    {
        id: "NUK-KUD",
        name: "Kudankulam Nuclear Power Plant",
        type: "nuclear",
        lat: 8.1691,
        lon: 77.7132,
        status: "active",
        details: "Largest nuclear power station in India."
    },
    {
        id: "NUK-TAR",
        name: "Tarapur Atomic Power Station",
        type: "nuclear",
        lat: 19.8315,
        lon: 72.6622,
        status: "active",
        details: "First commercial nuclear power station in India."
    },
    {
        id: "NUK-RAW",
        name: "Rajasthan Atomic Power Station (Rawatbhata)",
        type: "nuclear",
        lat: 24.8722,
        lon: 75.6138,
        status: "active",
        details: "Pressurised heavy-water reactors."
    },
    {
        id: "NUK-KAI",
        name: "Kaiga Atomic Power Station",
        type: "nuclear",
        lat: 14.8660,
        lon: 74.4371,
        status: "active",
        details: "Situated near the Kali river."
    },

    // Spaceports
    {
        id: "SPC-SDSC",
        name: "Satish Dhawan Space Centre (Sriharikota)",
        type: "spaceport",
        lat: 13.7330,
        lon: 80.2350,
        status: "active",
        details: "Primary ISRO orbital launch site."
    },
    {
        id: "SPC-TERLS",
        name: "Thumba Equatorial Rocket Launching Station",
        type: "spaceport",
        lat: 8.5390,
        lon: 76.8553,
        status: "active",
        details: "Used for sounding rockets."
    },

    // Military Bases
    {
        id: "MIL-KAD",
        name: "INS Kadamba (Project Seabird)",
        type: "base",
        lat: 14.7585,
        lon: 74.1237,
        status: "active",
        details: "Major Indian Navy base, Western Naval Command."
    },
    {
        id: "MIL-HIN",
        name: "Hindon Air Force Station",
        type: "base",
        lat: 28.7077,
        lon: 77.3589,
        status: "active",
        details: "Largest air base in Asia (Western Air Command)."
    },

    // Submarine Cables
    {
        id: "CBL-MUM",
        name: "Versova Cable Landing Station",
        type: "cable",
        lat: 19.1293, // Versova approximate
        lon: 72.8256,
        status: "active",
        details: "Major hub for multiple submarine cables."
    },
    {
        id: "CBL-CHE",
        name: "Chennai Cable Landing Station",
        type: "cable",
        lat: 13.0827,
        lon: 80.2707,
        status: "active",
        details: "Eastern seaboard submarine fiber hub."
    },

    // Pipelines (Major Nodes)
    {
        id: "PLN-EWPL-K",
        name: "EWPL Terminal: Kakinada",
        type: "pipeline",
        lat: 16.9891,
        lon: 82.2475,
        status: "active",
        details: "Source node for the East West Gas Pipeline."
    },
    {
        id: "PLN-EWPL-B",
        name: "EWPL Terminal: Bharuch",
        type: "pipeline",
        lat: 21.7051,
        lon: 72.9959,
        status: "active",
        details: "Terminus for the East West Gas Pipeline."
    },
    {
        id: "PLN-HVJ-V",
        name: "HVJ Node: Vijaipur",
        type: "pipeline",
        lat: 24.4147,
        lon: 77.3072,
        status: "active",
        details: "Central hub for the Hazira-Vijaipur-Jagdishpur pipeline."
    },

    // AI Data Centers
    {
        id: "DTC-MUM",
        name: "Mumbai Data Hub (Navi Mumbai)",
        type: "datacenter",
        lat: 19.1231,
        lon: 73.0031,
        status: "active",
        details: "Concentration of Equinix, NTT, and CtrlS facilities."
    },
    {
        id: "DTC-BGL",
        name: "Bangalore Data Hub (Whitefield)",
        type: "datacenter",
        lat: 12.9847,
        lon: 77.7349,
        status: "active",
        details: "Premier tech corridor hosting international IT parks."
    },
    {
        id: "DTC-NOI",
        name: "Noida AI Cloud Campus",
        type: "datacenter",
        lat: 28.6258,
        lon: 77.3731,
        status: "active",
        details: "Critical AI cluster serving North India."
    }
];
