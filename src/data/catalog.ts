/**
 * Built-in equipment catalog behind the blade / rubber pickers: real-world blades and rubbers with
 * Chinese + English names, search aliases (abbreviations such as `vis`, `w968`, `hl5`, `fzd`, `zjk`,
 * `h3`, `t05`, `d09c`), blade constructions and per-rubber thickness / hardness / colour presets.
 *
 * The data lives in `./catalog/<brand>.json` (one file per brand, listed in filter-pill order by
 * `./catalog/index.ts`) and is validated here once, when the module loads. Specs the sources did
 * not confirm are left out rather than guessed. The pickers always accept free text as well, so
 * gear missing from the catalog can still be entered by hand.
 *
 * Brand file: `{ id, name (Chinese pill name), en, label, aliases, rubbers: [{ id, name, aliases,
 * category, thickness: [mm | "MAX" | "OX"], hardness: [string], colors, boosted?, discontinued? }],
 * blades: [{ id, name, aliases, category?, plies?, discontinued? }] }`.
 * Pure data + helpers (no React), safe to import anywhere.
 */
import { isRubberColor, isThicknessCode, rubberColorName, type RubberColor, type ThicknessCode } from "../db/schema";
import { RAW_CATALOG_BRANDS } from "./catalog/index";

/** Lowercase slug of a brand (`butterfly`, `dhs`, `loki`, ...), the name of its JSON file. */
export type BrandId = string;

export type CatalogBrand = {
  id: BrandId;
  /** Chinese short name, shown on the brand filter pills. */
  name: string;
  /** English name. */
  en: string;
  /** Prefix of the value inserted into the form: the Chinese name, e.g. `蝴蝶 维斯卡利亚 (Viscaria)` / `红双喜 狂飚龙5 (...)`. */
  label: string;
  aliases?: string[];
};

export type BladeCategory =
  | "纯木"
  | "外置芳碳"
  | "内置芳碳"
  | "外置碳素"
  | "内置碳素"
  | "外置超级纤维"
  | "内置超级纤维"
  /** Glass fibre, Texalium, titanium, basalt and other non-carbon fibres. */
  | "外置其他纤维"
  | "内置其他纤维";

export type RubberCategory = "反胶" | "生胶" | "中颗粒" | "长胶" | "防弧圈";

const BLADE_CATEGORIES: readonly BladeCategory[] = [
  "纯木",
  "外置芳碳",
  "内置芳碳",
  "外置碳素",
  "内置碳素",
  "外置超级纤维",
  "内置超级纤维",
  "外置其他纤维",
  "内置其他纤维",
];

const RUBBER_CATEGORIES: readonly RubberCategory[] = ["反胶", "生胶", "中颗粒", "长胶", "防弧圈"];

type CatalogEntryBase = {
  id: string;
  brand: BrandId;
  /** Display name: model plus its other-language name in parentheses. */
  name: string;
  /** Extra search keys: nicknames, abbreviations, other spellings. */
  aliases: string[];
  /** No longer made but still common; listed after the current products of its brand. */
  discontinued?: boolean;
};

export type BladeEntry = CatalogEntryBase & {
  /** Construction; omitted when not certain. */
  category?: BladeCategory;
  /** Layer layout as the maker describes it, e.g. `5`, `7`, `5+2`. */
  plies?: string;
};

/** A sponge thickness in mm, or a named size sold without a mm figure (`MAX`, `OX`). */
export type ThicknessOption = number | ThicknessCode;

export type RubberEntry = CatalogEntryBase & {
  category: RubberCategory;
  /** Commonly boosted before gluing (Chinese tacky rubbers): preselects 「需要灌油」. */
  defaultBoosted?: boolean;
  /** Sponge thicknesses the rubber is sold in: `OX` first, then mm ascending, then `MAX`. */
  thicknessOptions: ThicknessOption[];
  /** Sponge hardnesses the rubber is sold in (as printed by the maker); omitted when unknown. */
  hardnessOptions?: string[];
  /** Topsheet colours it is sold in; omitted when unknown. */
  colors?: RubberColor[];
};

export type CatalogEntry = BladeEntry | RubberEntry;

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

type RawRecord = Record<string, unknown>;

