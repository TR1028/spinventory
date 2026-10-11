import type { PlaySession, Racket } from "../db/schema";

export function sortRackets(rackets: Racket[]) {
  return [...rackets].sort((left, right) => {
    const leftOrder = left.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.sortOrder ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || left.name.localeCompare(right.name);
  });
}

/** Total play time on a racket: the minutes recorded before it was added plus its logged sessions. */
export function getRacketPlayMinutes(racket: Pick<Racket, "id" | "initialPlayMinutes">, sessions: readonly PlaySession[]) {
  const initial = Math.max(0, Math.round(racket.initialPlayMinutes ?? 0));
  return sessions.reduce((total, session) => (session.racketId === racket.id ? total + session.durationMinutes : total), initial);
}
