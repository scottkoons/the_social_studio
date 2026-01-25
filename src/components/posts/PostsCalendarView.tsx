"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { format, startOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth } from "date-fns";
import PostCard from "./PostCard";
import { PostDay, getPostDocId } from "@/lib/types";
import { getTodayInDenver } from "@/lib/utils";
import { movePostDay } from "@/lib/postDayMove";
import ConfirmModal from "@/components/ui/ConfirmModal";

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_OF_WEEK_SHORT = ["S", "M", "T", "W", "T", "F", "S"];

interface PostsCalendarViewProps {
  posts: PostDay[];
  workspaceId: string;
  currentMonth: Date;
  onMonthChange: (date: Date) => void;
  selectedIds: Set<string>;
  onSelectPost: (docId: string, selected: boolean) => void;
  onPostClick: (post: PostDay) => void;
  onEmptyDayClick: (date: string) => void;
}

export default function PostsCalendarView({
  posts,
  workspaceId,
  currentMonth,
  onMonthChange,
  selectedIds,
  onSelectPost,
  onPostClick,
  onEmptyDayClick,
}: PostsCalendarViewProps) {
  // Drag-and-drop state
  const [draggingPost, setDraggingPost] = useState<PostDay | null>(null);
  const [dropTargetDate, setDropTargetDate] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState<{
    fromDocId: string;
    toDate: string;
  } | null>(null);

  // Calculate the 6-week grid bounds
  const monthStart = startOfMonth(currentMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(addDays(monthStart, 41), { weekStartsOn: 0 });

  // Create posts lookup by date
  const postsByDate = useMemo(() => {
    const map = new Map<string, PostDay[]>();
    posts.forEach((post) => {
      const existing = map.get(post.date) || [];
      existing.push(post);
      map.set(post.date, existing);
    });
    return map;
  }, [posts]);

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const days: Date[] = [];
    let day = gridStart;
    while (day <= gridEnd) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }, [gridStart, gridEnd]);

  const todayStr = getTodayInDenver();

  const goToPreviousMonth = () => onMonthChange(subMonths(currentMonth, 1));
  const goToNextMonth = () => onMonthChange(addMonths(currentMonth, 1));
  const goToToday = () => onMonthChange(new Date());

  // Drag handlers
  const handleDragStart = (post: PostDay) => {
    setDraggingPost(post);
  };

  const handleDragEnd = () => {
    setDraggingPost(null);
    setDropTargetDate(null);
  };

  const handleDragOver = (dateStr: string) => {
    if (!draggingPost) return;
    // Don't allow dropping on past dates
    const today = getTodayInDenver();
    if (dateStr < today) return;
    // Don't allow dropping on same date
    if (dateStr === draggingPost.date) return;
    setDropTargetDate(dateStr);
  };

  const handleDragLeave = () => {
    setDropTargetDate(null);
  };

  const handleDrop = async (targetDate: string) => {
    if (!draggingPost || isMoving) return;

    const fromDocId = getPostDocId(draggingPost);
    const today = getTodayInDenver();

    // Validation
    if (targetDate < today) {
      handleDragEnd();
      return;
    }
    if (targetDate === draggingPost.date) {
      handleDragEnd();
      return;
    }

    setIsMoving(true);
    try {
      const result = await movePostDay(workspaceId, fromDocId, targetDate);
      if (result.needsConfirmOverwrite) {
        // Show confirmation modal
        setConfirmOverwrite({ fromDocId, toDate: targetDate });
      } else if (!result.ok) {
        console.error("Failed to move post:", result.error);
      }
    } catch (err) {
      console.error("Error moving post:", err);
    } finally {
      setIsMoving(false);
      handleDragEnd();
    }
  };

  const handleConfirmOverwrite = async () => {
    if (!confirmOverwrite) return;
    setIsMoving(true);
    try {
      const result = await movePostDay(
        workspaceId,
        confirmOverwrite.fromDocId,
        confirmOverwrite.toDate,
        { overwrite: true }
      );
      if (!result.ok) {
        console.error("Failed to move post:", result.error);
      }
    } catch (err) {
      console.error("Error moving post:", err);
    } finally {
      setIsMoving(false);
      setConfirmOverwrite(null);
    }
  };

  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-primary)]">
      {/* Month navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-primary)]">
        <div className="flex items-center gap-2">
          <button
            onClick={goToPreviousMonth}
            className="p-1.5 rounded-md hover:bg-[var(--bg-tertiary)] transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-5 h-5 text-[var(--text-secondary)]" />
          </button>
          <button
            onClick={goToNextMonth}
            className="p-1.5 rounded-md hover:bg-[var(--bg-tertiary)] transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="w-5 h-5 text-[var(--text-secondary)]" />
          </button>
          <h2 className="text-base font-medium text-[var(--text-primary)] ml-2">
            {format(currentMonth, "MMMM yyyy")}
          </h2>
        </div>
        <button
          onClick={goToToday}
          className="px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] rounded-md transition-colors"
        >
          Today
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-[var(--border-primary)]">
        {DAYS_OF_WEEK.map((day, idx) => (
          <div
            key={day}
            className="py-2 text-center text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider"
          >
            <span className="hidden sm:inline">{day}</span>
            <span className="sm:hidden">{DAYS_OF_WEEK_SHORT[idx]}</span>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {calendarDays.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const postsForDate = postsByDate.get(dateStr) || [];
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isToday = dateStr === todayStr;
          const isPast = dateStr < todayStr;

          return (
            <DayCell
              key={dateStr}
              date={day}
              dateStr={dateStr}
              posts={postsForDate}
              workspaceId={workspaceId}
              isCurrentMonth={isCurrentMonth}
              isToday={isToday}
              isPast={isPast}
              selectedIds={selectedIds}
              onSelectPost={onSelectPost}
              onPostClick={onPostClick}
              onEmptyClick={() => onEmptyDayClick(dateStr)}
              isDragging={!!draggingPost}
              isDropTarget={dropTargetDate === dateStr}
              canDrop={!!draggingPost && dateStr !== draggingPost.date && dateStr >= getTodayInDenver()}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={() => handleDragOver(dateStr)}
              onDragLeave={handleDragLeave}
              onDrop={() => handleDrop(dateStr)}
            />
          );
        })}
      </div>

      {/* Confirm overwrite modal */}
      <ConfirmModal
        open={!!confirmOverwrite}
        title="Replace existing post?"
        description="There is already a post scheduled for this date. Moving this post will replace the existing one."
        confirmText="Replace"
        confirmVariant="warning"
        onConfirm={handleConfirmOverwrite}
        onCancel={() => setConfirmOverwrite(null)}
      />
    </div>
  );
}

