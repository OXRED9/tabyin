import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CheckIcon, InfoIcon, TriangleAlertIcon, CircleAlertIcon } from "lucide-react"

import { useEffect } from "react"

import { useTheme } from "@/hooks/use-theme"
import { toasterMounted } from "@/lib/notify"

/* A toast lies over the page: paper, a hairline, the 6px corner and the one shadow. */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme()
  // Sonner subscribes in its own effect, which runs before this one: from here on a toast is heard.
  useEffect(() => toasterMounted(), [])

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <CheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <CircleAlertIcon className="size-4" />,
      }}
      style={
        {
          "--normal-bg": "var(--paper)",
          "--normal-text": "var(--ink)",
          "--normal-border": "var(--rule)",
          "--border-radius": "var(--radius-control)",
          fontFamily: "var(--font-ui)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "shadow-overlay!",
          actionButton: "rounded-control! bg-green-fill! text-(--on-fill)! font-semibold!",
        },
      }}
      {...props}
    />
  )
}

export default Toaster
