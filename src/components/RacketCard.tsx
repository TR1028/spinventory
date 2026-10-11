import { CalendarDays, Clock3, Plus, Waves } from "lucide-react";
import type { KeyboardEvent, MouseEvent } from "react";
import type { BoostingLog, PlaySession, Racket, Rubber, RubberSide } from "../db/schema";
import { rubberSideLabel } from "../db/schema";
import { formatDate, isWithinLastDays } from "../utils/date";
import { calculateRubberLife, getBoostingSummary } from "../utils/life";
import { getRacketPlayMinutes } from "../utils/rackets";
import { LifeBar } from "./LifeBar";
import { RacketSpecBadges } from "./RacketSpecs";
import { ReboostBadge } from "./ui";

type RacketCardProps = {
  racket: Racket;
  forehand?: Rubber;
  backhand?: Rubber;
  sessions: PlaySession[];
  boostingLogs: BoostingLog[];
  onAddSession: (racketId: string) => void;
  onOpenRacket: (racketId: string) => void;
};

function RubberRow({
  side,
  rubber,
  sessions,
  boostingLogs,
}: {
  side: RubberSide;
  rubber?: Rubber;
  sessions: PlaySession[];
  boostingLogs: BoostingLog[];
}) {
  if (!rubber) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-ink/15 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-court">{rubberSideLabel[side]}</span>
        <span className="text-xs font-semibold text-ink/45">未贴胶皮</span>
      </div>
    );
  }

  const life = calculateRubberLife(rubber, sessions);
  const boosting = getBoostingSummary(rubber, boostingLogs);

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-court">{rubberSideLabel[side]}</span>
            {boosting.needsReboost ? (
              <ReboostBadge daysSinceLastBoost={boosting.daysSinceLastBoost} cycleDays={boosting.cycleDays} />
            ) : null}
          </div>
          <div className="truncate text-sm font-semibold text-ink">
            {rubber.name}
            {rubber.label ? <span className="font-bold text-court"> · {rubber.label}</span> : null}
          </div>
        </div>
        <div className="shrink-0 text-right text-xs text-ink/55">
          <div>已用 {life.calendarDays} 天</div>
          {rubber.boosted ? (
            <div className={`mt-1 inline-flex items-center gap-1 ${boosting.needsReboost ? "text-amber-600" : "text-court"}`}>
              <Waves size={13} aria-hidden="true" />
              <span>
                {boosting.count} 次
                {boosting.daysSinceLastBoost !== undefined ? ` / ${boosting.daysSinceLastBoost} 天` : ""}
              </span>
            </div>
          ) : null}
        </div>
      </div>
      <LifeBar life={life} />
    </div>
  );
}

export function RacketCard({
  racket,
  forehand,
  backhand,
  sessions,
  boostingLogs,
  onAddSession,
  onOpenRacket,
}: RacketCardProps) {
  const racketSessions = sessions
    .filter((session) => session.racketId === racket.id)
    .sort((left, right) => right.date.localeCompare(left.date));
  // Includes the blade's play time from before it was recorded in the app.
  const totalMinutes = getRacketPlayMinutes(racket, racketSessions);
  const weekMinutes = racketSessions
    .filter((session) => isWithinLastDays(session.date, 7))
    .reduce((total, session) => total + session.durationMinutes, 0);
  const latestSession = racketSessions[0];

  function handleOpenKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenRacket(racket.id);
    }
  }

  function handleAddSession(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onAddSession(racket.id);
  }

  return (
    <article
      className="cursor-pointer rounded-lg border border-ink/10 bg-white p-4 shadow-soft transition active:scale-[0.99]"
      role="button"
      tabIndex={0}
      onClick={() => onOpenRacket(racket.id)}
      onKeyDown={handleOpenKeyDown}
      aria-label={`管理 ${racket.name}`}
      data-testid={`racket-card-${racket.id}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-ink">{racket.name}</h2>
          <p className="mt-1 truncate text-sm text-ink/56">{racket.blade}</p>
          <RacketSpecBadges racket={racket} className="mt-2" />
        </div>
        <button
          type="button"
          onClick={handleAddSession}
          className="tap-target inline-flex shrink-0 items-center justify-center rounded-full bg-ink text-white shadow-sm transition active:scale-95"
          aria-label={`${racket.name} 记录打球`}
          title="记录打球"
        >
          <Plus size={20} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 border-y border-ink/8 py-3 text-sm">
        <div className="flex items-center gap-2 text-ink/68" data-testid={`racket-card-total-${racket.id}`}>
          <Clock3 size={16} aria-hidden="true" />
          <span>累计 {Math.round(totalMinutes / 60)} h</span>
        </div>
        <div className="flex items-center justify-end gap-2 text-ink/68">
          <CalendarDays size={16} aria-hidden="true" />
          <span>近 7 天 {weekMinutes} 分钟</span>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {/* All sessions: a rubber also carries play from earlier stints on other rackets. */}
        <RubberRow side="forehand" rubber={forehand} sessions={sessions} boostingLogs={boostingLogs} />
        <RubberRow side="backhand" rubber={backhand} sessions={sessions} boostingLogs={boostingLogs} />
      </div>

      <div className="mt-4 text-xs font-medium text-ink/50">
        {latestSession ? `最近 ${formatDate(latestSession.date)} - ${latestSession.durationMinutes} 分钟` : "暂无打球记录"}
      </div>
    </article>
  );
}
