import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CheckIcon, InfoIcon, TriangleAlertIcon, CircleAlertIcon } from "lucide-react"

import { useTheme } from "@/hooks/use-theme"

/* A toast lies over the page: paper, a hairline, the 6px corner and the one shadow. */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme()

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
          actionButton: "rounded-control! bg-green-fill! text-(--on-fill)! font-medium!",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
