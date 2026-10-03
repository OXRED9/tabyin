import * as React from "react"
import { cn } from "cn"
import { Switch as SwitchPrimitive } from "radix-ui"

/* Off: a paper track with a field's edge and a quiet thumb. On: the green track, a white thumb. */
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer relative inline-flex h-5 w-9 shrink-0 items-center rounded-tag border transition-colors duration-150 after:absolute after:-inset-x-2 after:-inset-y-3 data-checked:border-green-fill data-checked:bg-green-fill data-unchecked:border-rule-strong data-unchecked:bg-paper data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-3.5 rounded-tag transition-[translate,background-color] duration-150 data-checked:translate-x-[18px] data-checked:bg-(--on-fill) data-unchecked:translate-x-0.5 data-unchecked:bg-quiet rtl:data-checked:-translate-x-[18px] rtl:data-unchecked:-translate-x-0.5"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
