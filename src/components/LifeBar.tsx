import type { RubberLife } from "../utils/life";

type LifeBarProps = {
  life: RubberLife;
};

const statusColor: Record<RubberLife["status"], string> = {
  good: "bg-court",
  watch: "bg-amber-500",
  replace: "bg-spin",
};

const statusLabel: Record<RubberLife["status"], string> = {
  good: "状态稳定",
  watch: "接近衰减",
  replace: "建议更换",
};

export function LifeBar({ life }: LifeBarProps) {
  return (
    <div className="space-y-2">
      <div className="h-2 overflow-hidden rounded-full bg-ink/10">
        <div
          className={`h-full rounded-full ${statusColor[life.status]}`}
          style={{ width: `${life.usedPercent}%` }}
        />
      </div>
      <div className="flex items-center justify-between gap-3 text-[11px] font-medium text-ink/58">
        <span>{statusLabel[life.status]}</span>
        <span>{Math.round(life.usedPercent)}%</span>
      </div>
    </div>
  );
}
