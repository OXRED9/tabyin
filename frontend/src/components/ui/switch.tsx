import * as React from "react"
import { cn } from "cn"
import { Switch as SwitchPrimitive } from "radix-ui"

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer relative inline-flex h-5 w-9 shrink-0 items-center rounded-tag transition-colors duration-150 after:absolute after:-inset-x-2 after:-inset-y-3 data-checked:bg-green-fill data-unchecked:bg-rule-strong data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-4 rounded-tag bg-(--on-fill) transition-transform duration-150 data-checked:translate-x-[18px] data-unchecked:translate-x-0.5 rtl:data-checked:-translate-x-[18px] rtl:data-unchecked:-translate-x-0.5"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
