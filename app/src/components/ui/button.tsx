import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "default" | "ghost" | "outline";
type Size = "sm" | "md" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  default:
    "bg-[color:var(--color-accent)] text-[color:var(--color-accent-fg)] hover:opacity-90",
  ghost:
    "bg-transparent text-[color:var(--color-fg)] hover:bg-[color:var(--color-surface-sunken)]",
  outline:
    "bg-transparent text-[color:var(--color-fg)] border border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-surface-sunken)]",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-7 px-2 text-xs gap-1.5",
  md: "h-9 px-3 text-sm gap-2",
  icon: "h-8 w-8 p-0",
};

/**
 * Minimal copy-in Button primitive in the shadcn/ui spirit.
 * Lives under `src/components/ui/` so future shadcn-style primitives sit beside it.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant = "default", size = "md", type, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        className={cn(
          "inline-flex items-center justify-center rounded-md font-medium transition-colors",
          "disabled:cursor-not-allowed disabled:opacity-50",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...rest}
      />
    );
  },
);
