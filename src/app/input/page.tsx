"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, orderBy, doc, setDoc, serverTimestamp } from "firebase/firestore";
import InputTable from "@/components/InputTable";
import CSVImport from "@/components/CSVImport";
import { Plus, Layout } from "lucide-react";
import { format, addDays } from "date-fns";
import { PostDay } from "@/lib/types";
import { getTodayInDenver } from "@/lib/utils";

export default function InputPage() {
    const { user } = useAuth();
    const [posts, setPosts] = useState<PostDay[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;

        const q = query(collection(db, "users", user.uid, "post_days"), orderBy("date", "asc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const postsData = snapshot.docs.map((doc) => ({
                ...doc.data(),
            })) as PostDay[];
            setPosts(postsData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    const addRow = async () => {
        if (!user) return;

        // Find the next available date
        let nextDate = new Date();
        let dateStr = format(nextDate, "yyyy-MM-dd");
        const today = getTodayInDenver();
        if (dateStr < today) dateStr = today;

        const existingDates = new Set(posts.map(p => p.date));
        while (existingDates.has(dateStr)) {
            nextDate = addDays(nextDate, 1);
            dateStr = format(nextDate, "yyyy-MM-dd");
        }

        try {
            const docRef = doc(db, "users", user.uid, "post_days", dateStr);
            await setDoc(docRef, {
                date: dateStr,
                starterText: "",
                status: "input",
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
        } catch (error) {
            console.error("Error adding row:", error);
            alert("Failed to add row. This date might already be taken.");
        }
    };

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Content Input</h1>
                    <p className="text-sm text-gray-500">Plan your social media schedule here.</p>
                </div>

                <div className="flex items-center gap-3">
                    <CSVImport />
                    <button
                        onClick={addRow}
                        className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
                    >
                        <Plus size={18} />
                        Add Row
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-teal-500 mx-auto mb-4"></div>
                        <p className="text-gray-500">Loading your schedule...</p>
                    </div>
                ) : (
                    <InputTable posts={posts} />
                )}
            </div>
        </div>
    );
}
