"use client";

import Link from "next/link";
import { format, addDays, startOfWeek, isSameDay, parseISO } from "date-fns";
import StatusDot from "@/components/ui/StatusDot";
import { PostDay } from "@/lib/types";
import { getTodayInDenver } from "@/lib/utils";

interface WeekPreviewProps {
  posts: PostDay[];
}

// Map post status to StatusDot status
function getStatusDotStatus(status: PostDay["status"]): "draft" | "generated" | "edited" | "sent" | "error" {
  switch (status) {
    case "input": return "draft";
    case "generated": return "generated";
    case "edited": return "edited";
    case "sent": return "sent";
    case "error": return "error";
    default: return "draft";
  }
}

export default function WeekPreview({ posts }: WeekPreviewProps) {
  const todayStr = getTodayInDenver();
  const today = parseISO(todayStr);
  const weekStart = startOfWeek(today, { weekStartsOn: 0 });

  // Generate 7 days starting from week start
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Create posts lookup by date
  const postsByDate = new Map<string, PostDay[]>();
  posts.forEach((post) => {
    const existing = postsByDate.get(post.date) || [];
    existing.push(post);
    postsByDate.set(post.date, existing);
  });

  return (
    <div className="grid grid-cols-7 gap-1">
      {weekDays.map((day) => {
        const dateStr = format(day, "yyyy-MM-dd");
        const dayPosts = postsByDate.get(dateStr) || [];
        const isToday = isSameDay(day, today);
        const isPast = dateStr < todayStr;
        const hasPost = dayPosts.length > 0;
        const firstPost = dayPosts[0];

        return (
          <Link
            key={dateStr}
            href={`/posts?date=${dateStr}`}
            className={`
              flex flex-col items-center p-2 rounded-md transition-colors
              ${isToday ? "bg-[var(--accent-bg)]" : "hover:bg-[var(--bg-tertiary)]"}
              ${isPast && !isToday ? "opacity-50" : ""}
            `}
          >
            {/* Day name */}
            <span className="text-[10px] text-[var(--text-muted)] uppercase">
              {format(day, "EEE")}
            </span>

            {/* Day number */}
            <span
              className={`
                w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium my-1
                ${isToday ? "bg-[var(--accent-primary)] text-white" : "text-[var(--text-primary)]"}
              `}
            >
              {format(day, "d")}
            </span>

            {/* Post indicator */}
            {hasPost ? (
              <StatusDot status={getStatusDotStatus(firstPost.status)} size="sm" />
            ) : (
              <div className="w-1.5 h-1.5" /> // Placeholder to maintain layout
            )}
          </Link>
        );
      })}
    </div>
  );
}
