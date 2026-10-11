import { History, Link2, Minus, Package, PackageOpen, PackagePlus, Pencil, Plus, RotateCcw, Sparkles, Waves } from "lucide-react";
import { useMemo, useState } from "react";
import { ActivateBladeModal, BladeFormModal, MountRubberModal, RubberFormModal } from "../components/InventoryDialogs";
import { LifeBar } from "../components/LifeBar";
import { RacketSpecBadges } from "../components/RacketSpecs";
import { describeCustomLife, describeRubberSpecs, RubberLabelPill } from "../components/RubberForm";
import {
  BackButton,
  ConfirmButton,
  EmptyState,
  ErrorBanner,
  SegmentedControl,
  buttonClass,
  cardClass,
  useAsyncAction,
  useSyncedState,
} from "../components/ui";
import { countInventorySheets, getInventoryRubbers, getMountedRubber, LIMITS } from "../db/domain";
import {
  getRacketStatus,
  getRubberQuantity,
  RUBBER_SIDES,
  rubberSideLabel,
  type BoostingLog,
  type PlaySession,
  type Racket,
  type Rubber,
  type RubberSide,
} from "../db/schema";
import { useAppData } from "../db/store";
import { formatDate, formatFullDate, formatHours, formatTimestamp } from "../utils/date";
import { calculateRubberLife, getBoostingSummary } from "../utils/life";
import { sortRackets } from "../utils/rackets";

export type InventoryTab = "rubbers" | "blades";

type InventoryProps = {
  initialTab?: InventoryTab;
  onBack: () => void;
  /** Keeps the URL in step with the selected tab. */
  onTabChange?: (tab: InventoryTab) => void;
  onOpenRacket: (racketId: string) => void;
};

type Dialog =
  | { type: "rubber-form"; rubberId?: string }
  | { type: "mount"; rubberId: string }
  | { type: "blade-form"; racketId?: string }
  | { type: "activate"; racketId: string };

const stepButtonClass =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-ink shadow-sm ring-1 ring-ink/15 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40";

function RubberCardTitle({ rubber }: { rubber: Rubber }) {
  const count = getRubberQuantity(rubber);
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <h3 className="truncate text-base font-black text-ink">{rubber.name}</h3>
      <RubberLabelPill label={rubber.label} />
      {count > 1 ? (
        <span className="shrink-0 rounded-full bg-ink px-2 py-0.5 text-[11px] font-black text-white" data-testid={`inventory-quantity-${rubber.id}`}>
          ×{count}
        </span>
      ) : null}
    </div>
  );
}

