import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066CC] focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        default:
          "bg-[#0066CC] text-white shadow-2xs hover:bg-[#0055B3] active:bg-[#004C9E] font-semibold",
        destructive:
          "bg-red-600 text-white shadow-2xs hover:bg-red-700 active:bg-red-800 font-semibold",
        outline:
          "border border-slate-200/90 bg-white text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 active:bg-slate-100 font-medium",
        secondary:
          "bg-[#E9F7FF] text-[#0066CC] hover:bg-[#D4EFFF] active:bg-[#C2E5FC] font-semibold",
        ghost:
          "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 active:bg-slate-200/60 font-medium",
        link: "text-[#0066CC] underline-offset-4 hover:underline font-medium p-0 h-auto",
      },
      size: {
        default: "h-9 px-3.5 py-1.5",
        sm: "h-8 px-2.5 text-xs rounded-md",
        lg: "h-10 px-4 text-sm rounded-lg",
        icon: "h-8 w-8 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
