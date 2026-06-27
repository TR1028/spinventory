import { ArrowLeft, Check, Clock3 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/database";
import { todayISO } from "../utils/date";
import { createId } from "../utils/id";
import { sortRackets } from "../utils/rackets";

type AddSessionProps = {
  initialRacketId?: string;
  onBack: () => void;
  onSaved: () => void;
};

const quickDurations = [60, 90, 120, 150];

export function AddSession({ initialRacketId, onBack, onSaved }: AddSessionProps) {
  const rackets = useLiveQuery(
    async () => sortRackets(await db.rackets.toArray()),
    [],
  );
  const [racketId, setRacketId] = useState(initialRacketId ?? "");
  const [date, setDate] = useState(todayISO());
  const [durationMinutes, setDurationMinutes] = useState("90");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialRacketId) {
      setRacketId(initialRacketId);
      return;
    }

    if (!racketId && rackets?.[0]) {
      setRacketId(rackets[0].id);
    }
  }, [initialRacketId, racketId, rackets]);

  const selectedRacket = useMemo(
    () => rackets?.find((racket) => racket.id === racketId),
    [racketId, rackets],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const minutes = Number(durationMinutes);

    if (!racketId) {
      setError("请选择球拍");
      return;
    }

    if (!date) {
      setError("请选择日期");
      return;
    }

    if (!Number.isFinite(minutes) || minutes <= 0) {
      setError("请输入有效时长");
      return;
    }

    setIsSaving(true);
    setError("");

    await db.playSessions.add({
      id: createId("session"),
      racketId,
      date,
      durationMinutes: Math.round(minutes),
      createdAt: new Date().toISOString(),
    });

    setIsSaving(false);
    onSaved();
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-4 sm:px-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="tap-target inline-flex items-center justify-center rounded-full bg-white text-ink shadow-sm ring-1 ring-ink/10 transition active:scale-95"
          aria-label="返回"
          title="返回"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <div className="rounded-full bg-limeglass px-3 py-1 text-xs font-bold text-court">打球记录</div>
      </div>

      <header className="mt-6">
        <h1 className="text-3xl font-black tracking-normal text-ink">记录打球</h1>
        <p className="mt-2 text-sm font-medium text-ink/56">
          {selectedRacket ? selectedRacket.name : "选择本次使用的球拍"}
        </p>
      </header>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-1 flex-col gap-5">
        <label className="grid gap-2">
          <span className="text-sm font-bold text-ink">球拍</span>
          <select
            value={racketId}
            onChange={(event) => setRacketId(event.target.value)}
            className="tap-target w-full rounded-lg border border-ink/12 bg-white px-3 text-base font-semibold text-ink shadow-sm outline-none transition focus:border-court focus:ring-4 focus:ring-court/15"
          >
            {rackets?.map((racket) => (
              <option value={racket.id} key={racket.id}>
                {racket.name}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-bold text-ink">日期</span>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="tap-target w-full rounded-lg border border-ink/12 bg-white px-3 text-base font-semibold text-ink shadow-sm outline-none transition focus:border-court focus:ring-4 focus:ring-court/15"
          />
        </label>

        <div className="grid gap-2">
          <label htmlFor="durationMinutes" className="text-sm font-bold text-ink">
            时长
          </label>
          <div className="relative">
            <Clock3
              size={18}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/42"
              aria-hidden="true"
            />
            <input
              id="durationMinutes"
              inputMode="numeric"
              type="number"
              min="1"
              step="1"
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(event.target.value)}
              className="tap-target w-full rounded-lg border border-ink/12 bg-white px-10 text-base font-semibold text-ink shadow-sm outline-none transition focus:border-court focus:ring-4 focus:ring-court/15"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-ink/46">
              min
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {quickDurations.map((minutes) => (
              <button
                type="button"
                key={minutes}
                onClick={() => setDurationMinutes(String(minutes))}
                className={`tap-target rounded-lg text-sm font-bold transition active:scale-95 ${
                  durationMinutes === String(minutes)
                    ? "bg-court text-white"
                    : "bg-white text-ink ring-1 ring-ink/10"
                }`}
              >
                {minutes}
              </button>
            ))}
          </div>
        </div>

        {error ? <div className="rounded-lg bg-spin/10 px-3 py-2 text-sm font-semibold text-spin">{error}</div> : null}

        <div className="mt-auto pb-3">
          <button
            type="submit"
            disabled={isSaving || !rackets?.length}
            className="tap-target inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 text-base font-black text-white shadow-soft transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-ink/40"
          >
            <Check size={20} aria-hidden="true" />
            {isSaving ? "保存中" : "保存记录"}
          </button>
        </div>
      </form>
    </div>
  );
}
