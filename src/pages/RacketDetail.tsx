import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock3,
  Plus,
  Save,
  Trash2,
  Waves,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/database";
import type { BoostingLog, PlaySession, Racket, Rubber } from "../db/schema";
import { rubberSideLabel, type RubberSide } from "../db/schema";
import { daysBetween, formatDate, todayISO } from "../utils/date";
import { createId } from "../utils/id";
import { calculateRubberLife, getBoostingSummary } from "../utils/life";
import { LifeBar } from "../components/LifeBar";

type RacketDetailProps = {
  racketId: string;
  onBack: () => void;
  onAddSession: (racketId: string) => void;
  onDeleted: () => void;
};

type RacketDetailData = {
  racket?: Racket;
  rubbers: Rubber[];
  sessions: PlaySession[];
  boostingLogs: BoostingLog[];
};

type RubberFormState = {
  name: string;
  hardness: string;
  thicknessMm: string;
  installedAt: string;
  boosted: boolean;
};

const emptyRubberForm: RubberFormState = {
  name: "",
  hardness: "",
  thicknessMm: "",
  installedAt: todayISO(),
  boosted: false,
};

function toRubberForm(rubber?: Rubber): RubberFormState {
  if (!rubber) return emptyRubberForm;

  return {
    name: rubber.name,
    hardness: rubber.hardness ?? "",
    thicknessMm: rubber.thicknessMm ? String(rubber.thicknessMm) : "",
    installedAt: rubber.installedAt,
    boosted: rubber.boosted,
  };
}

function parseThickness(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function FieldLabel({ children }: { children: string }) {
  return <span className="text-sm font-bold text-ink">{children}</span>;
}

function TextInput({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "date" | "number";
  inputMode?: "decimal" | "numeric";
}) {
  return (
    <label className="grid gap-2">
      <FieldLabel>{label}</FieldLabel>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="tap-target w-full rounded-lg border border-ink/12 bg-white px-3 text-base font-semibold text-ink shadow-sm outline-none transition focus:border-court focus:ring-4 focus:ring-court/15"
      />
    </label>
  );
}

function RubberEditor({
  rubber,
  side,
  sessions,
  boostingLogs,
}: {
  rubber?: Rubber;
  side: RubberSide;
  sessions: PlaySession[];
  boostingLogs: BoostingLog[];
}) {
  const [form, setForm] = useState<RubberFormState>(() => toRubberForm(rubber));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm(toRubberForm(rubber));
    setSaved(false);
  }, [rubber]);

  if (!rubber) {
    return (
      <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
        <h2 className="text-base font-black text-ink">{rubberSideLabel[side]} 当前胶皮</h2>
        <p className="mt-2 text-sm text-ink/56">暂无胶皮数据。</p>
      </section>
    );
  }

  const currentRubber = rubber;
  const life = calculateRubberLife(currentRubber, sessions);
  const boosting = getBoostingSummary(currentRubber, boostingLogs);
  const rubberLogs = boostingLogs
    .filter((log) => log.rubberId === currentRubber.id)
    .sort((left, right) => right.date.localeCompare(left.date));

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await db.rubbers.update(currentRubber.id, {
      name: form.name.trim(),
      hardness: form.hardness.trim() || undefined,
      thicknessMm: parseThickness(form.thicknessMm),
      installedAt: form.installedAt,
      boosted: form.boosted,
    });
    setSaved(true);
  }

  return (
    <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-court">{rubberSideLabel[side]}</div>
          <h2 className="mt-1 text-base font-black text-ink">当前胶皮</h2>
        </div>
        <div className="text-right text-xs font-medium text-ink/55">
          <div>已用 {life.calendarDays} 天</div>
          {boosting.lastDate ? <div>上次灌油 {formatDate(boosting.lastDate)}</div> : <div>未记录灌油</div>}
        </div>
      </div>

      <div className="mt-4">
        <LifeBar life={life} />
      </div>

      <form onSubmit={handleSave} className="mt-5 grid gap-4">
        <TextInput label="胶皮名称" value={form.name} onChange={(name) => setForm((current) => ({ ...current, name }))} />
        <div className="grid grid-cols-2 gap-3">
          <TextInput
            label="硬度"
            value={form.hardness}
            onChange={(hardness) => setForm((current) => ({ ...current, hardness }))}
          />
          <TextInput
            label="厚度 mm"
            type="number"
            inputMode="decimal"
            value={form.thicknessMm}
            onChange={(thicknessMm) => setForm((current) => ({ ...current, thicknessMm }))}
          />
        </div>
        <TextInput
          label="安装日期"
          type="date"
          value={form.installedAt}
          onChange={(installedAt) => setForm((current) => ({ ...current, installedAt }))}
        />
        <label className="flex min-h-11 items-center justify-between gap-4 rounded-lg border border-ink/10 bg-paper px-3">
          <span className="text-sm font-bold text-ink">已灌油</span>
          <input
            type="checkbox"
            checked={form.boosted}
            onChange={(event) => setForm((current) => ({ ...current, boosted: event.target.checked }))}
            className="h-5 w-5 accent-court"
          />
        </label>
        <button
          data-testid={`add-boost-${rubber.id}`}
          type="submit"
          className="tap-target inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-black text-white shadow-sm transition active:scale-[0.99]"
        >
          <Save size={18} aria-hidden="true" />
          {saved ? "已保存" : "保存胶皮"}
        </button>
      </form>

      <BoostingEditor rubber={currentRubber} logs={rubberLogs} />
    </section>
  );
}

