export const MARKER_COLORS = {
    alert: [239, 68, 68, 255] as [number, number, number, number],   // Red
    hot: [245, 158, 11, 255] as [number, number, number, number],     // Amber
    info: [59, 130, 246, 255] as [number, number, number, number],    // Blue
    naval: [16, 185, 129, 255] as [number, number, number, number],   // Emerald
    base: [139, 92, 246, 255] as [number, number, number, number],   // Violet
};

export const INDIA_MARKERS = [
    { lat: 34.08, lon: 74.84, label: "SRINAGAR", type: "alert" as const },
    { lat: 33.72, lon: 74.68, label: "LOC SECTOR", type: "hot" as const },
    { lat: 28.61, lon: 77.21, label: "NEW DELHI", type: "info" as const },
    { lat: 18.93, lon: 72.83, label: "MUMBAI", type: "info" as const },
    { lat: 12.97, lon: 77.59, label: "BANGALORE", type: "info" as const },
    { lat: 17.38, lon: 78.49, label: "HYDERABAD", type: "info" as const },
    { lat: 22.57, lon: 66.00, label: "ARABIAN SEA", type: "naval" as const },
    { lat: 12.00, lon: 87.00, label: "BAY OF BENGAL", type: "naval" as const },
    { lat: 32.24, lon: 79.67, label: "LAC / HIMALAYAS", type: "hot" as const },
];
