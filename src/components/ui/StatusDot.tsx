"use client";

type StatusType = "success" | "warning" | "error" | "info" | "muted" | "draft" | "generated" | "edited" | "sent";

interface StatusDotProps {
  status: StatusType;
  size?: "sm" | "md" | "lg";
  className?: string;
  pulse?: boolean;
}

const statusColors: Record<StatusType, string> = {
  success: "bg-[var(--status-success)]",
  warning: "bg-[var(--status-warning)]",
  error: "bg-[var(--status-error)]",
  info: "bg-[var(--status-info)]",
  muted: "bg-[var(--text-muted)]",
  draft: "bg-[var(--text-tertiary)]",
  generated: "bg-[var(--status-info)]",
  edited: "bg-[var(--status-success)]",
  sent: "bg-[var(--status-success)]",
};

const sizeClasses = {
  sm: "w-1.5 h-1.5",
  md: "w-2 h-2",
  lg: "w-2.5 h-2.5",
};

export default function StatusDot({
  status,
  size = "md",
  className = "",
  pulse = false,
}: StatusDotProps) {
  const colorClass = statusColors[status];
  const sizeClass = sizeClasses[size];

  return (
    <span
      className={`
        inline-block rounded-full flex-shrink-0
        ${colorClass}
        ${sizeClass}
        ${pulse ? "animate-pulse" : ""}
        ${className}
      `}
      aria-label={`Status: ${status}`}
    />
  );
}
