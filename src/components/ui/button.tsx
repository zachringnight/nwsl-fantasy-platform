import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "kinetic-hover inline-flex items-center justify-center gap-2 rounded-full border font-semibold tracking-[-0.01em] transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55 disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        primary:
          "border-brand bg-brand text-white shadow-[0_18px_42px_rgba(5,34,255,0.34)] hover:border-brand-strong hover:bg-brand-strong hover:text-night",
        secondary:
          "border-line bg-white/7 text-foreground hover:border-brand-strong/38 hover:bg-white/10 hover:text-white",
        ghost:
          "border-white/10 bg-transparent text-muted hover:border-brand-strong/30 hover:bg-white/6 hover:text-white",
        accent:
          "border-accent/35 bg-accent text-white shadow-[0_18px_42px_rgba(255,60,34,0.24)] hover:border-brand-lime hover:bg-brand-lime hover:text-night",
      },
      size: {
        sm: "min-h-11 px-4 text-sm",
        md: "min-h-11 px-5 text-sm",
        lg: "min-h-12 px-6 text-base",
      },
      fullWidth: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      fullWidth: false,
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({
  className,
  fullWidth,
  size,
  variant,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      {...props}
    />
  );
}

export function getButtonClassName(
  options?: VariantProps<typeof buttonVariants> & { className?: string }
) {
  return cn(
    buttonVariants({
      fullWidth: options?.fullWidth,
      size: options?.size,
      variant: options?.variant,
    }),
    options?.className
  );
}
