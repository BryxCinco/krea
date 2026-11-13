import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "outline" | "signal";

const styles: Record<Variant, string> = {
  primary: "bg-lime text-on-lime font-semibold hover:brightness-110 disabled:bg-line disabled:text-muted",
  outline: "border border-line text-fg hover:border-accent hover:text-accent disabled:text-muted disabled:hover:border-line",
  ghost: "text-muted hover:text-fg hover:bg-raised",
  signal: "border border-signal text-signal font-semibold hover:bg-signal hover:text-on-signal",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Square icon-only button. Always pass an aria-label with it. */
  icon?: boolean;
}

/** Base button. Minimum 40px tall so it stays thumb-reachable on phones. */
export function Button({ variant = "outline", icon = false, className = "", type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md text-sm transition-colors ${
        icon ? "w-10" : "px-4"
      } ${styles[variant]} ${className}`}
      {...props}
    />
  );
}