/** A brand-new stock record: one or more identical unopened sheets. */
function StockRubberCard({
  rubber,
  onMount,
  onEdit,
  onDelete,
  onQuantity,
  busy,
}: {
  rubber: Rubber;
  onMount: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onQuantity: (quantity: number) => void;
  busy: boolean;
}) {
  const customLife = describeCustomLife(rubber);
  const count = getRubberQuantity(rubber);
  return (
    <article className={cardClass} data-testid={`inventory-rubber-${rubber.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <RubberCardTitle rubber={rubber} />
          <p className="mt-1 text-xs font-medium text-ink/55">{describeRubberSpecs(rubber)}</p>
          {customLife ? <p className="mt-1 text-xs font-semibold text-court">{customLife}</p> : null}
          {rubber.notes ? <p className="mt-1 whitespace-pre-wrap break-words text-xs text-ink/50">{rubber.notes}</p> : null}
        </div>
        <span className="shrink-0 text-[11px] font-medium text-ink/40">入库 {formatTimestamp(rubber.createdAt)}</span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 rounded-md bg-paper px-3 py-2">
        <span className="text-xs font-bold text-ink/60">库存</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onQuantity(count - 1)}
            disabled={busy || count <= 1}
            className={stepButtonClass}
            aria-label={`${rubber.name} 少一张`}
            title={count <= 1 ? "只剩 1 张，不需要了可以删除" : "少一张"}
            data-testid={`inventory-quantity-minus-${rubber.id}`}
          >
            <Minus size={16} aria-hidden="true" />
          </button>
          <span className="min-w-12 text-center text-sm font-black tabular-nums text-ink">{count} 张</span>
          <button
            type="button"
            onClick={() => onQuantity(count + 1)}
            disabled={busy || count >= LIMITS.maxQuantity}
            className={stepButtonClass}
            aria-label={`${rubber.name} 多一张`}
            title="多一张"
            data-testid={`inventory-quantity-plus-${rubber.id}`}
          >
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onMount} className={`${buttonClass.court} flex-1`} data-testid={`mount-rubber-${rubber.id}`}>
          <Link2 size={16} aria-hidden="true" />
          {count > 1 ? "贴 1 张到球拍" : "贴到球拍"}
        </button>
        <button type="button" onClick={onEdit} className={buttonClass.secondary} data-testid={`edit-rubber-${rubber.id}`}>
          <Pencil size={16} aria-hidden="true" />
          编辑
        </button>
        <ConfirmButton
          onConfirm={onDelete}
          label="删除"
          confirmLabel={count > 1 ? `删除全部 ${count} 张` : "确认删除"}
          testId={`delete-rubber-${rubber.id}`}
        />
      </div>
    </article>
  );
}

/** A used sheet taken off a racket, waiting to be mounted again: its life keeps counting, more slowly. */
function UsedRubberCard({
  rubber,
  sessions,
  boostingLogs,
  onMount,
  onEdit,
  onDelete,
}: {
  rubber: Rubber;
  sessions: PlaySession[];
  boostingLogs: BoostingLog[];
  onMount: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const life = calculateRubberLife(rubber, sessions);
  const boosting = getBoostingSummary(rubber, boostingLogs);
  const customLife = describeCustomLife(rubber);
  return (
    <article className={cardClass} data-testid={`inventory-rubber-${rubber.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <RubberCardTitle rubber={rubber} />
          <p className="mt-1 text-xs font-medium text-ink/55">{describeRubberSpecs(rubber)}</p>
        </div>
        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-700">拆下待用</span>
      </div>
      <div className="mt-3">
        <LifeBar life={life} showDetails />
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-ink/55">
        <span className="inline-flex items-center gap-1">
          <History size={13} aria-hidden="true" />
          首次贴拍 {rubber.installedAt ? formatFullDate(rubber.installedAt) : "未知"}
        </span>
        {rubber.stashedAt ? <span>拆下 {formatFullDate(rubber.stashedAt)}</span> : null}
        <span>已打 {formatHours(life.playMinutes)} h</span>
        {rubber.boosted || boosting.count ? (
          <span className="inline-flex items-center gap-1 text-court">
            <Waves size={13} aria-hidden="true" />
            灌油 {boosting.count} 次{boosting.lastDate ? ` · 上次 ${formatDate(boosting.lastDate)}` : ""}
          </span>
        ) : null}
      </p>
      <p className="mt-1 text-xs font-medium text-ink/45">囤着不打球，日历寿命按 {life.storageAgingPercent}% 的速度继续</p>
      {customLife ? <p className="mt-1 text-xs font-semibold text-court">{customLife}</p> : null}
      {rubber.notes ? <p className="mt-1 whitespace-pre-wrap break-words text-xs text-ink/50">{rubber.notes}</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onMount} className={`${buttonClass.court} flex-1`} data-testid={`mount-rubber-${rubber.id}`}>
          <Link2 size={16} aria-hidden="true" />
          重新贴到球拍
        </button>
        <button type="button" onClick={onEdit} className={buttonClass.secondary} data-testid={`edit-rubber-${rubber.id}`}>
          <Pencil size={16} aria-hidden="true" />
          编辑
        </button>
        <ConfirmButton onConfirm={onDelete} label="删除" testId={`delete-rubber-${rubber.id}`} />
      </div>
    </article>
  );
}

function SpareBladeCard({
  racket,
  mounted,
  onOpen,
  onActivate,
  onEdit,
  onDelete,
}: {
  racket: Racket;
  mounted: Record<RubberSide, Rubber | undefined>;
  onOpen: () => void;
  onActivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className={cardClass} data-testid={`spare-blade-${racket.id}`}>
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 text-left" aria-label={`查看 ${racket.name} 详情`}>
          <h3 className="truncate text-base font-black text-ink">{racket.name}</h3>
          <p className="mt-1 truncate text-sm text-ink/55">{racket.blade}</p>
          <RacketSpecBadges racket={racket} className="mt-2" />
        </button>
        <span className="shrink-0 rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-bold text-ink/55">闲置</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        {RUBBER_SIDES.map((side) => (
          <div key={side} className="min-w-0 truncate rounded-md bg-paper px-2 py-1.5">
            <span className="font-bold text-court">{rubberSideLabel[side]}</span>{" "}
            <span className="text-ink/60">{mounted[side]?.name ?? "空"}</span>
          </div>
        ))}
      </div>
      {racket.notes ? <p className="mt-2 whitespace-pre-wrap break-words text-xs text-ink/50">{racket.notes}</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onActivate} className={`${buttonClass.court} flex-1`} data-testid={`activate-blade-${racket.id}`}>
          <Sparkles size={16} aria-hidden="true" />
          配胶启用
        </button>
        <button type="button" onClick={onEdit} className={buttonClass.secondary} data-testid={`edit-blade-${racket.id}`}>
          <Pencil size={16} aria-hidden="true" />
          编辑
        </button>
        <ConfirmButton onConfirm={onDelete} label="删除" testId={`delete-blade-${racket.id}`} />
      </div>
    </article>
  );
}

export function Inventory({ initialTab = "rubbers", onBack, onTabChange, onOpenRacket }: InventoryProps) {
  const { data, isLoading, deleteRubber, deleteRacket, updateRacket, updateRubber } = useAppData();
  // Follows the URL (e.g. 「返回」 from a spare blade opens the blades tab of a mounted page).
  const [tab, setTab] = useSyncedState<InventoryTab>(() => initialTab, initialTab);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const action = useAsyncAction();

  const rubbers = useMemo(() => getInventoryRubbers(data), [data]);
  const stockRubbers = rubbers.filter((rubber) => !rubber.installedAt);
  const usedRubbers = rubbers.filter((rubber) => rubber.installedAt);
  const sheetCount = useMemo(() => countInventorySheets(data), [data]);
  const spareBlades = useMemo(
    () => sortRackets(data.rackets.filter((racket) => getRacketStatus(racket) === "inventory")),
    [data.rackets],
  );
  const retiredRackets = useMemo(
    () => sortRackets(data.rackets.filter((racket) => getRacketStatus(racket) === "retired")),
    [data.rackets],
  );

  const closeDialog = () => setDialog(null);
  const findRubber = (id: string) => data.rubbers.find((rubber) => rubber.id === id);
  const findRacket = (id: string) => data.rackets.find((racket) => racket.id === id);

  function selectTab(next: InventoryTab) {
    setTab(next);
    onTabChange?.(next);
  }

  function renderDialog() {
    if (!dialog) return null;
    switch (dialog.type) {
      case "rubber-form": {
        if (!dialog.rubberId) return <RubberFormModal onClose={closeDialog} />;
        const rubber = findRubber(dialog.rubberId);
        return rubber ? <RubberFormModal rubber={rubber} onClose={closeDialog} /> : null;
      }
      case "mount": {
        const rubber = findRubber(dialog.rubberId);
        return rubber ? <MountRubberModal rubber={rubber} onClose={closeDialog} /> : null;
      }
      case "blade-form": {
        if (!dialog.racketId) return <BladeFormModal onClose={closeDialog} />;
        const racket = findRacket(dialog.racketId);
        return racket ? <BladeFormModal racket={racket} onClose={closeDialog} /> : null;
      }
      case "activate": {
        const racket = findRacket(dialog.racketId);
        return racket ? <ActivateBladeModal racket={racket} onClose={closeDialog} /> : null;
      }
      default:
        return null;
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-4 sm:px-6 lg:gap-6 lg:px-8 lg:py-8">
      <div className="flex items-center justify-between gap-3">
        <BackButton onClick={onBack} />
        <div className="rounded-full bg-limeglass px-3 py-1 text-xs font-bold text-court">囤货</div>
      </div>

      <header className="lg:flex lg:items-end lg:justify-between lg:gap-6">
        <div>
          <h1 className="text-3xl font-black tracking-normal text-ink">囤货管理</h1>
          <p className="mt-2 text-sm font-medium text-ink/55">登记新买的胶皮、暂时撕下来之后还要用的胶皮和备用底板，换胶、配拍时直接选用。</p>
        </div>
        <div className="mt-4 lg:mt-0 lg:w-96">
          <SegmentedControl
            ariaLabel="囤货类型"
            value={tab}
            onChange={selectTab}
            options={[
              { value: "rubbers", label: `闲置胶皮库 · ${sheetCount}`, testId: "inventory-tab-rubbers" },
              { value: "blades", label: `闲置底板库 · ${spareBlades.length}`, testId: "inventory-tab-blades" },
            ]}
          />
        </div>
      </header>

      <ErrorBanner message={action.error} onDismiss={() => action.setError(null)} />

      {isLoading ? (
        <p className="py-6 text-sm text-ink/60">加载中...</p>
      ) : tab === "rubbers" ? (
        <section className="grid gap-5" data-testid="inventory-rubbers">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-ink">闲置胶皮</h2>
            <button
              type="button"
              onClick={() => setDialog({ type: "rubber-form" })}
              className={buttonClass.court}
              data-testid="inventory-add-rubber"
            >
              <PackagePlus size={18} aria-hidden="true" />
              添加胶皮
            </button>
          </div>

          {rubbers.length ? (
            <>
              {stockRubbers.length ? (
                <div className="grid gap-3" data-testid="inventory-stock-rubbers">
                  <h3 className="flex items-center gap-2 text-sm font-black text-ink/70">
                    <Package size={16} aria-hidden="true" />
                    全新未拆
                    <span className="text-xs font-bold text-ink/45">
                      {stockRubbers.reduce((total, rubber) => total + getRubberQuantity(rubber), 0)} 张
                    </span>
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {stockRubbers.map((rubber) => (
                      <StockRubberCard
                        key={rubber.id}
                        rubber={rubber}
                        busy={action.pending}
                        onMount={() => setDialog({ type: "mount", rubberId: rubber.id })}
                        onEdit={() => setDialog({ type: "rubber-form", rubberId: rubber.id })}
                        onDelete={() => void action.run(() => deleteRubber(rubber.id))}
                        onQuantity={(quantity) => void action.run(() => updateRubber(rubber.id, { quantity }))}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {usedRubbers.length ? (
                <div className="grid gap-3" data-testid="inventory-used-rubbers">
                  <h3 className="flex items-center gap-2 text-sm font-black text-ink/70">
                    <PackageOpen size={16} aria-hidden="true" />
                    拆下待用
                    <span className="text-xs font-bold text-ink/45">{usedRubbers.length} 张 · 寿命继续计算</span>
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {usedRubbers.map((rubber) => (
                      <UsedRubberCard
                        key={rubber.id}
                        rubber={rubber}
                        sessions={data.playSessions}
                        boostingLogs={data.boostingLogs}
                        onMount={() => setDialog({ type: "mount", rubberId: rubber.id })}
                        onEdit={() => setDialog({ type: "rubber-form", rubberId: rubber.id })}
                        onDelete={() => void action.run(() => deleteRubber(rubber.id))}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <EmptyState
              icon={<Package size={20} aria-hidden="true" />}
              title="还没有囤货胶皮"
              description="新买的胶皮先登记在这里（同款可以一次登记多张），贴上球拍后才开始计算寿命；暂时撕下来之后还要用的胶皮，在球拍页点「撕下」→「放回囤货」，会带着已用寿命出现在这里。"
            />
          )}
        </section>
      ) : (
        <>
          <section className="grid gap-3" data-testid="inventory-blades">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-bold text-ink">闲置底板</h2>
              <button
                type="button"
                onClick={() => setDialog({ type: "blade-form" })}
                className={buttonClass.court}
                data-testid="inventory-add-blade"
              >
                <Plus size={18} aria-hidden="true" />
                添加底板
              </button>
            </div>
            {spareBlades.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {spareBlades.map((racket) => (
                  <SpareBladeCard
                    key={racket.id}
                    racket={racket}
                    mounted={{
                      forehand: getMountedRubber(data, racket, "forehand"),
                      backhand: getMountedRubber(data, racket, "backhand"),
                    }}
                    onOpen={() => onOpenRacket(racket.id)}
                    onActivate={() => setDialog({ type: "activate", racketId: racket.id })}
                    onEdit={() => setDialog({ type: "blade-form", racketId: racket.id })}
                    onDelete={() => void action.run(() => deleteRacket(racket.id))}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Package size={20} aria-hidden="true" />}
                title="没有闲置底板"
                description="备用底板登记在这里，配好胶皮后一键启用到首页。"
              />
            )}
          </section>

          {retiredRackets.length ? (
            <section className="grid gap-3" data-testid="retired-rackets">
              <h2 className="text-base font-bold text-ink">已退役球拍</h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {retiredRackets.map((racket) => (
                  <article
                    key={racket.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-ink/10 bg-white px-4 py-3"
                    data-testid={`retired-racket-${racket.id}`}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenRacket(racket.id)}
                      className="min-w-0 text-left"
                      aria-label={`查看 ${racket.name} 详情`}
                    >
                      <div className="truncate text-sm font-bold text-ink">{racket.name}</div>
                      <div className="truncate text-xs text-ink/50">{racket.blade}</div>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void action.run(() => updateRacket(racket.id, { status: "inventory" }))}
                        className={buttonClass.ghost}
                        data-testid={`restore-racket-${racket.id}`}
                      >
                        <RotateCcw size={16} aria-hidden="true" />
                        恢复为闲置
                      </button>
                      <ConfirmButton
                        onConfirm={() => void action.run(() => deleteRacket(racket.id))}
                        ariaLabel={`删除 ${racket.name}`}
                        confirmLabel="删除"
                        className={buttonClass.icon}
                        armedClassName={buttonClass.armedPill}
                        testId={`delete-retired-racket-${racket.id}`}
                      />
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}

      {renderDialog()}
    </div>
  );
}
