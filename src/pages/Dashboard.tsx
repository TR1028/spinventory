import { Plus, ShieldCheck } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { RacketCard } from "../components/RacketCard";
import { db } from "../db/database";
import type { BoostingLog, PlaySession, Racket, Rubber } from "../db/schema";
import { isWithinLastDays } from "../utils/date";

type DashboardProps = {
  onAddSession: (racketId?: string) => void;
};

type DashboardData = {
  rackets: Racket[];
  rubbers: Rubber[];
  sessions: PlaySession[];
  boostingLogs: BoostingLog[];
};

export function Dashboard({ onAddSession }: DashboardProps) {
  const data = useLiveQuery<DashboardData>(async () => {
    const [rackets, rubbers, sessions, boostingLogs] = await Promise.all([
      db.rackets.toArray(),
      db.rubbers.toArray(),
      db.playSessions.toArray(),
      db.boostingLogs.toArray(),
    ]);

    return {
      rackets: rackets.sort((left, right) => {
        const leftOrder = left.sortOrder ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.sortOrder ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder || left.name.localeCompare(right.name);
      }),
      rubbers,
      sessions,
      boostingLogs,
    };
  });

  if (!data) {
    return <div className="px-4 py-10 text-sm text-ink/60">加载中...</div>;
  }

  const weekMinutes = data.sessions
    .filter((session) => isWithinLastDays(session.date, 7))
    .reduce((total, session) => total + session.durationMinutes, 0);
  const rubberById = new Map(data.rubbers.map((rubber) => [rubber.id, rubber]));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-4 sm:px-6">
      <section className="rounded-lg bg-ink px-4 py-5 text-white shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-limeglass/70">
              Racket Life
            </p>
            <h1 className="mt-2 text-2xl font-black leading-tight">球拍与胶皮寿命</h1>
          </div>
          <div className="rounded-full bg-white/10 p-3">
            <ShieldCheck size={24} aria-hidden="true" />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md bg-white/10 px-2 py-3">
            <div className="text-xl font-black">{data.rackets.length}</div>
            <div className="mt-1 text-[11px] font-medium text-white/62">球拍</div>
          </div>
          <div className="rounded-md bg-white/10 px-2 py-3">
            <div className="text-xl font-black">{data.rubbers.length}</div>
            <div className="mt-1 text-[11px] font-medium text-white/62">胶皮</div>
          </div>
          <div className="rounded-md bg-white/10 px-2 py-3">
            <div className="text-xl font-black">{weekMinutes}</div>
            <div className="mt-1 text-[11px] font-medium text-white/62">分钟 / 近 7 天</div>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-ink">当前球拍</h2>
        <button
          type="button"
          onClick={() => onAddSession()}
          className="tap-target inline-flex items-center gap-2 rounded-full bg-court px-4 text-sm font-bold text-white shadow-sm transition active:scale-95"
        >
          <Plus size={18} aria-hidden="true" />
          记录打球
        </button>
      </div>

      <div className="grid gap-4">
        {data.rackets.map((racket) => (
          <RacketCard
            key={racket.id}
            racket={racket}
            forehand={rubberById.get(racket.forehandRubberId)}
            backhand={rubberById.get(racket.backhandRubberId)}
            sessions={data.sessions}
            boostingLogs={data.boostingLogs}
            onAddSession={onAddSession}
          />
        ))}
      </div>
    </div>
  );
}
