"use client";

import { useState } from "react";
import { PostDay } from "@/lib/types";
import ReviewRow from "./ReviewRow";
import EmptyState from "./ui/EmptyState";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";

interface ReviewTableProps {
    posts: PostDay[];
    selectedIds: Set<string>;
    generatingIds?: Set<string>;
    onSelectRow: (id: string, selected: boolean) => void;
    onSelectAll: (selected: boolean) => void;
    onRegenerate?: (dateId: string, previousOutputs?: {
        igCaption?: string;
        igHashtags?: string[];
        fbCaption?: string;
        fbHashtags?: string[];
    }) => void;
}

export default function ReviewTable({
    posts,
    selectedIds,
    generatingIds = new Set(),
    onSelectRow,
    onSelectAll,
    onRegenerate
}: ReviewTableProps) {
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    const sortedPosts = [...posts].sort((a, b) => {
        return sortDir === 'asc'
            ? a.date.localeCompare(b.date)
            : b.date.localeCompare(a.date);
    });

    const toggleSort = () => setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');

    const allSelected = posts.length > 0 && selectedIds.size === posts.length;
    const someSelected = selectedIds.size > 0 && selectedIds.size < posts.length;

    if (posts.length === 0) {
        return (
            <EmptyState
                icon={<FileText className="text-gray-400" size={24} />}
                title="No posts available for review"
                description="Add some posts in the Input tab to get started with AI generation."
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
                                    if (el) el.indeterminate = someSelected;
                                }}
                                onChange={(e) => onSelectAll(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 focus:ring-offset-0 cursor-pointer"
                            />
                        </th>
                        <th
                            className="sticky top-0 bg-gray-50 px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-32 cursor-pointer hover:text-teal-600 transition-colors z-10"
                            onClick={toggleSort}
                        >
                            <div className="flex items-center gap-1">
                                Date
                                {sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </div>
                        </th>
                        <th className="sticky top-0 bg-gray-50 px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-36 z-10">
                            Image
                        </th>
                        <th className="sticky top-0 bg-gray-50 px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider z-10">
                            Instagram Content
                        </th>
                        <th className="sticky top-0 bg-gray-50 px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider z-10">
                            Facebook Content
                        </th>
                        <th className="sticky top-0 bg-gray-50 px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-28 z-10">
                            Status
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {sortedPosts.map((post) => (
                        <ReviewRow
                            key={post.date}
                            post={post}
                            isSelected={selectedIds.has(post.date)}
                            isGenerating={generatingIds.has(post.date)}
                            onSelect={onSelectRow}
                            onRegenerate={onRegenerate}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    );
}
