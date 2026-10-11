/**
 * Local Mode persistence (IndexedDB via Dexie).
 *
 * Every mutation reads the current data, runs a shared planner from `./domain` and writes the
 * resulting delta inside one read-write transaction, so multi-record changes (replacing a rubber,
 * deleting a racket with its history, renumbering boosts) are applied atomically.
 */
import { db } from "./database";
import type { DomainResult } from "./domain";
import type { AppDataDelta, AppSnapshot } from "./schema";

/** Reads all four entity tables (also the `useLiveQuery` querier of Local Mode). */
export async function readLocalSnapshot(): Promise<AppSnapshot> {
  const [rackets, rubbers, boostingLogs, playSessions] = await Promise.all([
    db.rackets.toArray(),
    db.rubbers.toArray(),
    db.boostingLogs.toArray(),
    db.playSessions.toArray(),
  ]);
  return { rackets, rubbers, boostingLogs, playSessions };
}

async function writeDelta(delta: AppDataDelta) {
  await Promise.all([
    db.rackets.bulkDelete(delta.deletes.rackets),
    db.rubbers.bulkDelete(delta.deletes.rubbers),
    db.boostingLogs.bulkDelete(delta.deletes.boostingLogs),
    db.playSessions.bulkDelete(delta.deletes.playSessions),
  ]);
  await Promise.all([
    db.rackets.bulkPut(delta.upserts.rackets),
    db.rubbers.bulkPut(delta.upserts.rubbers),
    db.boostingLogs.bulkPut(delta.upserts.boostingLogs),
    db.playSessions.bulkPut(delta.upserts.playSessions),
  ]);
}

/** Runs `plan` against the current local data and applies its delta in one transaction. */
export function runLocalMutation<T extends DomainResult>(plan: (snapshot: AppSnapshot) => T): Promise<T> {
  return db.transaction("rw", [db.rackets, db.rubbers, db.boostingLogs, db.playSessions], async () => {
    const result = plan(await readLocalSnapshot());
    await writeDelta(result.delta);
    return result;
  });
}

export async function getLocalMeta(key: string) {
  return (await db.meta.get(key))?.value;
}

export async function setLocalMeta(key: string, value: string) {
  await db.meta.put({ key, value });
}
