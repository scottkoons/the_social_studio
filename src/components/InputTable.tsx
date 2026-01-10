"use client";

import { PostDay } from "@/lib/types";
import TableRow from "./TableRow";

interface InputTableProps {
    posts: PostDay[];
    selectedIds: Set<string>;
    onSelectRow: (id: string, selected: boolean) => void;
    onSelectAll: (selected: boolean) => void;
}

export default function InputTable({ posts, selectedIds, onSelectRow, onSelectAll }: InputTableProps) {
    const allSelected = posts.length > 0 && posts.every(p => selectedIds.has(p.date));
    const someSelected = posts.some(p => selectedIds.has(p.date));

    return (
        <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
                <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="px-4 py-4 w-10">
                            <input
                                type="checkbox"
                                checked={allSelected}
                                ref={(el) => {
                                    if (el) el.indeterminate = someSelected && !allSelected;
                                }}
                                onChange={(e) => onSelectAll(e.target.checked)}
                                className="rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                            />
                        </th>
                        <th className="px-6 py-4 font-semibold text-gray-700 w-48">Date</th>
                        <th className="px-6 py-4 font-semibold text-gray-700 w-64">Image</th>
                        <th className="px-6 py-4 font-semibold text-gray-700">Starter Text</th>
                        <th className="px-6 py-4 font-semibold text-gray-700 w-32 text-right">Status</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {posts.length === 0 ? (
                        <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                No posts scheduled yet. Click "Add Row" to get started.
                            </td>
                        </tr>
                    ) : (
                        posts.map((post) => (
                            <TableRow
                                key={post.date}
                                post={post}
                                allPostDates={posts.map(p => p.date)}
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