function BoostingEditor({ rubber, logs }: { rubber: Rubber; logs: BoostingLog[] }) {
  const [date, setDate] = useState(todayISO());
  const [layers, setLayers] = useState("2");
  const [notes, setNotes] = useState("");
  const nextBoostNumber = (logs[0]?.boostNumber ?? logs.length) + 1;

  async function handleAddBoosting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedLayers = Number(layers);

    await db.transaction("rw", db.boostingLogs, db.rubbers, async () => {
      await db.boostingLogs.add({
        id: createId("boost"),
        rubberId: rubber.id,
        date,
        boostNumber: nextBoostNumber,
        layers: Number.isFinite(parsedLayers) && parsedLayers > 0 ? Math.round(parsedLayers) : 1,
        notes: notes.trim() || undefined,
        createdAt: new Date().toISOString(),
      });
      await db.rubbers.update(rubber.id, { boosted: true });
    });

    setNotes("");
  }

  return (
    <div className="mt-6 border-t border-ink/8 pt-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-black text-ink">灌油记录</h3>
        <div className="inline-flex items-center gap-1 text-xs font-bold text-court">
          <Waves size={14} aria-hidden="true" />
          {logs.length} 次
        </div>
      </div>

      <form onSubmit={handleAddBoosting} className="mt-4 grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="日期" type="date" value={date} onChange={setDate} />
          <TextInput label="层数" type="number" inputMode="numeric" value={layers} onChange={setLayers} />
        </div>
        <label className="grid gap-2">
          <FieldLabel>备注</FieldLabel>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            className="w-full resize-none rounded-lg border border-ink/12 bg-white px-3 py-3 text-base font-medium text-ink shadow-sm outline-none transition focus:border-court focus:ring-4 focus:ring-court/15"
          />
        </label>
        <button
          type="submit"
          className="tap-target inline-flex items-center justify-center gap-2 rounded-lg bg-court px-4 text-sm font-black text-white shadow-sm transition active:scale-[0.99]"
        >
          <Plus size={18} aria-hidden="true" />
          添加第 {nextBoostNumber} 次灌油
        </button>
      </form>

      <div className="mt-4 grid gap-2">
        {logs.length ? (
          logs.slice(0, 4).map((log) => (
            <div key={log.id} className="rounded-md bg-paper px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-3 font-bold text-ink">
                <span>第 {log.boostNumber} 次</span>
                <span>{formatDate(log.date)}</span>
              </div>
              <div className="mt-1 text-xs font-medium text-ink/56">
                {log.layers} 层，距今 {daysBetween(log.date)} 天{log.notes ? ` · ${log.notes}` : ""}
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-ink/52">暂无灌油记录。</p>
        )}
      </div>
    </div>
  );
}

export function RacketDetail({ racketId, onBack, onAddSession, onDeleted }: RacketDetailProps) {
  const data = useLiveQuery<RacketDetailData>(
    async () => {
      const [racket, rubbers, sessions, boostingLogs] = await Promise.all([
        db.rackets.get(racketId),
        db.rubbers.where("racketId").equals(racketId).toArray(),
        db.playSessions.where("racketId").equals(racketId).reverse().sortBy("date"),
        db.boostingLogs.toArray(),
      ]);

      return { racket, rubbers, sessions, boostingLogs };
    },
    [racketId],
  );

  const [name, setName] = useState("");
  const [blade, setBlade] = useState("");
  const [saved, setSaved] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);

  useEffect(() => {
    if (!data?.racket) return;
    setName(data.racket.name);
    setBlade(data.racket.blade);
    setSaved(false);
  }, [data?.racket]);

  const rubbersBySide = useMemo(() => {
    const map = new Map<RubberSide, Rubber>();
    data?.rubbers.forEach((rubber) => map.set(rubber.side, rubber));
    return map;
  }, [data?.rubbers]);

  if (!data) {
    return <div className="px-4 py-10 text-sm text-ink/60">加载中...</div>;
  }

  if (!data.racket) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-4">
        <button
          type="button"
          onClick={onBack}
          className="tap-target inline-flex items-center justify-center rounded-full bg-white text-ink shadow-sm ring-1 ring-ink/10"
          aria-label="返回"
          title="返回"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <p className="mt-8 text-sm font-semibold text-ink/60">没有找到这块球拍。</p>
      </div>
    );
  }

  const racket = data.racket;
  const totalMinutes = data.sessions.reduce((total, session) => total + session.durationMinutes, 0);
  const recentSessions = [...data.sessions].sort((left, right) => right.date.localeCompare(left.date)).slice(0, 5);

  async function handleSaveRacket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await db.rackets.update(racket.id, {
      name: name.trim(),
      blade: blade.trim(),
    });
    setSaved(true);
  }

  async function handleDelete() {
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }

    await db.transaction("rw", db.rackets, db.rubbers, db.playSessions, db.boostingLogs, async () => {
      const rubbers = await db.rubbers.where("racketId").equals(racket.id).toArray();
      const rubberIds = rubbers.map((rubber) => rubber.id);
      if (rubberIds.length) {
        await db.boostingLogs.where("rubberId").anyOf(rubberIds).delete();
      }
      await db.rubbers.where("racketId").equals(racket.id).delete();
      await db.playSessions.where("racketId").equals(racket.id).delete();
      await db.rackets.delete(racket.id);
    });

    onDeleted();
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-4 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="tap-target inline-flex items-center justify-center rounded-full bg-white text-ink shadow-sm ring-1 ring-ink/10 transition active:scale-95"
          aria-label="返回"
          title="返回"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onAddSession(racket.id)}
          className="tap-target inline-flex items-center gap-2 rounded-full bg-court px-4 text-sm font-bold text-white shadow-sm transition active:scale-95"
        >
          <Plus size={18} aria-hidden="true" />
          记录打球
        </button>
      </div>

      <header className="rounded-lg bg-ink px-4 py-5 text-white shadow-soft">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-limeglass/70">Racket</p>
        <h1 className="mt-2 text-3xl font-black leading-tight">{racket.name}</h1>
        <p className="mt-2 text-sm font-medium text-white/64">{racket.blade}</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <div className="rounded-md bg-white/10 px-3 py-3">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-white/62">
              <Clock3 size={14} aria-hidden="true" />
              累计
            </div>
            <div className="mt-1 text-xl font-black">{Math.round(totalMinutes / 60)} h</div>
          </div>
          <div className="rounded-md bg-white/10 px-3 py-3">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-white/62">
              <CalendarDays size={14} aria-hidden="true" />
              场次
            </div>
            <div className="mt-1 text-xl font-black">{data.sessions.length}</div>
          </div>
        </div>
      </header>

      <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
        <h2 className="text-base font-black text-ink">球拍信息</h2>
        <form onSubmit={handleSaveRacket} className="mt-4 grid gap-4">
          <TextInput label="球拍名" value={name} onChange={setName} />
          <TextInput label="底板" value={blade} onChange={setBlade} />
          <button
            type="submit"
            className="tap-target inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-black text-white shadow-sm transition active:scale-[0.99]"
          >
            <Check size={18} aria-hidden="true" />
            {saved ? "已保存" : "保存球拍"}
          </button>
        </form>
      </section>

      <RubberEditor
        side="forehand"
        rubber={rubbersBySide.get("forehand")}
        sessions={data.sessions}
        boostingLogs={data.boostingLogs}
      />
      <RubberEditor
        side="backhand"
        rubber={rubbersBySide.get("backhand")}
        sessions={data.sessions}
        boostingLogs={data.boostingLogs}
      />

      <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
        <h2 className="text-base font-black text-ink">最近打球</h2>
        <div className="mt-3 grid gap-2">
          {recentSessions.length ? (
            recentSessions.map((session) => (
              <div key={session.id} className="flex items-center justify-between rounded-md bg-paper px-3 py-2 text-sm">
                <span className="font-bold text-ink">{formatDate(session.date)}</span>
                <span className="font-semibold text-ink/60">{session.durationMinutes} 分钟</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-ink/52">暂无打球记录。</p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-spin/20 bg-white p-4 shadow-soft">
        <div className="flex items-start gap-3">
          <Trash2 size={20} className="mt-0.5 shrink-0 text-spin" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-black text-ink">删除球拍</h2>
            <p className="mt-1 text-sm text-ink/56">会同时删除这块球拍的胶皮、灌油记录和打球记录。</p>
            <button
              type="button"
              onClick={handleDelete}
              className={`tap-target mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-black shadow-sm transition active:scale-[0.99] ${
                deleteArmed ? "bg-spin text-white" : "bg-spin/10 text-spin"
              }`}
            >
              <Trash2 size={18} aria-hidden="true" />
              {deleteArmed ? "确认删除" : "删除这块球拍"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
