import { formatHours } from "../utils/date";
import type { RubberLife } from "../utils/life";

type LifeBarProps = {
  life: RubberLife;
  /** Also show calendar and play-time usage against the rubber's limits. */
  showDetails?: boolean;
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

export function LifeBar({ life, showDetails = false }: LifeBarProps) {
  const percent = Math.round(life.usedPercent);
  const color = life.state === "retired" ? "bg-ink/40" : statusColor[life.status];
  let label = statusLabel[life.status];
  if (life.state === "retired") label = "已退役 · 寿命已冻结";
  else if (life.state === "inventory") label = life.used ? `拆下待用 · ${statusLabel[life.status]}` : "未贴拍，尚未开始计算";

  return (
    <div className="space-y-2">
      <div
        className="h-2 overflow-hidden rounded-full bg-ink/10"
        role="progressbar"
        aria-label="胶皮寿命消耗"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className={`h-full rounded-full ${color}`} style={{ width: `${life.usedPercent}%` }} />
      </div>
      <div className="flex items-center justify-between gap-3 text-[11px] font-medium text-ink/60">
        <span>{label}</span>
        <span>{percent}%</span>
      </div>
      {showDetails ? (
        <>
          <div className="flex items-center justify-between gap-3 text-[11px] font-semibold text-ink/50">
            <span>
              日历 {life.calendarDays}/{life.calendarLimitDays} 天
            </span>
            <span>
              打球 {formatHours(life.playMinutes)}/{formatHours(life.playLimitMinutes)} h
            </span>
          </div>
          {life.storedDays > 0 ? (
            <div className="text-[11px] font-medium text-ink/45" data-testid="life-storage-note">
              实际 {life.elapsedDays} 天，其中囤货 {life.storedDays} 天按 {life.storageAgingPercent}% 计入日历寿命
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
