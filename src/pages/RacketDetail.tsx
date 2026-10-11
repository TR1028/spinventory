import {
  Archive,
  ArrowRightLeft,
  CalendarDays,
  Check,
  Clock3,
  Droplets,
  History,
  PackageOpen,
  PackagePlus,
  Pencil,
  Plus,
  Save,
  Trash2,
  Undo2,
  Waves,
} from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { CatalogPicker } from "../components/CatalogPicker";
import { LifeBar } from "../components/LifeBar";
import { OutgoingRubberField } from "../components/OutgoingRubberField";
import { RacketSpecBadges, RacketSpecFields, createRacketSpecForm, specFormToUpdate, type RacketSpecForm } from "../components/RacketSpecs";
import { ReplaceRubberModal } from "../components/ReplaceRubberModal";
import { describeRubberSpecs, formToRubberUpdate, rubberToForm, RubberFormFields, RubberLabelPill } from "../components/RubberForm";
import {
  BackButton,
  ConfirmButton,
  ErrorBanner,
  FieldLabel,
  Modal,
  Notice,
  ReboostBadge,
  SegmentedControl,
  ShowMoreButton,
  TextAreaField,
  TextField,
  buttonClass,
  cardClass,
  useAsyncAction,
  useSyncedState,
} from "../components/ui";
import {
  BACKFILLED_BOOST_NOTE,
  ESTIMATED_BOOST_NOTE,
  getMountedRubber,
  getRetiredRubbers,
  getRubberBoostingLogs,
  INITIAL_BOOST_NOTE,
  MOUNT_BOOST_NOTE,
} from "../db/domain";
import {
  getRacketRubberId,
  getRacketStatus,
  getRubberDisplayName,
  getRubberMountedDate,
  RACKET_STATUSES,
  racketStatusLabel,
  RUBBER_SIDES,
  rubberSideLabel,
  rubberSideName,
  type BoostingLog,
  type PlaySession,
  type Racket,
  type RacketStatus,
  type Rubber,
  type RubberSide,
} from "../db/schema";
import { useAppData, type OutgoingRubberAction } from "../db/store";
import { daysBetween, formatDate, formatFullDate, formatHours, todayISO } from "../utils/date";
import { calculateRubberLife, getBoostingSummary } from "../utils/life";
import { getRacketPlayMinutes } from "../utils/rackets";

type RacketDetailProps = {
  racketId: string;
  onBack: () => void;
  onAddSession: (racketId: string) => void;
  onDeleted: () => void;
  /** Spare and retired rackets live in the inventory, so "back" returns there for them. */
  onOpenInventory: (tab?: "rubbers" | "blades") => void;
};

type Dialog = { type: "replace"; side: RubberSide } | { type: "take-off"; side: RubberSide };

const VISIBLE_BOOSTING_LOGS = 4;
const VISIBLE_SESSIONS = 5;

const statusChipClass: Record<RacketStatus, string> = {
  active: "bg-limeglass text-court",
  inventory: "bg-white/15 text-white",
  retired: "bg-spin text-white",
};

function boostNote(notes?: string) {
  if (notes === INITIAL_BOOST_NOTE) return "初始灌油";
  if (notes === MOUNT_BOOST_NOTE) return "贴拍灌油";
  if (notes === BACKFILLED_BOOST_NOTE) return "录入前补记";
  if (notes === ESTIMATED_BOOST_NOTE) return "录入前补记 · 日期估算";
  return notes;
}

/** Month + day for this year's dates, with the year for older ones. */
function shortDate(value: string) {
  return value.startsWith(`${new Date().getFullYear()}-`) ? formatDate(value) : formatFullDate(value);
}

function parseLayers(value: string) {
  const layers = Number(value);
  if (!value.trim() || !Number.isFinite(layers) || layers <= 0) throw new Error("层数需为大于 0 的整数");
  return Math.max(1, Math.round(layers));
}

function parseMinutes(value: string) {
  const minutes = Number(value);
  if (!value.trim() || !Number.isFinite(minutes) || minutes <= 0) throw new Error("请输入有效时长");
  return Math.round(minutes);
}

function HeaderStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md bg-white/10 px-3 py-3">
      <div className="inline-flex items-center gap-2 text-xs font-medium text-white/60">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-black">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Racket info
