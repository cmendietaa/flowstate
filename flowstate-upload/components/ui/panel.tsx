import * as React from "react";
import { cn } from "@/lib/utils";

export function Panel({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn(
        "rounded-lg border border-white/80 bg-white p-4 shadow-soft sm:p-5",
        className
      )}
      {...props}
    />
  );
}
