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
    { lat: 32.24, lon: 79.67, label: "LAC / HIMALAYAS", type: "hot" as const },
    { lat: 28.61, lon: 77.21, label: "NEW DELHI", type: "info" as const },
    { lat: 26.85, lon: 80.95, label: "LUCKNOW", type: "info" as const },
    { lat: 26.91, lon: 75.79, label: "JAIPUR", type: "info" as const },
    { lat: 23.02, lon: 72.57, label: "AHMEDABAD", type: "info" as const },
    { lat: 22.57, lon: 88.36, label: "KOLKATA", type: "info" as const },
    { lat: 19.08, lon: 72.88, label: "MUMBAI", type: "info" as const },
    { lat: 18.52, lon: 73.86, label: "PUNE", type: "info" as const },
    { lat: 17.38, lon: 78.49, label: "HYDERABAD", type: "info" as const },
    { lat: 13.08, lon: 80.27, label: "CHENNAI", type: "info" as const },
    { lat: 12.97, lon: 77.59, label: "BANGALORE", type: "info" as const },
    { lat: 22.57, lon: 66.00, label: "ARABIAN SEA", type: "naval" as const },
    { lat: 12.00, lon: 87.00, label: "BAY OF BENGAL", type: "naval" as const },
    { lat: 10.00, lon: 76.00, label: "INDIAN OCEAN", type: "naval" as const },
    { lat: 8.00, lon: 73.00, label: "MALDIVES / IOR", type: "naval" as const },
];
