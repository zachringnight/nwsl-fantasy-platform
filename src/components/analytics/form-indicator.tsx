import type { FormResult } from "@/types/analytics";
import { cn } from "@/lib/utils";

interface FormIndicatorProps {
  form: FormResult[];
  className?: string;
}

const formColors: Record<FormResult, string> = {
  W: "bg-brand-lime",
  D: "bg-warning",
  L: "bg-danger",
};

const formLabels: Record<FormResult, string> = {
  W: "Win",
  D: "Draw",
  L: "Loss",
};

export function FormIndicator({ form, className }: FormIndicatorProps) {
  return (
    <div className={cn("flex gap-1", className)}>
      {form.map((result, i) => (
        <span
          key={i}
          className={cn(
            "flex size-5 items-center justify-center rounded-full text-[0.55rem] font-bold text-night",
            formColors[result]
          )}
          title={formLabels[result]}
        >
          {result}
        </span>
      ))}
    </div>
  );
}