const asRecord = (value: unknown): RawRecord => (value && typeof value === "object" && !Array.isArray(value) ? (value as RawRecord) : {});
const asText = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const asTexts = (value: unknown) => (Array.isArray(value) ? [...new Set(value.map(asText).filter(Boolean))] : []);
const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function parseThickness(value: unknown): ThicknessOption[] {
  const numbers = new Set<number>();
  const codes = new Set<ThicknessCode>();
  for (const item of asList(value)) {
    if (typeof item === "number" && Number.isFinite(item) && item > 0) numbers.add(Math.round(item * 100) / 100);
    else if (typeof item === "string" && isThicknessCode(item.trim().toUpperCase())) codes.add(item.trim().toUpperCase() as ThicknessCode);
  }
  const sorted = [...numbers].sort((left, right) => left - right);
  return [...(codes.has("OX") ? (["OX"] as const) : []), ...sorted, ...(codes.has("MAX") ? (["MAX"] as const) : [])];
}

/** Current products first, discontinued ones after them; otherwise the order of the file. */
function currentFirst<T extends { discontinued?: boolean }>(entries: T[]) {
  return [...entries.filter((entry) => !entry.discontinued), ...entries.filter((entry) => entry.discontinued)];
}

const CJK = /[\u3400-\u9fff]/;
/** Category remarks in parentheses (`Spectol S1 (生胶)`) are not names. */
const CATEGORY_REMARK = /^(反胶|生胶|正胶|中颗粒|长胶|防弧圈|颗粒胶)$/;

/**
 * Chinese name first, as Chinese players know most gear: `Viscaria (维斯卡利亚)` ->
 * `维斯卡利亚 (Viscaria)`. Names without a Chinese part (`Rakza 7 (R7)`) stay as they are.
 */
export function chineseFirst(name: string) {
  const match = /^(.*?)\s*[(（](.*)[)）]\s*$/.exec(name);
  if (!match) return name;
  const main = match[1].trim();
  const inner = match[2].trim();
  if (!main || CJK.test(main) || !CJK.test(inner) || CATEGORY_REMARK.test(inner)) return name;
  return `${inner} (${main})`;
}

function parseBlade(brand: BrandId, raw: unknown): BladeEntry | undefined {
  const data = asRecord(raw);
  const id = asText(data.id);
  const name = chineseFirst(asText(data.name));
  if (!id || !name) return undefined;
  const category = asText(data.category) as BladeCategory;
  const plies = asText(data.plies);
  return {
    id: `blade-${brand}-${id}`,
    brand,
    name,
    aliases: asTexts(data.aliases),
    ...(BLADE_CATEGORIES.includes(category) ? { category } : {}),
    ...(plies ? { plies } : {}),
    ...(data.discontinued === true ? { discontinued: true } : {}),
  };
}

function parseRubber(brand: BrandId, raw: unknown): RubberEntry | undefined {
  const data = asRecord(raw);
  const id = asText(data.id);
  const name = chineseFirst(asText(data.name));
  if (!id || !name) return undefined;
  const category = asText(data.category) as RubberCategory;
  const hardness = asTexts(data.hardness);
  const colors = asList(data.colors).filter(isRubberColor);
  return {
    id: `rubber-${brand}-${id}`,
    brand,
    name,
    aliases: asTexts(data.aliases),
    category: RUBBER_CATEGORIES.includes(category) ? category : "反胶",
    thicknessOptions: parseThickness(data.thickness),
    ...(hardness.length ? { hardnessOptions: hardness } : {}),
    ...(colors.length ? { colors: [...new Set(colors)] } : {}),
    ...(data.boosted === true ? { defaultBoosted: true } : {}),
    ...(data.discontinued === true ? { discontinued: true } : {}),
  };
}

function loadCatalog() {
  const brands: CatalogBrand[] = [];
  const blades: BladeEntry[] = [];
  const rubbers: RubberEntry[] = [];
  for (const raw of RAW_CATALOG_BRANDS) {
    const data = asRecord(raw);
    const id = asText(data.id);
    if (!id || brands.some((brand) => brand.id === id)) continue;
    const en = asText(data.en) || id;
    const name = asText(data.name) || en;
    // The value written into the form starts with the Chinese brand name (`蝴蝶 维斯卡利亚 (Viscaria)`);
    // the English label stays searchable.
    const aliases = [...new Set([...asTexts(data.aliases), asText(data.label)].filter((alias) => alias && alias !== name && alias !== en))];
    brands.push({ id, name, en, label: name, ...(aliases.length ? { aliases } : {}) });
    // Valid entries with an id not used before (ids are unique per brand and kind).
    const seen = new Set<string>();
    const valid = <T extends CatalogEntry>(entries: (T | undefined)[]) =>
      entries.filter((entry): entry is T => {
        if (!entry || seen.has(entry.id)) return false;
        seen.add(entry.id);
        return true;
      });
    blades.push(...currentFirst(valid(asList(data.blades).map((item) => parseBlade(id, item)))));
    rubbers.push(...currentFirst(valid(asList(data.rubbers).map((item) => parseRubber(id, item)))));
  }
  return { brands, blades, rubbers };
}

