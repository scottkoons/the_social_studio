"use client";

import { useState } from "react";
import { PostDay, getPostDocId } from "@/lib/types";
import ReviewRow from "./ReviewRow";
import EmptyState from "./ui/EmptyState";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";

export type PlatformFilterValue = "all" | "instagram" | "facebook";

interface ReviewTableProps {
    posts: PostDay[];
    selectedIds: Set<string>;
    generatingIds?: Set<string>;
    platformFilter?: PlatformFilterValue;
    onSelectRow: (id: string, selected: boolean) => void;
    onSelectAll: (selected: boolean) => void;
    onRegenerate?: (dateId: string, previousOutputs?: {
        igCaption?: string;
        igHashtags?: string[];
        fbCaption?: string;
        fbHashtags?: string[];
    }) => void;
    onDelete?: (dateId: string) => void;
}

export default function ReviewTable({
    posts,
    selectedIds,
    generatingIds = new Set(),
    platformFilter = "all",
    onSelectRow,
    onSelectAll,
    onRegenerate,
    onDelete
}: ReviewTableProps) {
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    const sortedPosts = [...posts].sort((a, b) => {
        return sortDir === 'asc'
            ? a.date.localeCompare(b.date)
            : b.date.localeCompare(a.date);
    });

    const toggleSort = () => setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');

    const allSelected = posts.length > 0 && posts.every(p => selectedIds.has(getPostDocId(p)));
    const someSelected = posts.some(p => selectedIds.has(getPostDocId(p))) && !allSelected;

    const showInstagram = platformFilter === "all" || platformFilter === "instagram";
    const showFacebook = platformFilter === "all" || platformFilter === "facebook";

    if (posts.length === 0) {
        return (
            <EmptyState
                icon={<FileText className="text-[var(--text-tertiary)]" size={24} />}
                title="No posts available for review"
                description="Add some posts in the Planning tab to get started with AI generation."
            />
        );
    }

    return (
        <div className="overflow-x-auto -mx-4 md:mx-0">
            <table className="w-full text-sm min-w-[500px] md:min-w-0">
                <thead>
                    <tr className="bg-[var(--table-header-bg)] border-b border-[var(--border-primary)]">
                        <th className="sticky top-0 bg-[var(--table-header-bg)] px-2 md:px-3 py-3 w-8 md:w-10 z-10">
                            <input
                                type="checkbox"
                                checked={allSelected}
                                ref={(el) => {
                                    if (el) el.indeterminate = someSelected;
                                }}
                                onChange={(e) => onSelectAll(e.target.checked)}
                                className="h-5 w-5 md:h-4 md:w-4 rounded border-[var(--border-primary)] text-[var(--accent-primary)] focus:ring-[var(--accent-primary)] focus:ring-offset-0 cursor-pointer bg-[var(--input-bg)]"
                            />
                        </th>
                        <th
                            className="sticky top-0 bg-[var(--table-header-bg)] px-2 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider cursor-pointer hover:text-[var(--accent-primary)] transition-colors z-10 w-24 md:w-28"
                            onClick={toggleSort}
                        >
                            <div className="flex items-center gap-1">
                                Date
                                {sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </div>
                        </th>
                        <th className="sticky top-0 bg-[var(--table-header-bg)] px-2 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider z-10 w-28 md:w-32">
                            Image
                        </th>
                        {/* Content columns - take remaining space */}
                        {showInstagram && (
                            <th className="sticky top-0 bg-[var(--table-header-bg)] px-2 md:px-3 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider z-10 hidden lg:table-cell">
                                Instagram
                            </th>
                        )}
                        {showFacebook && (
                            <th className="sticky top-0 bg-[var(--table-header-bg)] px-2 md:px-3 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider z-10 hidden lg:table-cell">
                                Facebook
                            </th>
                        )}
                        <th className="sticky top-0 bg-[var(--table-header-bg)] px-2 py-3 text-right text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider z-10 w-20 md:w-24">
                            Status
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-secondary)]">
                    {sortedPosts.map((post) => {
                        const docId = getPostDocId(post);
                        return (
                            <ReviewRow
                                key={docId}
                                post={post}
                                isSelected={selectedIds.has(docId)}
                                isGenerating={generatingIds.has(docId)}
                                platformFilter={platformFilter}
                                onSelect={onSelectRow}
                                onRegenerate={onRegenerate}
                                onDelete={onDelete}
                            />
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
