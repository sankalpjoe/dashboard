import CsvUploader, { type PersonnelRecord } from "@/components/CsvUploader";
import { Database } from "lucide-react";

export default function Assets({ onPersonnelUpload }: { onPersonnelUpload: (data: PersonnelRecord[]) => void }) {
    return (
        <div className="h-full w-full bg-bg-light grain-overlay flex flex-col p-8 overflow-y-auto">
            <div className="max-w-4xl mx-auto w-full">
                <div className="mb-8 flex items-center gap-3">
                    <Database className="text-signal" size={24} />
                    <div>
                        <h1 className="font-display text-bg-dark text-2xl tracking-tight">STRATEGIC ASSET MANIFEST</h1>
                        <p className="mono-label text-bg-dark/50 mt-1">UPLOAD AND MANAGE GLOBAL TRACKING TARGETS</p>
                    </div>
                </div>

                <div className="bg-bg-mid border border-bg-dark/10 p-6 shadow-sm">
                    <CsvUploader onUpload={onPersonnelUpload} />
                    <div className="mt-6 p-4 bg-bg-dark/5 border border-bg-dark/10">
                        <h3 className="mono-label text-bg-dark font-bold mb-2">MANIFEST SCHEMA REQ:</h3>
                        <pre className="text-[10px] font-mono text-bg-dark/70 bg-bg-light p-3 border border-bg-dark/10">
                            NAME,ID,COUNTRY,LAT,LON
                            John Doe,OP-Alpha,US,38.8977,-77.0365
                            Jane Smith,OP-Bravo,UK,51.5074,-0.1278
                        </pre>
                    </div>
                </div>
            </div>
        </div>
    );
}
