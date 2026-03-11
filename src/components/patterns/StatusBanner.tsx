import { type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const variantStyles = {
  success: "bg-green-500/10 text-green-600 dark:text-green-400",
  warning: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  error: "bg-red-500/10 text-red-600 dark:text-red-400",
  info: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
} as const;

interface StatusBannerProps {
  variant: "success" | "warning" | "error" | "info";
  icon?: ReactElement;
  children: ReactNode;
  className?: string;
}

export function StatusBanner({ variant, icon, children, className }: StatusBannerProps) {
  return (
    <div className={cn(
      "flex items-center gap-2 rounded-md px-3 py-2 text-xs",
      variantStyles[variant],
      className
    )}>
      {icon && <div className="flex-shrink-0">{icon}</div>}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
