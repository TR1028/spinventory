import Dexie, { type Table } from "dexie";
import type { BoostingLog, MetaRecord, PlaySession, Racket, Rubber } from "./schema";

export class RacketLifeDatabase extends Dexie {
  rackets!: Table<Racket, string>;
  rubbers!: Table<Rubber, string>;
  boostingLogs!: Table<BoostingLog, string>;
  playSessions!: Table<PlaySession, string>;
  meta!: Table<MetaRecord, string>;

  constructor() {
    super("racket-life-db");

    this.version(1).stores({
      rackets: "&id, name, createdAt",
      rubbers: "&id, racketId, [racketId+side], installedAt, removedAt",
      boostingLogs: "&id, rubberId, date, boostNumber",
      playSessions: "&id, racketId, date, [racketId+date]",
      meta: "&key",
    });
  }
}

export const db = new RacketLifeDatabase();
