export interface WorldLeader {
    id: string;
    name: string;
    role: string;
    country: string;
    lat: number;
    lon: number;
    photoUrl: string;
    status: "active" | "traveling" | "secure";
    lastKnownLocation: string;
    bioSummary: string;
}

export const WORLD_LEADERS: WorldLeader[] = [
    {
        id: "modi",
        name: "Narendra Modi",
        role: "Prime Minister",
        country: "India",
        lat: 28.6139,
        lon: 77.2090, // New Delhi
        photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Official_Photograph_of_Prime_Minister_Narendra_Modi_Portrait.png/480px-Official_Photograph_of_Prime_Minister_Narendra_Modi_Portrait.png",
        status: "active",
        lastKnownLocation: "Prime Minister's Office, South Block, New Delhi",
        bioSummary: "14th and current Prime Minister of India since 2014. Leader of the Bharatiya Janata Party."
    },
    {
        id: "trump",
        name: "Donald Trump",
        role: "President",
        country: "United States",
        lat: 38.8977,
        lon: -77.0365, // Washington D.C.
        photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Donald_Trump_official_portrait.jpg/480px-Donald_Trump_official_portrait.jpg",
        status: "active",
        lastKnownLocation: "The White House, Oval Office",
        bioSummary: "47th President of the United States."
    },
    {
        id: "xi",
        name: "Xi Jinping",
        role: "President",
        country: "China",
        lat: 39.9042,
        lon: 116.4074, // Beijing
        photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Xi_Jinping_Portrait.jpg/480px-Xi_Jinping_Portrait.jpg",
        status: "secure",
        lastKnownLocation: "Zhongnanhai, Beijing",
        bioSummary: "General Secretary of the Chinese Communist Party and President of the People's Republic of China."
    },
    {
        id: "putin",
        name: "Vladimir Putin",
        role: "President",
        country: "Russia",
        lat: 55.7520,
        lon: 37.6175, // Moscow
        photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Vladimir_Putin_%282024-05-07%29.jpg/480px-Vladimir_Putin_%282024-05-07%29.jpg",
        status: "secure",
        lastKnownLocation: "Grand Kremlin Palace, Moscow",
        bioSummary: "President of Russia. Former Prime Minister and intelligence officer."
    },
    {
        id: "sunak",
        name: "Rishi Sunak",
        role: "Prime Minister",
        country: "United Kingdom",
        lat: 51.5033,
        lon: -0.1276, // London
        photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Rishi_Sunak_portrait_%28cropped%29.jpg/480px-Rishi_Sunak_portrait_%28cropped%29.jpg",
        status: "active",
        lastKnownLocation: "10 Downing Street, London",
        bioSummary: "Prime Minister of the United Kingdom and Leader of the Conservative Party."
    },
    {
        id: "macron",
        name: "Emmanuel Macron",
        role: "President",
        country: "France",
        lat: 48.8708,
        lon: 2.3169, // Paris (Élysée Palace)
        photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/Emmanuel_Macron_in_2023_%28cropped%29.jpg/480px-Emmanuel_Macron_in_2023_%28cropped%29.jpg",
        status: "traveling",
        lastKnownLocation: "Élysée Palace, Paris",
        bioSummary: "President of France and ex officio Co-Prince of Andorra since 2017."
    }
];
