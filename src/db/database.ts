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

    // v2: racket status (active / inventory / retired), optional racket <-> rubber links for the
    // inventory, custom life parameters and notes. Only `rackets.status` needs a new index; the
    // other new fields are plain optional properties.
    this.version(2)
      .stores({
        rackets: "&id, name, status, createdAt",
        rubbers: "&id, racketId, [racketId+side], installedAt, removedAt",
        boostingLogs: "&id, rubberId, date, boostNumber",
        playSessions: "&id, racketId, date, [racketId+date]",
        meta: "&key",
      })
      .upgrade((transaction) =>
        transaction
          .table<Racket, string>("rackets")
          .toCollection()
          .modify((racket) => {
            if (!racket.status) racket.status = "active";
          }),
      );

    // v3: racket grip type / weights / blade start date / pre-recorded play time, and rubber sheet
    // weight / pre-recorded play time / mount date (used sheets). All plain optional properties, so
    // the stores are unchanged and existing records need no upgrade.
    this.version(3).stores({
      rackets: "&id, name, status, createdAt",
      rubbers: "&id, racketId, [racketId+side], installedAt, removedAt",
      boostingLogs: "&id, rubberId, date, boostNumber",
      playSessions: "&id, racketId, date, [racketId+date]",
      meta: "&key",
    });
  }
}

export const db = new RacketLifeDatabase();
