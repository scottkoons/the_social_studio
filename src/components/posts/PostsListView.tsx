"use client";

import PostCard from "./PostCard";
import EmptyState from "@/components/ui/EmptyState";
import { PostDay, getPostDocId } from "@/lib/types";
import { Calendar } from "lucide-react";

interface PostsListViewProps {
  posts: PostDay[];
  workspaceId: string;
  selectedIds: Set<string>;
  onSelectPost: (docId: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onPostClick: (post: PostDay) => void;
}

export default function PostsListView({
  posts,
  workspaceId,
  selectedIds,
  onSelectPost,
  onSelectAll,
  onPostClick,
}: PostsListViewProps) {
  const allSelected = posts.length > 0 && posts.every((p) => selectedIds.has(getPostDocId(p)));
  const someSelected = posts.some((p) => selectedIds.has(getPostDocId(p)));

  if (posts.length === 0) {
    return (
      <EmptyState
        icon={<Calendar className="text-[var(--text-tertiary)]" size={24} />}
        title="No posts yet"
        description="Create your first post by clicking the 'Add Post' button."
      />
    );
  }

  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-primary)] overflow-hidden">
      {/* Header - hidden on mobile, shown on md+ */}
      <div className="hidden md:flex items-center gap-4 px-4 py-3 border-b border-[var(--border-primary)] bg-[var(--bg-primary)]">
        {/* Select all checkbox */}
        <div className="w-8">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected && !allSelected;
            }}
            onChange={(e) => onSelectAll(e.target.checked)}
            className="h-4 w-4 rounded border-[var(--border-primary)] text-[var(--accent-primary)] focus:ring-[var(--accent-primary)] cursor-pointer bg-[var(--input-bg)]"
          />
        </div>

        {/* Column headers */}
        <div className="w-12" /> {/* Thumbnail placeholder */}
        <div className="w-28 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
          Date
        </div>
        <div className="flex-1 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
          Preview
        </div>
        <div className="w-16 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider text-center">
          Platform
        </div>
        <div className="w-24 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
          Status
        </div>
        <div className="w-10" /> {/* Edit button placeholder */}
      </div>

      {/* Mobile header - select all only */}
      <div className="flex md:hidden items-center gap-3 px-3 py-2.5 border-b border-[var(--border-primary)] bg-[var(--bg-primary)]">
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = someSelected && !allSelected;
          }}
          onChange={(e) => onSelectAll(e.target.checked)}
          className="h-4 w-4 rounded border-[var(--border-primary)] text-[var(--accent-primary)] focus:ring-[var(--accent-primary)] cursor-pointer bg-[var(--input-bg)]"
        />
        <span className="text-xs text-[var(--text-tertiary)]">
          {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select all"}
        </span>
      </div>

      {/* Post rows */}
      <div>
        {posts.map((post) => {
          const docId = getPostDocId(post);
          return (
            <PostCard
              key={docId}
              post={post}
              workspaceId={workspaceId}
              isSelected={selectedIds.has(docId)}
              onSelect={onSelectPost}
              onClick={() => onPostClick(post)}
              variant="list"
            />
          );
        })}
      </div>
    </div>
  );
}
