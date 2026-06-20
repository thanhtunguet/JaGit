import type { Period } from "@/hooks/useUsageData.js";

interface Props {
  selected: Period;
  onChange: (p: Period) => void;
}

const PERIODS: Period[] = ["Today", "7 Days", "30 Days"];

export function PeriodToggle({ selected, onChange }: Props) {
  return (
    <div className="flex gap-1 bg-muted rounded-lg p-1">
      {PERIODS.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            selected === p
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}
