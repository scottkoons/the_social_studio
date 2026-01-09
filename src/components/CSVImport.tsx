import { useState } from "react";
import Papa from "papaparse";
import { db } from "@/lib/firebase";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { Upload, FileDown, AlertCircle, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function CSVImport() {
    const { user } = useAuth();
    const [isImporting, setIsImporting] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        setIsImporting(true);
        setStatus(null);

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const data = results.data as any[];
                let importedCount = 0;
                let skippedCount = 0;

                for (const row of data) {
                    const date = row.date || row.Date;
                    const starterText = row.starterText || row.StarterText || "";

                    if (!date) {
                        skippedCount++;
                        continue;
                    }

                    try {
                        const docRef = doc(db, "users", user.uid, "post_days", date);
                        const docSnap = await getDoc(docRef);

                        if (!docSnap.exists()) {
                            await setDoc(docRef, {
                                date,
                                starterText,
                                status: "input",
                                createdAt: serverTimestamp(),
                                updatedAt: serverTimestamp(),
                            });
                            importedCount++;
                        } else {
                            skippedCount++;
                        }
                    } catch (err) {
                        console.error("Import error for row:", row, err);
                        skippedCount++;
                    }
                }

                setStatus({
                    type: 'success',
                    message: `Imported ${importedCount} rows, skipped ${skippedCount} (exists or invalid).`
                });
                setIsImporting(false);
                // Reset input
                e.target.value = "";
            },
            error: (err) => {
                console.error("CSV Parse error:", err);
                setStatus({ type: 'error', message: "Failed to parse CSV file." });
                setIsImporting(false);
            }
        });
    };

    return (
        <div className="relative">
            <label className="flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer shadow-sm">
                {isImporting ? (
                    <span className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-teal-500" />
                ) : (
                    <FileDown size={18} />
                )}
                Import CSV
                <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    disabled={isImporting}
                    className="hidden"
                />
            </label>

            {status && (
                <div className={`absolute top-full mt-2 right-0 w-64 p-3 rounded-lg shadow-lg border z-20 ${status.type === 'success' ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700'
                    }`}>
                    <div className="flex gap-2">
                        {status.type === 'success' ? <Check size={16} className="shrink-0" /> : <AlertCircle size={16} className="shrink-0" />}
                        <p className="text-xs font-medium">{status.message}</p>
                    </div>
                    <button
                        onClick={() => setStatus(null)}
                        className="mt-2 text-[10px] underline uppercase tracking-wider font-bold opacity-70"
                    >
                        Dismiss
                    </button>
                </div>
            )}
        </div>
    );
}