interface DayCellProps {
  date: Date;
  dateStr: string;
  posts: PostDay[];
  workspaceId: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  selectedIds: Set<string>;
  onSelectPost: (docId: string, selected: boolean) => void;
  onPostClick: (post: PostDay) => void;
  onEmptyClick: () => void;
  // Drag-and-drop props
  isDragging: boolean;
  isDropTarget: boolean;
  canDrop: boolean;
  onDragStart: (post: PostDay) => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
}

function DayCell({
  date,
  dateStr,
  posts,
  workspaceId,
  isCurrentMonth,
  isToday,
  isPast,
  selectedIds,
  onSelectPost,
  onPostClick,
  onEmptyClick,
  isDragging,
  isDropTarget,
  canDrop,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: DayCellProps) {
  const hasPosts = posts.length > 0;
  const firstPost = posts[0];

  // Handle drag events on the cell
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (canDrop) {
      onDragOver();
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    onDragLeave();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (canDrop) {
      onDrop();
    }
  };

  return (
    <div
      className={`
        group relative min-h-[120px] md:min-h-[140px] p-2 border-b border-r border-[var(--border-secondary)]
        transition-colors
        ${isCurrentMonth ? "bg-[var(--bg-secondary)]" : "bg-[var(--bg-primary)]"}
        ${isPast && isCurrentMonth ? "opacity-70" : ""}
        ${isDropTarget && canDrop ? "bg-[var(--accent-primary)]/10 ring-2 ring-inset ring-[var(--accent-primary)]" : ""}
        ${isDragging && !canDrop && !isPast ? "opacity-50" : ""}
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Day number */}
      <div className="flex items-center justify-between mb-2">
        <span
          className={`
            inline-flex items-center justify-center w-7 h-7 text-sm font-medium rounded-full
            ${isToday ? "bg-[var(--accent-primary)] text-white" : ""}
            ${!isToday && isCurrentMonth ? "text-[var(--text-primary)]" : ""}
            ${!isToday && !isCurrentMonth ? "text-[var(--text-muted)]" : ""}
          `}
        >
          {format(date, "d")}
        </span>

        {/* Add button - appears on hover when no posts */}
        {!hasPosts && isCurrentMonth && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEmptyClick();
            }}
            className="p-1 rounded-md hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] opacity-0 group-hover:opacity-100 transition-all"
            aria-label="Add post"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Post card */}
      {firstPost && (
        <PostCard
          post={firstPost}
          workspaceId={workspaceId}
          isSelected={selectedIds.has(firstPost.docId || dateStr)}
          onSelect={onSelectPost}
          onClick={() => onPostClick(firstPost)}
          variant="calendar"
          draggable={!isPast}
          onDragStart={() => onDragStart(firstPost)}
          onDragEnd={onDragEnd}
        />
      )}

      {/* Multiple posts indicator */}
      {posts.length > 1 && (
        <div className="mt-1 text-[10px] text-[var(--text-tertiary)] text-center">
          +{posts.length - 1} more
        </div>
      )}

      {/* Empty state - clickable */}
      {!hasPosts && isCurrentMonth && (
        <div
          onClick={onEmptyClick}
          className="h-16 flex items-center justify-center rounded-md border-2 border-dashed border-transparent hover:border-[var(--border-primary)] cursor-pointer transition-colors group-hover:border-[var(--border-primary)]"
        >
          <span className="text-xs text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity">
            Click to add
          </span>
        </div>
      )}
    </div>
  );
}