const LOADED = loadCatalog();

/** Filter pills follow this order. */
export const CATALOG_BRANDS: readonly CatalogBrand[] = LOADED.brands;
export const BLADE_CATALOG: readonly BladeEntry[] = LOADED.blades;
export const RUBBER_CATALOG: readonly RubberEntry[] = LOADED.rubbers;

const BRAND_BY_ID = new Map(CATALOG_BRANDS.map((brand) => [brand.id, brand]));

export function getCatalogBrand(id: BrandId): CatalogBrand {
  return BRAND_BY_ID.get(id) ?? { id, name: id, en: id, label: id };
}

/** Offered as chips when the rubber name does not match the catalog (OX last: pips only). */
export const DEFAULT_THICKNESS_OPTIONS: readonly ThicknessOption[] = [1.8, 2.0, 2.1, 2.15, 2.2, "MAX", "OX"];
export const DEFAULT_HARDNESS_OPTIONS: readonly string[] = ["38", "39", "40", "41", "42.5", "47.5", "50"];

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Search form of a text: half-width, lower case, `飙` folded into `飚`, without spaces and
 * punctuation (so `H3-50`, `h3 50` and `H350` are equal).
 */
export function normalizeSearchText(value: string) {
  return value
    .replace(/[\uFF01-\uFF5E]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, " ")
    .toLowerCase()
    .replace(/飙/g, "飚")
    .replace(/[\s\-_.·・,，、/\\()（）[\]<>'"+°]/g, "");
}

/** Value written into the name field when an entry is picked. */
export function catalogValue(entry: CatalogEntry) {
  const { label, en } = getCatalogBrand(entry.brand);
  return entry.name.startsWith(label) || entry.name.startsWith(en) ? entry.name : `${label} ${entry.name}`;
}

/** `Viscaria (维斯卡利亚)` -> [`Viscaria`, `维斯卡利亚`]. */
function nameParts(name: string) {
  const match = /^(.*?)\s*[(（](.*)[)）]\s*$/.exec(name);
  return match ? [match[1], match[2]] : [];
}

type IndexedEntry<T extends CatalogEntry> = {
  entry: T;
  /** Normalized names and aliases: exact / prefix matching and rubber name matching. */
  keys: string[];
  /** Everything searchable (keys + brand names + category), joined. */
  haystack: string;
};

function buildIndex<T extends CatalogEntry>(entries: readonly T[]): IndexedEntry<T>[] {
  return entries.map((entry) => {
    const brand = getCatalogBrand(entry.brand);
    const parts = nameParts(entry.name);
    // Brand-prefixed names in both languages (`蝴蝶 ...`, `Butterfly ...`) help free-text matching pick the right brand.
    const prefixed = [entry.name, ...parts].flatMap((part) => [`${brand.label} ${part}`, `${brand.en} ${part}`]);
    const keys = [...new Set([entry.name, catalogValue(entry), ...parts, ...prefixed, ...entry.aliases].map(normalizeSearchText))].filter(Boolean);
    const extra = [brand.name, brand.en, ...(brand.aliases ?? []), entry.category ?? ""].map(normalizeSearchText);
    return { entry, keys, haystack: [...keys, ...extra].filter(Boolean).join("|") };
  });
}

const BLADE_INDEX = buildIndex(BLADE_CATALOG);
const RUBBER_INDEX = buildIndex(RUBBER_CATALOG);

export type CatalogKind = "blade" | "rubber";

export type CatalogEntryOf<K extends CatalogKind> = K extends "blade" ? BladeEntry : RubberEntry;

export type CatalogGroup<T extends CatalogEntry> = { brand: CatalogBrand; entries: T[] };

function indexOf<K extends CatalogKind>(kind: K) {
  return (kind === "blade" ? BLADE_INDEX : RUBBER_INDEX) as IndexedEntry<CatalogEntryOf<K>>[];
}

/** Brands that have entries in a catalog, in pill order. */
export function catalogBrands(kind: CatalogKind): CatalogBrand[] {
  const used = new Set(indexOf(kind).map((item) => item.entry.brand));
  return CATALOG_BRANDS.filter((brand) => used.has(brand.id));
}

/**
 * Entries matching every word of `query` (in names, aliases, brand or construction), grouped by
 * brand. Exact and prefix matches of a name / alias rank first, then current products before
 * discontinued ones; brands follow their best match.
 */
export function searchCatalog<K extends CatalogKind>(kind: K, query: string, brandId?: BrandId): CatalogGroup<CatalogEntryOf<K>>[] {
  const tokens = query.split(/\s+/).map(normalizeSearchText).filter(Boolean);
  const whole = normalizeSearchText(query);
  const matches: { entry: CatalogEntryOf<K>; score: number; order: number }[] = [];

  indexOf(kind).forEach((item, order) => {
    if (brandId && item.entry.brand !== brandId) return;
    if (!tokens.every((token) => item.haystack.includes(token))) return;
    const rank = !whole || item.keys.includes(whole) ? 0 : item.keys.some((key) => key.startsWith(whole)) ? 1 : 2;
    matches.push({ entry: item.entry, score: rank * 2 + (item.entry.discontinued ? 1 : 0), order });
  });
  matches.sort((left, right) => left.score - right.score || left.order - right.order);

  const groups = new Map<BrandId, CatalogEntryOf<K>[]>();
  for (const { entry } of matches) {
    const group = groups.get(entry.brand);
    if (group) group.push(entry);
    else groups.set(entry.brand, [entry]);
  }
  return [...groups].map(([id, entries]) => ({ brand: getCatalogBrand(id), entries }));
}

/**
 * Catalog rubber that a free-text name refers to (`H3 Provincial Blue 41 2.2` -> 省狂蓝海绵,
 * `T05 2.1` -> Tenergy 05): the entry with the longest name / alias contained in the text.
 */
export function matchRubberCatalog(name: string): RubberEntry | undefined {
  const text = normalizeSearchText(name);
  if (!text) return undefined;
  let best: { entry: RubberEntry; length: number } | undefined;
  for (const item of RUBBER_INDEX) {
    for (const key of item.keys) {
      if (key.length < 2 || key.length <= (best?.length ?? 0) || !text.includes(key)) continue;
      best = { entry: item.entry, length: key.length };
    }
  }
  return best?.entry;
}

/** Number with up to two decimals and no trailing zeros (`2.15`, `2`). */
export function formatSpecNumber(value: number) {
  return String(Math.round(value * 100) / 100);
}

/** Sponge thickness with at least one decimal, as printed on the packaging (`2.0`, `2.15`). */
export function formatThickness(mm: number) {
  const text = formatSpecNumber(mm);
  return text.includes(".") ? text : `${text}.0`;
}

/** Form value of a thickness option: `2.0`, `2.15`, `MAX`, `OX`. */
export function thicknessOptionValue(option: ThicknessOption) {
  return typeof option === "number" ? formatThickness(option) : option;
}

/** `1.8/2.0/2.1 mm`, `1.7–2.3 mm`, `2.0 mm/MAX`, `OX/0.5/1.0 mm` (empty when unknown). */
export function describeThicknessOptions(options: readonly ThicknessOption[]) {
  const numbers = options.filter((option): option is number => typeof option === "number");
  const range =
    numbers.length > 3
      ? `${formatThickness(numbers[0])}–${formatThickness(numbers[numbers.length - 1])} mm`
      : numbers.length
        ? `${numbers.map(formatThickness).join("/")} mm`
        : "";
  return [options.includes("OX") ? "OX" : "", range, options.includes("MAX") ? "MAX" : ""].filter(Boolean).join("/");
}

function describeHardnessOptions(options: readonly string[]) {
  const numeric = options.every((option) => /^\d+(\.\d+)?$/.test(option));
  const text = numeric && options.length > 4 ? `${options[0]}–${options[options.length - 1]}` : options.join("/");
  return numeric ? `${text}°` : text;
}

/** Colours worth mentioning: anything but the usual red + black pair. */
function describeColors(colors: readonly RubberColor[] | undefined) {
  if (!colors?.length) return "";
  if (colors.length === 2 && colors.includes("red") && colors.includes("black")) return "";
  if (colors.length > 3) return `${colors.length} 色可选`;
  return `${colors.map((color) => rubberColorName[color]).join("/")}色`;
}

/**
 * Short spec line for a picker option, e.g. `2.1/2.15/2.2 mm · 39/40/41°`, `长胶 · OX/0.5/1.0 mm`
 * or `外置芳碳 · 5+2 · 停产`.
 */
export function describeCatalogEntry(entry: CatalogEntry) {
  const status = entry.discontinued ? "停产" : null;
  if (!("thicknessOptions" in entry)) {
    return [entry.category ?? null, entry.plies ? `${entry.plies} 层` : null, status].filter(Boolean).join(" · ");
  }
  const parts = [
    entry.category === "反胶" ? null : entry.category,
    describeThicknessOptions(entry.thicknessOptions) || null,
    entry.hardnessOptions ? describeHardnessOptions(entry.hardnessOptions) : null,
    describeColors(entry.colors) || null,
    status,
  ];
  return parts.filter(Boolean).join(" · ");
}
