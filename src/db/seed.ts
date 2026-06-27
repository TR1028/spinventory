import { db } from "./database";
import type { BoostingLog, Racket, Rubber } from "./schema";

const createdAt = "2026-06-27T00:00:00.000Z";

const seedRackets: Racket[] = [
  {
    id: "racket-harimoto-innerforce-alc",
    name: "Harimoto Innerforce ALC",
    blade: "Butterfly Harimoto Innerforce ALC",
    forehandRubberId: "rubber-harimoto-fh",
    backhandRubberId: "rubber-harimoto-bh",
    sortOrder: 1,
    createdAt,
  },
  {
    id: "racket-hurricane-long-5",
    name: "Hurricane Long 5",
    blade: "DHS Hurricane Long 5",
    forehandRubberId: "rubber-hl5-fh",
    backhandRubberId: "rubber-hl5-bh",
    sortOrder: 2,
    createdAt,
  },
  {
    id: "racket-cybershape-carbon",
    name: "Cybershape Carbon",
    blade: "Stiga Cybershape Carbon",
    forehandRubberId: "rubber-cybershape-fh",
    backhandRubberId: "rubber-cybershape-bh",
    sortOrder: 3,
    createdAt,
  },
];

const seedRubbers: Rubber[] = [
  {
    id: "rubber-harimoto-fh",
    racketId: "racket-harimoto-innerforce-alc",
    side: "forehand",
    name: "H3 Provincial Blue 41 2.2",
    hardness: "41",
    thicknessMm: 2.2,
    installedAt: "2026-04-07",
    boosted: true,
    createdAt,
  },
  {
    id: "rubber-harimoto-bh",
    racketId: "racket-harimoto-innerforce-alc",
    side: "backhand",
    name: "T05 2.1",
    thicknessMm: 2.1,
    installedAt: "2026-04-07",
    boosted: false,
    createdAt,
  },
  {
    id: "rubber-hl5-fh",
    racketId: "racket-hurricane-long-5",
    side: "forehand",
    name: "H3 National Blue 40 2.2",
    hardness: "40",
    thicknessMm: 2.2,
    installedAt: "2026-05-22",
    boosted: true,
    createdAt,
  },
  {
    id: "rubber-hl5-bh",
    racketId: "racket-hurricane-long-5",
    side: "backhand",
    name: "H8-80 38 2.1",
    hardness: "38",
    thicknessMm: 2.1,
    installedAt: "2026-05-22",
    boosted: false,
    createdAt,
  },
  {
    id: "rubber-cybershape-fh",
    racketId: "racket-cybershape-carbon",
    side: "forehand",
    name: "H3 Provincial Blue 40 2.2",
    hardness: "40",
    thicknessMm: 2.2,
    installedAt: "2026-06-05",
    boosted: true,
    createdAt,
  },
  {
    id: "rubber-cybershape-bh",
    racketId: "racket-cybershape-carbon",
    side: "backhand",
    name: "H8-80 37 2.1",
    hardness: "37",
    thicknessMm: 2.1,
    installedAt: "2026-06-05",
    boosted: false,
    createdAt,
  },
];

const seedBoostingLogs: BoostingLog[] = [
  {
    id: "boost-harimoto-fh-2026-04-07",
    rubberId: "rubber-harimoto-fh",
    date: "2026-04-07",
    boostNumber: 1,
    layers: 2,
    notes: "Initial boost",
    createdAt,
  },
  {
    id: "boost-hl5-fh-2026-05-22",
    rubberId: "rubber-hl5-fh",
    date: "2026-05-22",
    boostNumber: 1,
    layers: 2,
    notes: "Initial boost",
    createdAt,
  },
  {
    id: "boost-cybershape-fh-2026-06-05",
    rubberId: "rubber-cybershape-fh",
    date: "2026-06-05",
    boostNumber: 1,
    layers: 2,
    notes: "Initial boost",
    createdAt,
  },
];

export async function ensureSeedData() {
  const seeded = await db.meta.get("seed:v1");
  if (seeded?.value === "done") {
    await ensureSeedSortOrder();
    return;
  }

  await db.transaction(
    "rw",
    db.rackets,
    db.rubbers,
    db.boostingLogs,
    db.playSessions,
    db.meta,
    async () => {
      await db.rackets.bulkPut(seedRackets);
      await db.rubbers.bulkPut(seedRubbers);
      await db.boostingLogs.bulkPut(seedBoostingLogs);
      await db.meta.put({ key: "seed:v1", value: "done" });
    },
  );

  await ensureSeedSortOrder();
}

async function ensureSeedSortOrder() {
  const sorted = await db.meta.get("seed:sort-order:v1");
  if (sorted?.value === "done") return;

  await db.transaction("rw", db.rackets, db.meta, async () => {
    await Promise.all(
      seedRackets.map(async (seedRacket) => {
        const current = await db.rackets.get(seedRacket.id);
        if (current && current.sortOrder !== seedRacket.sortOrder) {
          await db.rackets.update(seedRacket.id, { sortOrder: seedRacket.sortOrder });
        }
      }),
    );
    await db.meta.put({ key: "seed:sort-order:v1", value: "done" });
  });
}
