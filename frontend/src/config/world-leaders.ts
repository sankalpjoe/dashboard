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
        lon: 77.2090,
        photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Official_Photograph_of_Prime_Minister_Narendra_Modi_Portrait.png/480px-Official_Photograph_of_Prime_Minister_Narendra_Modi_Portrait.png",
        status: "active",
        lastKnownLocation: "Prime Minister's Office, South Block, New Delhi",
        bioSummary: "14th and current Prime Minister of India since 2014. Leader of the Bharatiya Janata Party."
    },
    {
        id: "murmu",
        name: "Droupadi Murmu",
        role: "President",
        country: "India",
        lat: 28.6145,
        lon: 77.1997,
        photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/Smt._Droupadi_Murmu_official_portrait.jpg/480px-Smt._Droupadi_Murmu_official_portrait.jpg",
        status: "active",
        lastKnownLocation: "Rashtrapati Bhavan, New Delhi",
        bioSummary: "15th and current President of India since 2022."
    },
    {
        id: "xi",
        name: "Xi Jinping",
        role: "President",
        country: "China",
        lat: 39.9042,
        lon: 116.4074,
        photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Xi_Jinping_Portrait.jpg/480px-Xi_Jinping_Portrait.jpg",
        status: "secure",
        lastKnownLocation: "Zhongnanhai, Beijing",
        bioSummary: "General Secretary of the Chinese Communist Party and President of the PRC. Key counterpart in LAC negotiations."
    },
    {
        id: "shehbaz",
        name: "Shehbaz Sharif",
        role: "Prime Minister",
        country: "Pakistan",
        lat: 33.6844,
        lon: 73.0479,
        photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Shehbaz_Sharif_2024.jpg/480px-Shehbaz_Sharif_2024.jpg",
        status: "active",
        lastKnownLocation: "Prime Minister's House, Islamabad",
        bioSummary: "Prime Minister of Pakistan. Key figure in India-Pakistan diplomatic relations."
    },
    {
        id: "hasina",
        name: "Sheikh Hasina",
        role: "Prime Minister",
        country: "Bangladesh",
        lat: 23.8103,
        lon: 90.4125,
        photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Sheikh_Hasina_in_2023.jpg/480px-Sheikh_Hasina_in_2023.jpg",
        status: "active",
        lastKnownLocation: "Ganabhaban, Dhaka",
        bioSummary: "Prime Minister of Bangladesh. Critical partner for India's Northeast connectivity and border security."
    },
    {
        id: "disanayake",
        name: "Anura Dissanayake",
        role: "President",
        country: "Sri Lanka",
        lat: 6.9271,
        lon: 79.8612,
        photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Anura_Kumara_Dissanayake_2024.jpg/480px-Anura_Kumara_Dissanayake_2024.jpg",
        status: "active",
        lastKnownLocation: "Presidential Secretariat, Colombo",
        bioSummary: "President of Sri Lanka. India's key maritime neighbor in the Indian Ocean."
    }
];
