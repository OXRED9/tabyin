import * as React from "react"
import { cn } from "cn"

/* A field's edge is the stronger rule: a boundary that must be seen (3:1). */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-control border border-rule-strong bg-paper px-3 text-base text-ink transition-colors duration-150 placeholder:text-quiet focus-visible:border-green disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-contra",
        className
      )}
      {...props}
    />
  )
}

export { Input }
