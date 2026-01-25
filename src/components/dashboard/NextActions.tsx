"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface Action {
  id: string;
  icon: ReactNode;
  title: string;
  description: string;
  href?: string;
  onClick?: () => void;
  variant?: "default" | "warning" | "info";
}

interface NextActionsProps {
  actions: Action[];
}

export default function NextActions({ actions }: NextActionsProps) {
  if (actions.length === 0) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-[var(--text-tertiary)]">No actions needed right now</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-[var(--border-secondary)]">
      {actions.map((action) => {
        const content = (
          <div
            className={`
              flex items-center gap-4 p-4 transition-colors cursor-pointer
              hover:bg-[var(--bg-tertiary)]
              ${action.variant === "warning" ? "bg-amber-50/50 dark:bg-amber-900/5" : ""}
              ${action.variant === "info" ? "bg-blue-50/50 dark:bg-blue-900/5" : ""}
            `}
            onClick={action.onClick}
          >
            <div
              className={`
                p-2 rounded-md flex-shrink-0
                ${action.variant === "warning" ? "bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400" : ""}
                ${action.variant === "info" ? "bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400" : ""}
                ${action.variant === "default" || !action.variant ? "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]" : ""}
              `}
            >
              {action.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)]">{action.title}</p>
              <p className="text-xs text-[var(--text-tertiary)]">{action.description}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
          </div>
        );

        if (action.href) {
          return (
            <Link key={action.id} href={action.href} className="block">
              {content}
            </Link>
          );
        }

        return <div key={action.id}>{content}</div>;
      })}
    </div>
  );
}
