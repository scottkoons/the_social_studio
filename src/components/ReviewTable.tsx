"use client";

import { useState } from "react";
import { PostDay } from "@/lib/types";
import ReviewRow from "./ReviewRow";
import { ChevronDown, ChevronUp } from "lucide-react";

interface ReviewTableProps {
    posts: PostDay[];
    selectedIds: Set<string>;
    onSelectRow: (id: string, selected: boolean) => void;
    onSelectAll: (selected: boolean) => void;
}

export default function ReviewTable({
    posts,
    selectedIds,
    onSelectRow,
    onSelectAll
}: ReviewTableProps) {
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    const sortedPosts = [...posts].sort((a, b) => {
        return sortDir === 'asc'
            ? a.date.localeCompare(b.date)
            : b.date.localeCompare(a.date);
    });

    const toggleSort = () => setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');

    return (
        <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
                <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="px-4 py-4 w-10">
                            <input
                                type="checkbox"
                                checked={posts.length > 0 && selectedIds.size === posts.length}
                                onChange={(e) => onSelectAll(e.target.checked)}
                                className="rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                            />
                        </th>
                        <th
                            className="px-4 py-4 font-bold text-gray-500 uppercase tracking-widest text-[10px] cursor-pointer hover:text-teal-600 transition-colors"
                            onClick={toggleSort}
                        >
                            <div className="flex items-center gap-1">
                                Date
                                {sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </div>
                        </th>
                        <th className="px-4 py-4 font-bold text-gray-500 uppercase tracking-widest text-[10px]">Image</th>
                        <th className="px-4 py-4 font-bold text-gray-500 uppercase tracking-widest text-[10px]">Instagram Content</th>
                        <th className="px-4 py-4 font-bold text-gray-500 uppercase tracking-widest text-[10px]">Facebook Content</th>
                        <th className="px-4 py-4 font-bold text-gray-500 uppercase tracking-widest text-[10px] text-right">Status</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {sortedPosts.length === 0 ? (
                        <tr>
                            <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                                No posts available for review. Add some in the Input tab!
                            </td>
                        </tr>
                    ) : (
                        sortedPosts.map((post) => (
                            <ReviewRow
                                key={post.date}
                                post={post}
                                isSelected={selectedIds.has(post.date)}
                                onSelect={onSelectRow}
                            />
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}
