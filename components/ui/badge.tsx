import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold",
  {
    variants: {
      tone: {
        neutral: "bg-surface-muted text-muted",
        sky: "bg-sky/15 text-sky",
        moss: "bg-moss/15 text-moss",
        coral: "bg-coral/15 text-coral",
        gold: "bg-gold/15 text-ink"
      }
    },
    defaultVariants: {
      tone: "neutral"
    }
  }
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone, className }))} {...props} />;
}
