import { useState } from 'react';
import Papa from 'papaparse';
import { Upload } from 'lucide-react';

export interface PersonnelRecord {
    id: string;
    name: string;
    country: string;
    lat: number;
    lon: number;
}

const COUNTRY_CENTERS: Record<string, [number, number]> = {
    'IND': [20.59, 78.96],
    'PAK': [30.37, 69.34],
    'CHN': [35.86, 104.19],
    'MMR': [21.91, 95.95],
    'AFG': [33.93, 67.70],
    'IRN': [32.42, 53.68],
    'IRQ': [33.22, 43.67],
    'YEM': [15.55, 48.51],
    'SYR': [34.80, 38.99],
    'SDN': [12.86, 30.21],
};

export default function CsvUploader({ onUpload }: { onUpload: (data: PersonnelRecord[]) => void }) {
    const [loading, setLoading] = useState(false);
    const [assetCount, setAssetCount] = useState(0);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const records: PersonnelRecord[] = results.data.map((row: any) => {
                    // Helper to get value regardless of header casing
                    const getVal = (keys: string[]) => {
                        const foundKey = Object.keys(row).find(k => keys.includes(k.trim().toLowerCase()));
                        return foundKey ? row[foundKey] : null;
                    };

                    let rawLat = getVal(['lat', 'latitude']);
                    let rawLon = getVal(['lon', 'longitude', 'lng']);
                    let lat = parseFloat(rawLat);
                    let lon = parseFloat(rawLon);

                    const countryName = getVal(['country']) || 'UNKNOWN';

                    if (isNaN(lat) || isNaN(lon)) {
                        const center = COUNTRY_CENTERS[countryName.toUpperCase()] || [0, 0];
                        // Add random jitter so they don't stack
                        lat = center[0] + (Math.random() - 0.5) * 5;
                        lon = center[1] + (Math.random() - 0.5) * 5;
                    }

                    return {
                        id: getVal(['id']) || Math.random().toString(36).substring(7),
                        name: getVal(['name']) || 'UNKNOWN',
                        country: countryName,
                        lat,
                        lon
                    };
                });

                onUpload(records);
                setAssetCount(records.length);
                setLoading(false);
            },
            error: () => {
                setLoading(false);
                alert('Error parsing CSV file');
            }
        });

        e.target.value = ''; // reset
    };

    return (
        <div className="flex flex-col gap-2 p-3 bg-bg-dark border border-border-light relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-16 h-16 bg-signal/5 rotate-45 transform translate-x-8 -translate-y-8 pointer-events-none group-hover:bg-signal/10 transition-colors" />

            <div className="flex items-center gap-2 text-text-light mono-label-lg mb-1 relative z-10">
                <Upload size={14} className="text-signal" />
                <span className="text-white">ASSET TRACKING MANIFEST</span>
            </div>

            <label className="cursor-pointer border border-dashed border-signal/40 hover:border-signal p-3 text-center flex flex-col items-center justify-center transition-colors relative z-10 bg-black/20">
                <span className="mono-label tracking-widest text-[#cfcfc6]">
                    {loading ? 'PROCESSING IDENTITIES...' : assetCount > 0 ? `UPLOADED [${assetCount} PERSONNEL]` : 'LOAD CSV MANIFEST'}
                </span>
                <span className="text-[10px] text-text-light/50 mt-1.5 uppercase font-mono tracking-wider">
                    {assetCount > 0 ? 'CLICK TO OVERWRITE' : 'COLUMNS: NAME, ID, COUNTRY, LAT, LON'}
                </span>
                <input type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
            </label>
        </div>
    );
}
