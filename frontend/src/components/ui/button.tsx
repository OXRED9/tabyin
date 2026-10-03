import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

/*
 * Something you press has a 6px corner and no shadow. There is one filled action, in the tool's
 * own green; everything else is ink on paper with a hairline or nothing. Focus is the global
 * 2px green outline, so no variant draws a ring of its own.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-control border border-transparent text-sm font-medium whitespace-nowrap select-none transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-green-fill text-primary-foreground hover:bg-green-fill/90",
        outline:
          "border-rule-strong bg-paper text-ink hover:bg-desk aria-expanded:bg-desk",
        ghost: "text-ink hover:bg-desk aria-expanded:bg-desk",
        quiet: "text-green hover:bg-accent aria-expanded:bg-accent",
        destructive: "text-destructive hover:bg-contra-soft",
        link: "h-auto rounded-none p-0 text-green underline decoration-green/40 underline-offset-4 hover:decoration-green",
      },
      size: {
        default: "h-9 gap-2 px-3",
        sm: "h-8 gap-1.5 px-2.5",
        touch: "h-10 gap-2 px-4",
        xl: "h-12 gap-2 px-8 text-base font-semibold [&_svg:not([class*='size-'])]:size-5",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-touch": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button }