// ---------------------------------------------------------------------------

type RacketForm = { name: string; blade: string; status: RacketStatus; notes: string; specs: RacketSpecForm };

function racketToForm(racket: Racket): RacketForm {
  return {
    name: racket.name,
    blade: racket.blade,
    status: getRacketStatus(racket),
    notes: racket.notes ?? "",
    specs: createRacketSpecForm(racket),
  };
}

function RacketInfoForm({ racket }: { racket: Racket }) {
  const { updateRacket } = useAppData();
  const [form, setForm] = useSyncedState(() => racketToForm(racket), `${racket.id}:${racket.updatedAt ?? ""}`);
  const [saved, setSaved] = useState(false);
  const action = useAsyncAction();

  function change(patch: Partial<RacketForm>) {
    setForm((current) => ({ ...current, ...patch }));
    setSaved(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void action.run(async () => {
      await updateRacket(racket.id, {
        name: form.name,
        blade: form.blade,
        status: form.status,
        notes: form.notes.trim() || null,
        ...specFormToUpdate(form.specs),
      });
      setSaved(true);
    });
  }

  return (
    <section className={cardClass}>
      <h2 className="text-base font-black text-ink">球拍信息</h2>
      <form onSubmit={handleSubmit} className="mt-4 grid gap-4 md:grid-cols-3 md:items-start">
        <TextField label="球拍名" value={form.name} onChange={(name) => change({ name })} testId="racket-name-input" />
        <CatalogPicker
          kind="blade"
          label="底板"
          value={form.blade}
          onChange={(blade) => change({ blade })}
          placeholder="搜索或输入底板型号"
          testId="racket-blade-input"
        />
        <div className="grid gap-2">
          <FieldLabel hint="闲置、退役的球拍收在囤货里">状态</FieldLabel>
          <SegmentedControl
            ariaLabel="球拍状态"
            value={form.status}
            onChange={(status) => change({ status })}
            options={RACKET_STATUSES.map((status) => ({
              value: status,
              label: racketStatusLabel[status],
              testId: `racket-status-${status}`,
            }))}
          />
        </div>
        <div className="md:col-span-3">
          <RacketSpecFields value={form.specs} onChange={(specs) => change({ specs })} testIdPrefix="racket" />
        </div>
        <div className="md:col-span-3">
          <TextAreaField label="备注" hint="选填" value={form.notes} onChange={(notes) => change({ notes })} testId="racket-notes-input" />
        </div>
        <div className="md:col-span-3">
          <ErrorBanner message={action.error} />
        </div>
        <div className="md:col-span-3 md:flex md:justify-end">
          <button type="submit" disabled={action.pending} className={`${buttonClass.primary} w-full md:w-auto md:px-6`} data-testid="save-racket-button">
            <Check size={18} aria-hidden="true" />
            {saved ? "已保存" : "保存球拍"}
          </button>
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Mounted rubbers
// ---------------------------------------------------------------------------

function RubberEditForm({ rubber, side }: { rubber: Rubber; side: RubberSide }) {
  const { updateRubber } = useAppData();
  const version = `${rubber.id}:${rubber.updatedAt ?? ""}`;
  const [form, setForm] = useSyncedState(() => rubberToForm(rubber), version);
  const [installedAt, setInstalledAt] = useSyncedState(() => rubber.installedAt ?? todayISO(), version);
  const [saved, setSaved] = useState(false);
  const action = useAsyncAction();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void action.run(async () => {
      await updateRubber(rubber.id, { ...formToRubberUpdate(form), installedAt });
      setSaved(true);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 grid gap-4 border-t border-ink/10 pt-4">
      <h3 className="text-sm font-black text-ink">胶皮信息</h3>
      <RubberFormFields
        value={form}
        onChange={(next) => {
          setForm(next);
          setSaved(false);
        }}
        testIdPrefix={`edit-${side}`}
      />
      <TextField
        label={rubber.mountedAt ? "首次贴拍日期" : "安装日期"}
        hint={rubber.mountedAt ? `贴上这块球拍：${formatFullDate(rubber.mountedAt)}` : undefined}
        type="date"
        value={installedAt}
        onChange={(value) => {
          setInstalledAt(value);
          setSaved(false);
        }}
        required
        testId={`edit-${side}-installed-at`}
      />
      <ErrorBanner message={action.error} />
      <button data-testid={`add-boost-${rubber.id}`} type="submit" disabled={action.pending} className={buttonClass.primary}>
        <Save size={18} aria-hidden="true" />
        {saved ? "已保存" : "保存胶皮"}
      </button>
    </form>
  );
}

function BoostingLogRow({ log }: { log: BoostingLog }) {
  const { updateBoostingLog, deleteBoostingLog } = useAppData();
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(log.date);
  const [layers, setLayers] = useState(String(log.layers));
  const [notes, setNotes] = useState(log.notes ?? "");
  const action = useAsyncAction();

  function startEditing() {
    setDate(log.date);
    setLayers(String(log.layers));
    setNotes(log.notes ?? "");
    action.setError(null);
    setEditing(true);
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void action.run(async () => {
      await updateBoostingLog(log.id, { date, layers: parseLayers(layers), notes: notes.trim() || null });
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <form onSubmit={handleSave} className="grid gap-3 rounded-md border border-court/30 bg-court/5 p-3" data-testid={`boost-log-form-${log.id}`}>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="日期" type="date" value={date} onChange={setDate} required testId={`boost-log-date-${log.id}`} />
          <TextField
            label="层数"
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            value={layers}
            onChange={setLayers}
            required
            testId={`boost-log-layers-${log.id}`}
          />
        </div>
        <TextField label="备注" value={notes} onChange={setNotes} testId={`boost-log-notes-${log.id}`} />
        <ErrorBanner message={action.error} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setEditing(false)} className={buttonClass.ghost}>
            取消
          </button>
          <button type="submit" disabled={action.pending} className={buttonClass.court} data-testid={`boost-log-save-${log.id}`}>
            <Check size={16} aria-hidden="true" />
            保存
          </button>
        </div>
      </form>
    );
  }

  const note = boostNote(log.notes);
  return (
    <div className="rounded-md bg-paper px-3 py-2 text-sm" data-testid={`boost-log-${log.id}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 font-bold text-ink">
            <span>第 {log.boostNumber} 次</span>
            <span>{shortDate(log.date)}</span>
          </div>
          <div className="mt-1 break-words text-xs font-medium text-ink/56">
            {log.layers} 层，距今 {daysBetween(log.date)} 天{note ? ` · ${note}` : ""}
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={startEditing}
            className={buttonClass.icon}
            aria-label={`编辑第 ${log.boostNumber} 次灌油`}
            title="编辑"
            data-testid={`boost-log-edit-${log.id}`}
          >
            <Pencil size={16} aria-hidden="true" />
          </button>
          <ConfirmButton
            onConfirm={() => void action.run(() => deleteBoostingLog(log.id))}
            ariaLabel={`删除第 ${log.boostNumber} 次灌油`}
            confirmLabel="删除"
            className={buttonClass.icon}
            armedClassName={buttonClass.armedPill}
            disabled={action.pending}
            testId={`boost-log-delete-${log.id}`}
          />
        </div>
      </div>
      {action.error ? (
        <div className="mt-2">
          <ErrorBanner message={action.error} />
        </div>
      ) : null}
    </div>
  );
}

/** Boosting history of one rubber (`logs` newest first) with an add form and inline edit / delete. */
function BoostingLogs({ rubber, logs, cycleDays }: { rubber: Rubber; logs: BoostingLog[]; cycleDays: number }) {
  const { addBoostingLog, updateRubber } = useAppData();
  const [date, setDate] = useState(todayISO);
  const [layers, setLayers] = useState("2");
  const [notes, setNotes] = useState("");
  const [expanded, setExpanded] = useState(false);
  const action = useAsyncAction();
  const toggle = useAsyncAction();
  const visibleLogs = expanded ? logs : logs.slice(0, VISIBLE_BOOSTING_LOGS);

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void action.run(async () => {
      await addBoostingLog({ rubberId: rubber.id, date, layers: parseLayers(layers), notes: notes.trim() || undefined });
      setNotes("");
    });
  }

  // Most rubbers are never boosted: keep the section to one line until boosting is switched on.
  if (!rubber.boosted && !logs.length) {
    return (
      <div className="mt-6 flex items-center justify-between gap-3 border-t border-ink/10 pt-4" data-testid={`boosting-off-${rubber.id}`}>
        <div className="min-w-0">
          <h3 className="text-sm font-black text-ink">灌油</h3>
          <p className="mt-0.5 text-xs font-medium text-ink/50">这张胶皮不灌油，不提醒复灌。</p>
          <ErrorBanner message={toggle.error} />
        </div>
        <button
          type="button"
          onClick={() => void toggle.run(() => updateRubber(rubber.id, { boosted: true }))}
          disabled={toggle.pending}
          className={buttonClass.secondary}
          data-testid={`enable-boosting-${rubber.id}`}
        >
          <Droplets size={16} aria-hidden="true" />
          开启灌油记录
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 border-t border-ink/10 pt-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-black text-ink">灌油记录</h3>
        <div className="flex items-center gap-1">
          <div className="inline-flex items-center gap-1 text-xs font-bold text-court">
            <Waves size={14} aria-hidden="true" />
            {logs.length} 次{rubber.boosted ? ` · 复灌周期 ${cycleDays} 天` : " · 不提醒复灌"}
          </div>
          {rubber.boosted && !logs.length ? (
            <button
              type="button"
              onClick={() => void toggle.run(() => updateRubber(rubber.id, { boosted: false }))}
              disabled={toggle.pending}
              className={buttonClass.ghost}
              title="这张胶皮不灌油"
              data-testid={`disable-boosting-${rubber.id}`}
            >
              不灌油
            </button>
          ) : null}
        </div>
      </div>
      <ErrorBanner message={toggle.error} />

      <form onSubmit={handleAdd} className="mt-4 grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <TextField label="日期" type="date" value={date} onChange={setDate} required testId={`new-boost-date-${rubber.id}`} />
          <TextField
            label="层数"
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            value={layers}
            onChange={setLayers}
            required
            testId={`new-boost-layers-${rubber.id}`}
          />
        </div>
        <TextAreaField label="备注" value={notes} onChange={setNotes} testId={`new-boost-notes-${rubber.id}`} />
        <ErrorBanner message={action.error} />
        <button type="submit" disabled={action.pending} className={buttonClass.court} data-testid={`new-boost-submit-${rubber.id}`}>
          <Plus size={18} aria-hidden="true" />
          添加第 {logs.length + 1} 次灌油
        </button>
      </form>

      <div className="mt-4 grid gap-2">
        {visibleLogs.length ? (
          visibleLogs.map((log) => <BoostingLogRow key={log.id} log={log} />)
        ) : (
          <p className="text-sm text-ink/52">暂无灌油记录。</p>
        )}
      </div>
      <ShowMoreButton
        expanded={expanded}
        total={logs.length}
        limit={VISIBLE_BOOSTING_LOGS}
        onToggle={() => setExpanded((value) => !value)}
        testId={`boost-logs-toggle-${rubber.id}`}
      />
    </div>
  );
}

function MountedRubberCard({
  side,
  rubber,
  sessions,
  logs,
  onReplace,
  onTakeOff,
}: {
  side: RubberSide;
  rubber: Rubber;
  sessions: PlaySession[];
  logs: BoostingLog[];
  onReplace: () => void;
  onTakeOff: () => void;
}) {
  const life = calculateRubberLife(rubber, sessions);
  const boosting = getBoostingSummary(rubber, logs);
  const mountedDate = getRubberMountedDate(rubber);

  return (
    <section className={cardClass} data-testid={`rubber-slot-${side}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-court">
              {rubberSideLabel[side]} · {rubberSideName[side]}
            </span>
            {boosting.needsReboost ? (
              <ReboostBadge daysSinceLastBoost={boosting.daysSinceLastBoost} cycleDays={boosting.cycleDays} />
            ) : null}
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-1.5">
            <h2 className="truncate text-lg font-black text-ink">{rubber.name}</h2>
            <RubberLabelPill label={rubber.label} />
          </div>
          <p className="mt-0.5 text-xs font-medium text-ink/55">{describeRubberSpecs(rubber)}</p>
        </div>
        <div className="shrink-0 text-right text-xs font-medium text-ink/55">
          <div>已用 {life.calendarDays} 天</div>
          {rubber.mountedAt && mountedDate ? <div>本拍 {formatDate(mountedDate)} 起</div> : null}
          {rubber.boosted ? boosting.lastDate ? <div>上次灌油 {formatDate(boosting.lastDate)}</div> : <div>未记录灌油</div> : null}
        </div>
      </div>

      <div className="mt-4">
        <LifeBar life={life} showDetails />
      </div>

      {boosting.needsReboost ? (
        <div className="mt-3">
          <Notice tone="warn">
            距上次灌油已 {boosting.daysSinceLastBoost} 天，超过 {boosting.cycleDays} 天的复灌周期，建议复灌。
          </Notice>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onReplace}
          className={buttonClass.secondary}
          title="换上另一张胶皮（当前这张退役或放回囤货）"
          data-testid={`replace-rubber-${side}`}
        >
          <ArrowRightLeft size={16} aria-hidden="true" />
          更换胶皮
        </button>
        <button
          type="button"
          onClick={onTakeOff}
          className={buttonClass.secondary}
          title="撕下：退役，或暂时放回囤货之后再用"
          data-testid={`retire-rubber-${side}`}
        >
          <PackageOpen size={16} aria-hidden="true" />
          撕下
        </button>
      </div>

      <RubberEditForm rubber={rubber} side={side} />
      <BoostingLogs rubber={rubber} logs={logs} cycleDays={boosting.cycleDays} />
    </section>
  );
}

function EmptySlotCard({ side, onMount }: { side: RubberSide; onMount: () => void }) {
  return (
    <section className="rounded-lg border border-dashed border-ink/20 bg-white/70 p-4" data-testid={`rubber-slot-${side}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-court">
            {rubberSideLabel[side]} · {rubberSideName[side]}
          </div>
          <h2 className="mt-1 text-base font-black text-ink/60">未贴胶皮</h2>
        </div>
        <button type="button" onClick={onMount} className={buttonClass.court} data-testid={`mount-slot-${side}`}>
          <Plus size={16} aria-hidden="true" />
          贴上胶皮
        </button>
      </div>
    </section>
  );
}

/** 「撕下」: the side becomes empty; the rubber is retired, or put back into the inventory to be used again. */
function TakeOffRubberModal({
  racket,
  side,
  rubber,
  onClose,
}: {
  racket: Racket;
  side: RubberSide;
  rubber: Rubber;
  onClose: () => void;
}) {
  const { retireRubber, stashRubber } = useAppData();
  const [date, setDate] = useState(todayISO);
  const [outgoing, setOutgoing] = useState<OutgoingRubberAction>("stash");
  const action = useAsyncAction();
  const stash = outgoing === "stash";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void action.run(async () => {
      if (stash) await stashRubber(rubber.id, date);
      else await retireRubber(rubber.id, date);
      onClose();
    });
  }

  return (
    <Modal
      title="撕下胶皮"
      description={`${racket.name} · ${rubberSideName[side]} · ${getRubberDisplayName(rubber)}`}
      onClose={onClose}
      testId="retire-rubber-modal"
    >
      <form onSubmit={handleSubmit} className="grid gap-4">
        <OutgoingRubberField rubber={rubber} value={outgoing} onChange={setOutgoing} date={date} testIdPrefix="take-off" />
        <TextField
          label="撕下日期"
          type="date"
          value={date}
          onChange={setDate}
          min={getRubberMountedDate(rubber)}
          required
          testId="retire-date"
        />
        <p className="text-xs font-medium leading-5 text-ink/50">撕下后这一面变为空位，之后可以随时贴上新胶皮或囤货里的胶皮。</p>
        <ErrorBanner message={action.error} />
        <button
          type="submit"
          disabled={action.pending}
          className={stash ? buttonClass.court : buttonClass.danger}
          data-testid="retire-submit"
        >
          {stash ? <PackagePlus size={18} aria-hidden="true" /> : <Archive size={18} aria-hidden="true" />}
          {action.pending ? "保存中…" : stash ? "撕下并放回囤货" : "撕下并退役"}
        </button>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

function SessionRow({ session }: { session: PlaySession }) {
  const { updatePlaySession, deletePlaySession } = useAppData();
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(session.date);
  const [duration, setDuration] = useState(String(session.durationMinutes));
  const [notes, setNotes] = useState(session.notes ?? "");
  const action = useAsyncAction();

  function startEditing() {
    setDate(session.date);
    setDuration(String(session.durationMinutes));
    setNotes(session.notes ?? "");
    action.setError(null);
    setEditing(true);
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void action.run(async () => {
      await updatePlaySession(session.id, { date, durationMinutes: parseMinutes(duration), notes: notes.trim() || null });
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <form onSubmit={handleSave} className="grid gap-3 rounded-md border border-court/30 bg-court/5 p-3" data-testid={`session-form-${session.id}`}>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="日期" type="date" value={date} onChange={setDate} required testId={`session-date-${session.id}`} />
          <TextField
            label="时长 · 分钟"
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            value={duration}
            onChange={setDuration}
            required
            testId={`session-duration-${session.id}`}
          />
        </div>
        <TextField label="备注" value={notes} onChange={setNotes} testId={`session-notes-${session.id}`} />
        <ErrorBanner message={action.error} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setEditing(false)} className={buttonClass.ghost}>
            取消
          </button>
          <button type="submit" disabled={action.pending} className={buttonClass.court} data-testid={`session-save-${session.id}`}>
            <Check size={16} aria-hidden="true" />
            保存
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="rounded-md bg-paper px-3 py-2 text-sm" data-testid={`session-${session.id}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <span className="font-bold text-ink">{shortDate(session.date)}</span>
            <span className="font-semibold text-ink/60">{session.durationMinutes} 分钟</span>
          </div>
          {session.notes ? <p className="mt-0.5 break-words text-xs text-ink/55">{session.notes}</p> : null}
        </div>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={startEditing}
            className={buttonClass.icon}
            aria-label={`编辑 ${shortDate(session.date)} 的打球记录`}
            title="编辑"
            data-testid={`session-edit-${session.id}`}
          >
            <Pencil size={16} aria-hidden="true" />
          </button>
          <ConfirmButton
            onConfirm={() => void action.run(() => deletePlaySession(session.id))}
            ariaLabel={`删除 ${shortDate(session.date)} 的打球记录`}
            confirmLabel="删除"
            className={buttonClass.icon}
            armedClassName={buttonClass.armedPill}
            disabled={action.pending}
            testId={`session-delete-${session.id}`}
          />
        </div>
      </div>
      {action.error ? (
        <div className="mt-2">
          <ErrorBanner message={action.error} />
        </div>
      ) : null}
    </div>
  );
}

function SessionsSection({ sessions }: { sessions: PlaySession[] }) {
  const [expanded, setExpanded] = useState(false);
  const visibleSessions = expanded ? sessions : sessions.slice(0, VISIBLE_SESSIONS);

  return (
    <section className={cardClass} data-testid="sessions-section">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-black text-ink">打球记录</h2>
        <span className="text-xs font-bold text-ink/50">{sessions.length} 场</span>
      </div>
      <div className="mt-3 grid gap-2">
        {visibleSessions.length ? (
          visibleSessions.map((session) => <SessionRow key={session.id} session={session} />)
        ) : (
          <p className="text-sm text-ink/52">暂无打球记录。</p>
        )}
      </div>
      <ShowMoreButton
        expanded={expanded}
        total={sessions.length}
        limit={VISIBLE_SESSIONS}
        onToggle={() => setExpanded((value) => !value)}
        testId="sessions-toggle"
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Retired rubbers archive
// ---------------------------------------------------------------------------

function RetiredRubberRow({
  racket,
  rubber,
  sessions,
  boostingLogs,
}: {
  racket: Racket;
  rubber: Rubber;
  sessions: PlaySession[];
  boostingLogs: BoostingLog[];
}) {
  const { updateRubber, deleteRubber, stashRubber } = useAppData();
  const action = useAsyncAction();
  const life = calculateRubberLife(rubber, sessions);
  const boosting = getBoostingSummary(rubber, boostingLogs);
  const slotFree = rubber.side ? !getRacketRubberId(racket, rubber.side) : false;
  const displayName = getRubberDisplayName(rubber);

  return (
    <article className="rounded-md border border-ink/10 bg-paper px-3 py-2.5" data-testid={`retired-rubber-${rubber.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-xs font-bold text-court">{rubber.side ? rubberSideLabel[rubber.side] : "—"}</span>
            <span className="truncate text-sm font-bold text-ink">{rubber.name}</span>
            <RubberLabelPill label={rubber.label} />
          </div>
          <p className="mt-0.5 text-xs font-medium text-ink/55">
            {rubber.installedAt ? formatFullDate(rubber.installedAt) : "未知"} → {rubber.removedAt ? formatFullDate(rubber.removedAt) : "未知"}
          </p>
          <p className="mt-0.5 text-xs font-medium text-ink/55">
            使用 {life.calendarDays} 天 · 打球 {formatHours(life.playMinutes)} h
            {rubber.boosted || boosting.count ? ` · 灌油 ${boosting.count} 次` : ""} · 寿命 {Math.round(life.usedPercent)}%
          </p>
        </div>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => void action.run(() => stashRubber(rubber.id))}
            disabled={action.pending}
            className={buttonClass.icon}
            aria-label={`把 ${displayName} 放回囤货，之后再用`}
            title="放回囤货（之后还要用）"
            data-testid={`stash-retired-rubber-${rubber.id}`}
          >
            <PackagePlus size={16} aria-hidden="true" />
          </button>
          {slotFree && rubber.side ? (
            <button
              type="button"
              onClick={() => void action.run(() => updateRubber(rubber.id, { removedAt: null }))}
              disabled={action.pending}
              className={buttonClass.icon}
              aria-label={`把 ${displayName} 恢复到${rubberSideName[rubber.side]}`}
              title="恢复到原位置"
              data-testid={`restore-rubber-${rubber.id}`}
            >
              <Undo2 size={16} aria-hidden="true" />
            </button>
          ) : null}
          <ConfirmButton
            onConfirm={() => void action.run(() => deleteRubber(rubber.id))}
            ariaLabel={`删除 ${displayName} 的档案`}
            confirmLabel="删除"
            className={buttonClass.icon}
            armedClassName={buttonClass.armedPill}
            disabled={action.pending}
            testId={`delete-retired-rubber-${rubber.id}`}
          />
        </div>
      </div>
      {action.error ? (
        <div className="mt-2">
          <ErrorBanner message={action.error} />
        </div>
      ) : null}
    </article>
  );
}

function RetiredArchive({
  racket,
  rubbers,
  sessions,
  boostingLogs,
}: {
  racket: Racket;
  rubbers: Rubber[];
  sessions: PlaySession[];
  boostingLogs: BoostingLog[];
}) {
  return (
    <section className={cardClass} data-testid="retired-archive">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-black text-ink">
          <History size={18} className="text-ink/50" aria-hidden="true" />
          历任退役胶皮档案
        </h2>
        <span className="text-xs font-bold text-ink/50">{rubbers.length} 张</span>
      </div>
      <div className="mt-3 grid gap-2">
        {rubbers.length ? (
          rubbers.map((rubber) => (
            <RetiredRubberRow key={rubber.id} racket={racket} rubber={rubber} sessions={sessions} boostingLogs={boostingLogs} />
          ))
        ) : (
          <p className="text-sm text-ink/50">还没有退役的胶皮。退役的胶皮会带着寿命和灌油记录归档在这里；暂时撕下、之后还要用的胶皮会放进囤货。</p>
        )}
      </div>
    </section>
  );
}

function DeleteRacketSection({ racket, onDeleted }: { racket: Racket; onDeleted: () => void }) {
  const { deleteRacket } = useAppData();
  const action = useAsyncAction();

  return (
    <section className="rounded-lg border border-spin/20 bg-white p-4 shadow-soft">
      <div className="flex items-start gap-3">
        <Trash2 size={20} className="mt-0.5 shrink-0 text-spin" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-black text-ink">删除球拍</h2>
          <p className="mt-1 text-sm text-ink/56">会同时删除这块球拍的胶皮（含退役档案）、灌油记录和打球记录。</p>
          {action.error ? (
            <div className="mt-3">
              <ErrorBanner message={action.error} />
            </div>
          ) : null}
          <ConfirmButton
            onConfirm={() =>
              void action.run(async () => {
                await deleteRacket(racket.id);
                onDeleted();
              })
            }
            label="删除这块球拍"
            confirmLabel="确认删除"
            icon={<Trash2 size={18} aria-hidden="true" />}
            className={`${buttonClass.dangerSoft} mt-4 w-full`}
            armedClassName={`${buttonClass.danger} mt-4 w-full`}
            disabled={action.pending}
            testId="delete-racket-button"
          />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function RacketDetail({ racketId, onBack, onAddSession, onDeleted, onOpenInventory }: RacketDetailProps) {
  const { data, isLoading } = useAppData();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const racket = data.rackets.find((item) => item.id === racketId);
  const sessions = useMemo(
    () =>
      data.playSessions
        .filter((session) => session.racketId === racketId)
        .sort((left, right) => right.date.localeCompare(left.date) || right.createdAt.localeCompare(left.createdAt)),
    [data.playSessions, racketId],
  );
  const retiredRubbers = useMemo(() => getRetiredRubbers(data, racketId), [data, racketId]);

  if (isLoading) {
    return <div className="px-4 py-10 text-sm text-ink/60">加载中...</div>;
  }

  if (!racket) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-4">
        <BackButton onClick={onBack} />
        <p className="mt-8 text-sm font-semibold text-ink/60">没有找到这块球拍。</p>
      </div>
    );
  }

  const status = getRacketStatus(racket);
  const totalMinutes = getRacketPlayMinutes(racket, sessions);
  const dialogRubber = dialog ? getMountedRubber(data, racket, dialog.side) : undefined;
  const closeDialog = () => setDialog(null);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-4 sm:px-6 lg:gap-6 lg:px-8 lg:py-8">
      <div className="flex items-center justify-between gap-3">
        <BackButton onClick={() => (status === "active" ? onBack() : onOpenInventory("blades"))} />
        <button
          type="button"
          onClick={() => onAddSession(racket.id)}
          className="tap-target inline-flex items-center gap-2 rounded-full bg-court px-4 text-sm font-bold text-white shadow-sm transition active:scale-95"
        >
          <Plus size={18} aria-hidden="true" />
          记录打球
        </button>
      </div>

      <header className="rounded-lg bg-ink px-4 py-5 text-white shadow-soft sm:px-6 lg:flex lg:items-center lg:justify-between lg:gap-8 lg:py-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 lg:justify-start lg:gap-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-limeglass/70">Racket</p>
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-black ${statusChipClass[status]}`} data-testid="racket-status-chip">
              {racketStatusLabel[status]}
            </span>
          </div>
          <h1 className="mt-2 break-words text-3xl font-black leading-tight">{racket.name}</h1>
          <p className="mt-2 text-sm font-medium text-white/65">{racket.blade}</p>
          <RacketSpecBadges racket={racket} tone="dark" className="mt-3" />
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2 lg:mt-0 lg:w-[400px] lg:shrink-0 lg:gap-3">
          <HeaderStat icon={<Clock3 size={14} aria-hidden="true" />} label="累计" value={`${Math.round(totalMinutes / 60)} h`} />
          <HeaderStat icon={<CalendarDays size={14} aria-hidden="true" />} label="场次" value={String(sessions.length)} />
          <HeaderStat icon={<History size={14} aria-hidden="true" />} label="历任胶皮" value={String(retiredRubbers.length)} />
        </div>
      </header>

      <RacketInfoForm racket={racket} />

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        {RUBBER_SIDES.map((side) => {
          const rubber = getMountedRubber(data, racket, side);
          return rubber ? (
            <MountedRubberCard
              key={`${side}:${rubber.id}`}
              side={side}
              rubber={rubber}
              sessions={data.playSessions}
              logs={getRubberBoostingLogs(data, rubber.id)}
              onReplace={() => setDialog({ type: "replace", side })}
              onTakeOff={() => setDialog({ type: "take-off", side })}
            />
          ) : (
            <EmptySlotCard key={`${side}:empty`} side={side} onMount={() => setDialog({ type: "replace", side })} />
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <SessionsSection sessions={sessions} />
        <RetiredArchive racket={racket} rubbers={retiredRubbers} sessions={data.playSessions} boostingLogs={data.boostingLogs} />
      </div>

      <DeleteRacketSection racket={racket} onDeleted={onDeleted} />

      {dialog?.type === "replace" ? <ReplaceRubberModal racket={racket} side={dialog.side} onClose={closeDialog} /> : null}
      {dialog?.type === "take-off" && dialogRubber ? (
        <TakeOffRubberModal racket={racket} side={dialog.side} rubber={dialogRubber} onClose={closeDialog} />
      ) : null}
    </div>
  );
}
