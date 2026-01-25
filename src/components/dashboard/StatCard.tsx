"use client";

import { ReactNode } from "react";
import Link from "next/link";

interface StatCardProps {
  label: string;
  value: number | string;
  sublabel?: string;
  icon?: ReactNode;
  href?: string;
  variant?: "default" | "warning" | "success";
}

export default function StatCard({
  label,
  value,
  sublabel,
  icon,
  href,
  variant = "default",
}: StatCardProps) {
  const content = (
    <div
      className={`
        p-4 rounded-lg transition-colors
        ${variant === "warning" ? "bg-amber-50 dark:bg-amber-900/10" : ""}
        ${variant === "success" ? "bg-green-50 dark:bg-green-900/10" : ""}
        ${variant === "default" ? "bg-[var(--bg-secondary)]" : ""}
        ${href ? "hover:bg-[var(--bg-tertiary)] cursor-pointer" : ""}
      `}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="micro-label mb-1">{label}</p>
          <p
            className={`
              text-2xl font-medium
              ${variant === "warning" ? "text-amber-600 dark:text-amber-400" : ""}
              ${variant === "success" ? "text-green-600 dark:text-green-400" : ""}
              ${variant === "default" ? "text-[var(--text-primary)]" : ""}
            `}
          >
            {value}
          </p>
          {sublabel && (
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{sublabel}</p>
          )}
        </div>
        {icon && (
          <div
            className={`
              p-2 rounded-md
              ${variant === "warning" ? "bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400" : ""}
              ${variant === "success" ? "bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400" : ""}
              ${variant === "default" ? "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]" : ""}
            `}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
