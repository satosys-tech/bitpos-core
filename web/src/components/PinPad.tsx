import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

const KEYS = ["1","2","3","4","5","6","7","8","9","","0","del"];

interface PinPadProps {
  value: string;
  onChange: (val: string) => void;
  maxLength?: number;
  className?: string;
  large?: boolean;
  disabled?: boolean;
}

export default function PinPad({ value, onChange, maxLength = 4, className, large = false, disabled = false }: PinPadProps) {
  const handleKey = (key: string) => {
    if (disabled) return;
    if (key === "del") onChange(value.slice(0, -1));
    else if (value.length < maxLength) onChange(value + key);
  };

  return (
    <div className={cn(large ? "w-full max-w-sm mx-auto" : "w-full max-w-xs mx-auto", className)}>
      <div className={cn("flex justify-center mb-6", large ? "gap-5" : "gap-3")}>
        {Array.from({ length: maxLength }).map((_, i) => (
          <div key={i} className={cn(
            "rounded-full border-2 transition-all duration-150",
            large ? "w-5 h-5" : "w-3 h-3",
            i < value.length ? "bg-primary border-primary scale-110" : "border-muted-foreground bg-transparent"
          )} />
        ))}
      </div>
      <div className={cn("grid grid-cols-3", large ? "gap-4" : "gap-3")}>
        {KEYS.map((key, idx) => {
          if (key === "") return <div key={idx} />;
          return (
            <button key={idx} type="button" onClick={() => handleKey(key)} disabled={disabled}
              className={cn(
                "rounded-2xl flex items-center justify-center font-semibold transition-all active:scale-95 disabled:opacity-40",
                large ? "h-20 text-3xl" : "h-14 text-xl",
                key === "del" ? "bg-muted text-muted-foreground hover:bg-muted/80" : "bg-card text-foreground hover:bg-card/80 border border-border"
              )}>
              {key === "del" ? <Delete className={large ? "w-7 h-7" : "w-5 h-5"} /> : key}
            </button>
          );
        })}
      </div>
    </div>
  );
}
