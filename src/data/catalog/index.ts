/**
 * Equipment catalog data: one JSON file per brand (format: see `src/data/catalog.ts`), listed in
 * filter-pill order. Edit the JSON files directly; keep this list in step when adding or removing a
 * brand. `sources.json` (not imported) records where the specs were checked.
 */
import brand_butterfly from "./butterfly.json";
import brand_dhs from "./dhs.json";
import brand_stiga from "./stiga.json";
import brand_tibhar from "./tibhar.json";
import brand_xiom from "./xiom.json";
import brand_nittaku from "./nittaku.json";
import brand_yasaka from "./yasaka.json";
import brand_victas from "./victas.json";
import brand_donic from "./donic.json";
import brand_andro from "./andro.json";
import brand_joola from "./joola.json";
import brand_gewo from "./gewo.json";
import brand_friendship from "./friendship.json";
import brand_yinhe from "./yinhe.json";
import brand_sanwei from "./sanwei.json";
import brand_loki from "./loki.json";
import brand_palio from "./palio.json";
import brand_sword from "./sword.json";
import brand_kokutaku from "./kokutaku.json";
import brand_doublefish from "./doublefish.json";
import brand_juic from "./juic.json";
import brand_armstrong from "./armstrong.json";
import brand_darker from "./darker.json";
import brand_dr_neubauer from "./dr-neubauer.json";
import brand_sauer_troger from "./sauer-troger.json";
import brand_materialspezialist from "./materialspezialist.json";
import brand_reactor from "./reactor.json";

export const RAW_CATALOG_BRANDS: readonly unknown[] = [
  brand_butterfly,
  brand_dhs,
  brand_stiga,
  brand_tibhar,
  brand_xiom,
  brand_nittaku,
  brand_yasaka,
  brand_victas,
  brand_donic,
  brand_andro,
  brand_joola,
  brand_gewo,
  brand_friendship,
  brand_yinhe,
  brand_sanwei,
  brand_loki,
  brand_palio,
  brand_sword,
  brand_kokutaku,
  brand_doublefish,
  brand_juic,
  brand_armstrong,
  brand_darker,
  brand_dr_neubauer,
  brand_sauer_troger,
  brand_materialspezialist,
  brand_reactor,
];
