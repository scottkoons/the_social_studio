"use client";

import { PostDay } from "@/lib/types";
import TableRow from "./TableRow";
import EmptyState from "./ui/EmptyState";
import { Calendar } from "lucide-react";

interface InputTableProps {
    posts: PostDay[];
    selectedIds: Set<string>;
    onSelectRow: (id: string, selected: boolean) => void;
    onSelectAll: (selected: boolean) => void;
    highlightedDate: string | null;
    onHighlightClear: () => void;
}

export default function InputTable({ posts, selectedIds, onSelectRow, onSelectAll, highlightedDate, onHighlightClear }: InputTableProps) {
    const allSelected = posts.length > 0 && posts.every(p => selectedIds.has(p.date));
    const someSelected = posts.some(p => selectedIds.has(p.date));

    if (posts.length === 0) {
        return (
            <EmptyState
                icon={<Calendar className="text-gray-400" size={24} />}
                title="No posts scheduled yet"
                description="Start planning your content by clicking 'Add Row' or importing a CSV file."
            />
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="sticky top-0 bg-gray-50 px-4 py-3 w-12 z-10">
                            <input
                                type="checkbox"
                                checked={allSelected}
                                ref={(el) => {
                                    if (el) el.indeterminate = someSelected && !allSelected;
                                }}
                                onChange={(e) => onSelectAll(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 focus:ring-offset-0 cursor-pointer"
                            />
                        </th>
                        <th className="sticky top-0 bg-gray-50 px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-36 z-10">
                            Date
                        </th>
                        <th className="sticky top-0 bg-gray-50 px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-36 z-10">
                            Image
                        </th>
                        <th className="sticky top-0 bg-gray-50 px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider z-10">
                            Starter Text
                        </th>
                        <th className="sticky top-0 bg-gray-50 px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-28 z-10">
                            Status
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {posts.map((post) => (
                        <TableRow
                            key={post.date}
                            post={post}
                            allPostDates={posts.map(p => p.date)}
                            isSelected={selectedIds.has(post.date)}
                            onSelect={onSelectRow}
                            isHighlighted={post.date === highlightedDate}
                            onHighlightClear={onHighlightClear}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    );
}
