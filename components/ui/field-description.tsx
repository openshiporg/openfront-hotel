import * as React from "react"
import { cn } from "@/lib/utils"

interface FieldDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {
  children: React.ReactNode
}

// Staff forms show labels only (a placeholder at most). Generated field views pass the schema's helper
// sentence here, so it renders nothing; screens that need an explanatory line use their own copy.
const FieldDescription = React.forwardRef<HTMLParagraphElement, FieldDescriptionProps>(
  ({ className, children, ...props }, ref) => {
    if (!(props as any)['data-keep']) return null
    return (
      <p
        ref={ref}
        className={cn("text-sm text-muted-foreground", className)}
        {...props}
      >
        {children}
      </p>
    )
  }
)
FieldDescription.displayName = "FieldDescription"

export { FieldDescription } 