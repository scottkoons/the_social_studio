"use client";

import { PostDay, getPostDocId } from "@/lib/types";
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
    const allSelected = posts.length > 0 && posts.every(p => selectedIds.has(getPostDocId(p)));
    const someSelected = posts.some(p => selectedIds.has(getPostDocId(p)));

    if (posts.length === 0) {
        return (
            <EmptyState
                icon={<Calendar className="text-[var(--text-tertiary)]" size={24} />}
                title="No posts scheduled yet"
                description="Start planning your content in the Planning tab or click 'Add Row' to create a new post."
            />
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-[var(--table-header-bg)] border-b border-[var(--border-primary)]">
                        <th className="sticky top-0 bg-[var(--table-header-bg)] px-4 py-3 w-12 z-10">
                            <input
                                type="checkbox"
                                checked={allSelected}
                                ref={(el) => {
                                    if (el) el.indeterminate = someSelected && !allSelected;
                                }}
                                onChange={(e) => onSelectAll(e.target.checked)}
                                className="h-4 w-4 rounded border-[var(--border-primary)] text-[var(--accent-primary)] focus:ring-[var(--accent-primary)] focus:ring-offset-0 cursor-pointer bg-[var(--input-bg)]"
                            />
                        </th>
                        <th className="sticky top-0 bg-[var(--table-header-bg)] px-4 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider w-24 z-10">
                            Platform
                        </th>
                        <th className="sticky top-0 bg-[var(--table-header-bg)] px-4 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider w-36 z-10">
                            Date
                        </th>
                        <th className="sticky top-0 bg-[var(--table-header-bg)] px-4 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider w-36 z-10">
                            Image
                        </th>
                        <th className="sticky top-0 bg-[var(--table-header-bg)] px-4 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider z-10">
                            Starter Text
                        </th>
                        <th className="sticky top-0 bg-[var(--table-header-bg)] px-4 py-3 text-right text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider w-28 z-10">
                            Status
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-secondary)]">
                    {posts.map((post) => {
                        const docId = getPostDocId(post);
                        return (
                            <TableRow
                                key={docId}
                                post={post}
                                allPostDates={posts.map(p => p.date)}
                                isSelected={selectedIds.has(docId)}
                                onSelect={onSelectRow}
                                isHighlighted={post.date === highlightedDate}
                                onHighlightClear={onHighlightClear}
                            />
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
