import { Boxes, Cloud, CloudOff, CloudUpload, Droplets, LoaderCircle, Plus, SquarePen, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { CloudSyncModal } from "../components/CloudSyncModal";
import { RacketCard } from "../components/RacketCard";
import { EmptyState, buttonClass } from "../components/ui";
import { getInventoryRubbers, getMountedRubber } from "../db/domain";
import { getRacketStatus, RUBBER_SIDES, rubberSideLabel, type Racket, type Rubber, type RubberSide } from "../db/schema";
import { useAppData } from "../db/store";
import { isWithinLastDays } from "../utils/date";
import { getBoostingSummary, type BoostingSummary } from "../utils/life";
import { sortRackets } from "../utils/rackets";

type DashboardProps = {
  onAddSession: (racketId?: string) => void;
  onAddRacket: () => void;
  onOpenRacket: (racketId: string) => void;
  onOpenInventory: () => void;
};

type ReboostAlert = { racket: Racket; side: RubberSide; rubber: Rubber; summary: BoostingSummary };

/** Data-mode chip in the header; opens the cloud sync dialog. */
function CloudChip({ onClick }: { onClick: () => void }) {
  const { mode, cloud } = useAppData();
  const username = cloud.user?.username ?? "";

  let icon = <CloudOff size={14} aria-hidden="true" />;
  let label = "本地模式";
  if (mode === "cloud") {
    if (cloud.status === "loading") {
      icon = <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />;
      label = `同步中 · ${username}`;
    } else if (cloud.status === "error") {
      icon = <TriangleAlert size={14} aria-hidden="true" />;
      label = `同步失败 · ${username}`;
    } else {
      icon = <Cloud size={14} aria-hidden="true" />;
      label = `云端已同步 · ${username}`;
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="cloud-chip"
      data-mode={mode}
      aria-label={`${label}，打开云端同步`}
      title="云端同步"
      className={`tap-target inline-flex min-w-0 max-w-[65%] items-center gap-1.5 rounded-full px-3 text-xs font-bold transition active:scale-95 ${
        mode === "cloud" ? "bg-limeglass text-court" : "bg-white/10 text-white/85 ring-1 ring-white/20"
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

export function Dashboard({ onAddSession, onAddRacket, onOpenRacket, onOpenInventory }: DashboardProps) {
  const { data, isLoading, mode, local } = useAppData();
  const [syncOpen, setSyncOpen] = useState(false);

  const activeRackets = useMemo(
    () => sortRackets(data.rackets.filter((racket) => getRacketStatus(racket) === "active")),
    [data.rackets],
  );
  const inventoryRubberCount = useMemo(() => getInventoryRubbers(data).length, [data]);
  const spareBladeCount = data.rackets.filter((racket) => getRacketStatus(racket) === "inventory").length;
  const rubberById = useMemo(() => new Map(data.rubbers.map((rubber) => [rubber.id, rubber])), [data.rubbers]);
  const reboostAlerts = useMemo<ReboostAlert[]>(
    () =>
      activeRackets.flatMap((racket) =>
        RUBBER_SIDES.flatMap((side) => {
          const rubber = getMountedRubber(data, racket, side);
          if (!rubber) return [];
          const summary = getBoostingSummary(rubber, data.boostingLogs);
          return summary.needsReboost ? [{ racket, side, rubber, summary }] : [];
        }),
      ),
    [activeRackets, data],
  );

  const weekMinutes = data.playSessions
    .filter((session) => isWithinLastDays(session.date, 7))
    .reduce((total, session) => total + session.durationMinutes, 0);
  const showImportPrompt = mode === "cloud" && local.hasCustomData && !local.importedAt;

  return (
    <>
      {isLoading ? (
        <div className="px-4 py-10 text-sm text-ink/60">加载中...</div>
      ) : (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-4 sm:px-6">
          <section className="rounded-lg bg-ink px-4 py-5 text-white shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <p className="shrink-0 text-xs font-semibold uppercase tracking-[0.18em] text-limeglass/70">Racket Life</p>
              <CloudChip onClick={() => setSyncOpen(true)} />
            </div>
            <h1 className="mt-2 text-2xl font-black leading-tight">球拍与胶皮寿命</h1>

            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-white/10 px-2 py-3">
                <div className="text-xl font-black">{activeRackets.length}</div>
                <div className="mt-1 text-[11px] font-medium text-white/60">在用球拍</div>
              </div>
              <button
                type="button"
                onClick={onOpenInventory}
                className="rounded-md bg-white/10 px-2 py-3 transition hover:bg-white/15 active:scale-95"
                aria-label={`囤货：${inventoryRubberCount} 张胶皮、${spareBladeCount} 块底板`}
                data-testid="inventory-stat"
              >
                <div className="text-xl font-black">
                  {inventoryRubberCount}
                  <span className="text-sm font-bold text-white/60"> / {spareBladeCount}</span>
                </div>
                <div className="mt-1 text-[11px] font-medium text-white/60">囤货 胶皮/底板</div>
              </button>
              <div className="rounded-md bg-white/10 px-2 py-3">
                <div className="text-xl font-black">{weekMinutes}</div>
                <div className="mt-1 text-[11px] font-medium text-white/60">分钟 / 近 7 天</div>
              </div>
            </div>
          </section>

          {showImportPrompt ? (
            <button
              type="button"
              onClick={() => setSyncOpen(true)}
              className="flex items-center gap-3 rounded-lg border border-court/25 bg-limeglass px-4 py-3 text-left transition active:scale-[0.99]"
              data-testid="import-prompt"
            >
              <CloudUpload size={20} className="shrink-0 text-court" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black text-ink">这台设备上还有本地数据</span>
                <span className="block text-xs font-medium text-ink/60">一键导入当前云端账号，之后多设备同步。</span>
              </span>
              <span className="shrink-0 text-xs font-black text-court">去导入</span>
            </button>
          ) : null}

          {reboostAlerts.length ? (
            <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3" data-testid="reboost-banner">
              <div className="flex items-center gap-2 text-sm font-black text-amber-800">
                <Droplets size={16} aria-hidden="true" />
                {reboostAlerts.length} 张胶皮建议复灌
              </div>
              <ul className="mt-2 grid grid-cols-1 gap-1">
                {reboostAlerts.map(({ racket, side, rubber, summary }) => (
                  <li key={rubber.id} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpenRacket(racket.id)}
                      className="flex min-h-10 w-full items-center justify-between gap-3 rounded-md px-2 py-1 text-left transition hover:bg-amber-100"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-bold text-amber-900">
                          {racket.name} · {rubberSideLabel[side]}
                        </span>
                        <span className="block truncate text-[11px] font-medium text-amber-800/75">{rubber.name}</span>
                      </span>
                      <span className="shrink-0 text-right text-[11px] font-semibold leading-4 text-amber-800">
                        <span className="block">距上次 {summary.daysSinceLastBoost} 天</span>
                        <span className="block text-amber-800/70">周期 {summary.cycleDays} 天</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-ink">当前球拍</h2>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={onOpenInventory}
                className="tap-target inline-flex items-center justify-center gap-1.5 rounded-full bg-white px-3 text-sm font-bold text-ink shadow-sm ring-1 ring-ink/10 transition active:scale-95"
                aria-label="囤货管理"
                title="囤货管理"
                data-testid="open-inventory"
              >
                <Boxes size={18} aria-hidden="true" />
                <span className="hidden sm:inline">囤货</span>
              </button>
              <button
                type="button"
                onClick={onAddRacket}
                className="tap-target inline-flex items-center justify-center rounded-full bg-white px-3 text-sm font-bold text-ink shadow-sm ring-1 ring-ink/10 transition active:scale-95"
                aria-label="新增球拍"
                title="新增球拍"
              >
                <SquarePen size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onAddSession()}
                className="tap-target inline-flex items-center gap-2 rounded-full bg-court px-4 text-sm font-bold text-white shadow-sm transition active:scale-95"
              >
                <Plus size={18} aria-hidden="true" />
                记录打球
              </button>
            </div>
          </div>

          {activeRackets.length ? (
            <div className="grid gap-4">
              {activeRackets.map((racket) => (
                <RacketCard
                  key={racket.id}
                  racket={racket}
                  forehand={racket.forehandRubberId ? rubberById.get(racket.forehandRubberId) : undefined}
                  backhand={racket.backhandRubberId ? rubberById.get(racket.backhandRubberId) : undefined}
                  sessions={data.playSessions}
                  boostingLogs={data.boostingLogs}
                  onAddSession={onAddSession}
                  onOpenRacket={onOpenRacket}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<SquarePen size={20} aria-hidden="true" />}
              title="还没有在用的球拍"
              description="新增一块球拍，或在囤货里给闲置底板配胶启用。"
            >
              <button type="button" onClick={onAddRacket} className={buttonClass.primary}>
                新增球拍
              </button>
              <button type="button" onClick={onOpenInventory} className={buttonClass.secondary}>
                打开囤货
              </button>
            </EmptyState>
          )}
        </div>
      )}

      {syncOpen ? <CloudSyncModal onClose={() => setSyncOpen(false)} /> : null}
    </>
  );
}
