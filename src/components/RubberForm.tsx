/** Rubber form state, its conversions to store inputs, and the shared rubber editor fields. */
import { Check, ChevronDown, History, Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import {
  DEFAULT_HARDNESS_OPTIONS,
  DEFAULT_THICKNESS_OPTIONS,
  getCatalogBrand,
  matchRubberCatalog,
  thicknessOptionValue,
  type RubberEntry,
  type ThicknessOption,
} from "../data/catalog";
import {
  formatRubberThickness,
  getRubberQuantity,
  isThicknessCode,
  RUBBER_COLORS,
  rubberColorName,
  rubberColorSwatch,
  type Rubber,
  type RubberColor,
  type ThicknessCode,
} from "../db/schema";
import type { CreateRubberInput, RubberFields, RubberSource, UpdateRubberInput, UsedRubberHistory } from "../db/store";
import { formatFullDate, formatHours, hoursInputValue, parseHoursInput, todayISO } from "../utils/date";
import { DEFAULT_LIFE_PARAMETERS } from "../utils/life";
import { CatalogPicker } from "./CatalogPicker";
import { CheckboxField, ChoiceChips, FieldLabel, SegmentedControl, TextAreaField, TextField, inputClass } from "./ui";

/** A rubber being mounted or stocked is a brand-new sheet, or one that was already used. */
export type RubberCondition = "fresh" | "used";

/**
 * Where the editor is used:
 * - `mount`: a new rubber being glued on (全新胶皮 / 已在用老胶皮);
 * - `stock`: a new inventory rubber (全新未拆, several sheets at once / 用过的, e.g. taken off earlier);
 * - `stock-edit`: an inventory rubber (brand-new stock: quantity; used sheet: first glued date and play so far);
 * - `edit`: a mounted or retired rubber.
 */
export type RubberFormVariant = "mount" | "stock" | "stock-edit" | "edit";

/** Raw input values; blank life parameters mean "use the default". */
export type RubberFormState = {
  /** Model. */
  name: string;
  /** Optional custom name telling sheets of the same model apart. */
  label: string;
  /** Brand-new inventory stock: identical sheets. */
  quantity: string;
  hardness: string;
  /** Sponge thickness in mm, or a named size (`MAX` / `OX`). */
  thickness: string;
  /** Topsheet colour, `""` when not recorded. */
  color: RubberColor | "";
  /** Sheet weight in grams. */
  weightGrams: string;
  /** 需要灌油: a boosting rubber (most rubbers are not). */
  boosted: boolean;
  /** Layers of the first boost logged when a new boosted rubber is mounted (used sheets: of each backfilled boost). */
  boostLayers: string;
  calendarDays: string;
  playHours: string;
  /** Play time not covered by sessions (before recording, on deleted rackets), in hours. */
  initialPlayHours: string;
  boostCycleDays: string;
  /** Calendar aging speed while stored in the inventory, percent (blank = 50). */
  storageAgingPercent: string;
  notes: string;
  /** New rubbers (mount / stock): a brand-new sheet, or a used one whose history is backfilled. */
  condition: RubberCondition;
  /** Used sheets: the day the sheet was first glued on. */
  usedInstalledAt: string;
  /** Used inventory sheets: the day they were taken off and stored (slower aging from here). */
  stashedAt: string;
  /** Used + boosted new sheets: boosts done before recording. */
  priorBoostCount: string;
  /** Used + boosted new sheets: date of the latest of those boosts (blank = the installation date). */
  lastBoostDate: string;
};

export function createRubberForm(overrides: Partial<RubberFormState> = {}): RubberFormState {
  return {
    name: "",
    label: "",
    quantity: "1",
    hardness: "",
    thickness: "",
    color: "",
    weightGrams: "",
    boosted: false,
    boostLayers: "2",
    calendarDays: "",
    playHours: "",
    initialPlayHours: "",
    boostCycleDays: "",
    storageAgingPercent: "",
    notes: "",
    condition: "fresh",
    usedInstalledAt: "",
    stashedAt: "",
    priorBoostCount: "1",
    lastBoostDate: "",
    ...overrides,
  };
}

const numberText = (value: number | undefined) => (value === undefined ? "" : String(value));

export function rubberToForm(rubber: Rubber): RubberFormState {
  return createRubberForm({
    name: rubber.name,
    label: rubber.label ?? "",
    quantity: String(getRubberQuantity(rubber)),
    hardness: rubber.hardness ?? "",
    thickness: rubber.thicknessCode ?? numberText(rubber.thicknessMm),
    color: rubber.color ?? "",
    weightGrams: numberText(rubber.weightGrams),
    boosted: rubber.boosted,
    calendarDays: numberText(rubber.customCalendarDays),
    playHours: rubber.customPlayMinutes === undefined ? "" : formatHours(rubber.customPlayMinutes),
    initialPlayHours: hoursInputValue(rubber.initialPlayMinutes),
    boostCycleDays: numberText(rubber.boostCycleDays),
    storageAgingPercent: numberText(rubber.storageAgingPercent),
    notes: rubber.notes ?? "",
    // Inventory editor: a used sheet shows its first installation and take-off dates.
    condition: rubber.installedAt ? "used" : "fresh",
    usedInstalledAt: rubber.installedAt ?? "",
    stashedAt: rubber.stashedAt ?? "",
  });
}

/** Parses an optional positive number; throws a user-facing error for anything else. */
function parsePositive(value: string, label: string, integer = false): number | undefined {
  const text = value.trim();
  if (!text) return undefined;
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label}需为大于 0 的数字`);
  return integer ? Math.max(1, Math.round(parsed)) : parsed;
}

function parseStoragePercent(value: string) {
  const percent = parsePositive(value, "囤货老化速度", true);
  if (percent !== undefined && percent > 100) throw new Error("囤货老化速度需在 1–100% 之间");
  return percent;
}

/** `2.1` -> mm; `max` / `OX` -> the named size. */
function parseThickness(value: string): { thicknessMm?: number; thicknessCode?: ThicknessCode } {
  const code = value.trim().toUpperCase();
  if (isThicknessCode(code)) return { thicknessCode: code };
  return { thicknessMm: parsePositive(value, "厚度") };
}

/** Validates the form (throws with a Chinese message); `label` names the rubber in messages. */
export function formToRubberFields(form: RubberFormState, label = "胶皮"): RubberFields {
  const name = form.name.trim();
  if (!name) throw new Error(`请填写${label}型号`);
  const playHours = parsePositive(form.playHours, "打球时长上限");
  return {
    name,
    label: form.label.trim() || undefined,
    hardness: form.hardness.trim() || undefined,
    ...parseThickness(form.thickness),
    color: form.color || undefined,
    weightGrams: parsePositive(form.weightGrams, "胶皮重量"),
    boosted: form.boosted,
    customCalendarDays: parsePositive(form.calendarDays, "日历寿命", true),
    customPlayMinutes: playHours === undefined ? undefined : Math.round(playHours * 60),
    initialPlayMinutes: parseHoursInput(form.initialPlayHours, "此前已打时长"),
    boostCycleDays: parsePositive(form.boostCycleDays, "复灌周期", true),
    storageAgingPercent: parseStoragePercent(form.storageAgingPercent),
    notes: form.notes.trim() || undefined,
  };
}

/** Like {@link formToRubberFields}, but blank optional fields are cleared (`null`) on the record. */
export function formToRubberUpdate(form: RubberFormState): UpdateRubberInput {
  const fields = formToRubberFields(form);
  return {
    name: fields.name,
    label: fields.label ?? null,
    hardness: fields.hardness ?? null,
    thicknessMm: fields.thicknessMm ?? null,
    thicknessCode: fields.thicknessCode ?? null,
    color: fields.color ?? null,
    weightGrams: fields.weightGrams ?? null,
    boosted: fields.boosted,
    customCalendarDays: fields.customCalendarDays ?? null,
    customPlayMinutes: fields.customPlayMinutes ?? null,
    initialPlayMinutes: fields.initialPlayMinutes ?? null,
    boostCycleDays: fields.boostCycleDays ?? null,
    storageAgingPercent: fields.storageAgingPercent ?? null,
    notes: fields.notes ?? null,
  };
}

/** History of a used sheet entered in a new-rubber form (mount or stock). */
function formToUsedHistory(form: RubberFormState, rubber: RubberFields, label: string, mount: boolean): UsedRubberHistory {
  const installedAt = form.usedInstalledAt.trim();
  if (!installedAt) throw new Error(mount ? `请选择${label}的已投入使用日期` : `请选择${label}首次贴拍的日期`);
  const history: UsedRubberHistory = { installedAt };
  // A used sheet going into the inventory: storage (slower aging) starts on its take-off date.
  if (!mount) history.stashedAt = form.stashedAt.trim() || undefined;
  if (rubber.boosted) {
    history.priorBoostCount = parsePositive(form.priorBoostCount, "历史已灌油次数", true) ?? 1;
    history.lastBoostDate = form.lastBoostDate.trim() || undefined;
    history.boostLayers = parsePositive(form.boostLayers, "上次灌油层数", true) ?? 1;
  }
  return history;
}

/**
 * A rubber to mount that is not in the inventory. A brand-new boosted one also logs its first
 * boost; a used one keeps its own installation date and play time, and its past boosts are
 * backfilled as boosting logs.
 */
export function formToNewSource(form: RubberFormState, label = "胶皮"): RubberSource {
  const rubber = formToRubberFields(form, label);
  const used = form.condition === "used";
  const boostLayers = rubber.boosted ? (parsePositive(form.boostLayers, used ? "上次灌油层数" : "初始灌油层数", true) ?? 1) : undefined;
  if (!used) {
    // Only a used sheet has play time from before it was recorded.
    delete rubber.initialPlayMinutes;
    return { type: "new", rubber, initialBoostLayers: boostLayers };
  }
  return { type: "new", rubber, initialBoostLayers: boostLayers, used: formToUsedHistory(form, rubber, label, true) };
}

/** A new inventory record: `quantity` identical brand-new sheets, or one used sheet with its history. */
export function formToStockInput(form: RubberFormState): CreateRubberInput {
  const rubber = formToRubberFields(form);
  if (form.condition !== "used") {
    delete rubber.initialPlayMinutes;
    return { ...rubber, quantity: parsePositive(form.quantity, "数量", true) ?? 1 };
  }
  return { ...rubber, used: formToUsedHistory(form, rubber, "这张胶皮", false) };
}

/**
 * Edits of an inventory rubber: brand-new stock changes its quantity, a used sheet its first glued
 * and take-off dates.
 */
export function formToStockUpdate(form: RubberFormState, rubber: Rubber): UpdateRubberInput {
  const update = formToRubberUpdate(form);
  if (rubber.installedAt) {
    const installedAt = form.usedInstalledAt.trim();
    if (!installedAt) throw new Error("请选择首次贴拍日期");
    return { ...update, installedAt, stashedAt: form.stashedAt.trim() || null };
  }
  return { ...update, quantity: parsePositive(form.quantity, "数量", true) ?? 1 };
}

/** "红色 · 硬度 47 · 2.1 mm · 48 g · 需灌油" (or a placeholder when nothing was filled in). */
export function describeRubberSpecs(rubber: Pick<Rubber, "hardness" | "thicknessMm" | "thicknessCode" | "color" | "weightGrams" | "boosted">) {
  const parts = [
    rubber.color ? `${rubberColorName[rubber.color]}色` : null,
    rubber.hardness ? `硬度 ${rubber.hardness}` : null,
    formatRubberThickness(rubber) ?? null,
    rubber.weightGrams ? `${rubber.weightGrams} g` : null,
    rubber.boosted ? "需灌油" : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "未填写规格";
}

/** Summary of the life parameters a rubber overrides, or `undefined` when it uses the defaults. */
export function describeCustomLife(
  rubber: Pick<Rubber, "customCalendarDays" | "customPlayMinutes" | "boostCycleDays" | "boosted" | "storageAgingPercent">,
) {
  const parts = [
    rubber.customCalendarDays ? `${rubber.customCalendarDays} 天` : null,
    rubber.customPlayMinutes ? `${formatHours(rubber.customPlayMinutes)} h` : null,
    rubber.boosted && rubber.boostCycleDays ? `复灌 ${rubber.boostCycleDays} 天` : null,
    rubber.storageAgingPercent ? `囤货老化 ${rubber.storageAgingPercent}%` : null,
  ].filter(Boolean);
  return parts.length ? `自定义寿命 ${parts.join(" · ")}` : undefined;
}

/** The custom name as a small pill next to the model. */
export function RubberLabelPill({ label, className = "" }: { label?: string; className?: string }) {
  if (!label) return null;
  return (
    <span
      className={`inline-block max-w-[10rem] shrink-0 truncate rounded-full bg-court/10 px-2 py-0.5 align-middle text-[11px] font-black text-court ${className}`}
      title={label}
    >
      {label}
    </span>
  );
}

/** Small swatch of a topsheet colour (nothing when the colour was not recorded). */
export function RubberColorDot({ color, className = "" }: { color?: RubberColor; className?: string }) {
  if (!color) return null;
  const name = `${rubberColorName[color]}色`;
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className={`inline-block h-3 w-3 shrink-0 rounded-full align-middle ring-1 ring-inset ring-black/20 ${className}`}
      style={{ backgroundColor: rubberColorSwatch[color] }}
    />
  );
}

function CompactNumberField({
  label,
  value,
  onChange,
  placeholder,
  testId,
  decimal = false,
  min = "1",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  testId: string;
  decimal?: boolean;
  min?: string;
}) {
  return (
    <label className="grid min-w-0 gap-1.5">
      <span className="truncate text-xs font-bold text-ink/70">{label}</span>
      <input
        type="number"
        inputMode={decimal ? "decimal" : "numeric"}
        min={min}
        step={decimal ? "any" : "1"}
        placeholder={placeholder}
        data-testid={testId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    </label>
  );
}

const MAX_QUANTITY = 99;

/** − / number / + for the sheets of a brand-new stock record. */
function QuantityField({ value, onChange, testIdPrefix }: { value: string; onChange: (value: string) => void; testIdPrefix: string }) {
  const count = Math.max(1, Math.round(Number(value) || 1));
  const step = (delta: number) => onChange(String(Math.min(MAX_QUANTITY, Math.max(1, count + delta))));
  const stepClass =
    "tap-target inline-flex shrink-0 items-center justify-center rounded-lg bg-white text-ink shadow-sm ring-1 ring-ink/15 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="grid min-w-0 gap-2">
      <FieldLabel hint="同款一次登记多张">数量 · 张</FieldLabel>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => step(-1)} disabled={count <= 1} className={stepClass} aria-label="少一张" data-testid={`${testIdPrefix}-rubber-quantity-minus`}>
          <Minus size={16} aria-hidden="true" />
        </button>
        <input
          type="number"
          inputMode="numeric"
          min="1"
          max={MAX_QUANTITY}
          step="1"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`${inputClass} text-center tabular-nums`}
          aria-label="数量"
          data-testid={`${testIdPrefix}-rubber-quantity`}
        />
        <button
          type="button"
          onClick={() => step(1)}
          disabled={count >= MAX_QUANTITY}
          className={stepClass}
          aria-label="多一张"
          data-testid={`${testIdPrefix}-rubber-quantity-plus`}
        >
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** `41°` / `41度` -> `41`. */
const normalizeHardness = (value: string) => value.trim().replace(/\s*(°|度)$/, "");

const thicknessChipLabel = (option: ThicknessOption) => (option === "OX" ? "OX 无海绵" : option === "MAX" ? "MAX" : `${thicknessOptionValue(option)} mm`);

/**
 * One-tap thickness / hardness presets: the options the matched catalog rubber is sold in, or
 * common values for names the catalog does not know.
 */
function SpecChips({
  value,
  onChange,
  match,
  testIdPrefix,
}: {
  value: RubberFormState;
  onChange: (value: RubberFormState) => void;
  match: RubberEntry | undefined;
  testIdPrefix: string;
}) {
  // A catalog rubber whose sizes are not confirmed still gets the common ones.
  const thicknessOptions = match?.thicknessOptions.length ? match.thicknessOptions : DEFAULT_THICKNESS_OPTIONS;
  const hardnessOptions = match ? (match.hardnessOptions ?? []) : DEFAULT_HARDNESS_OPTIONS;
  const thickness = value.thickness.trim().toUpperCase();
  const selectedThickness = thicknessOptions.find((option) =>
    typeof option === "number" ? thickness !== "" && Math.abs(option - Number(thickness)) < 0.001 : option === thickness,
  );
  const hardness = normalizeHardness(value.hardness);
  const selectedHardness = hardnessOptions.find((option) => option === hardness);

  return (
    <div className="grid gap-2 rounded-lg border border-ink/10 bg-paper px-3 py-2.5" data-testid={`${testIdPrefix}-rubber-spec-chips`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="shrink-0 text-xs font-bold text-ink/70">规格速选</span>
        <span className="min-w-0 truncate text-[11px] font-semibold text-ink/45" data-testid={`${testIdPrefix}-rubber-catalog-match`}>
          {match ? `${getCatalogBrand(match.brand).name} · ${match.name}` : "常用规格"}
        </span>
      </div>
      <div className="flex items-start gap-2">
        <span className="w-8 shrink-0 pt-2.5 text-xs font-bold text-ink/55">厚度</span>
        <ChoiceChips
          ariaLabel="厚度速选"
          className="min-w-0 flex-1"
          value={selectedThickness === undefined ? "" : thicknessOptionValue(selectedThickness)}
          onChange={(next) => onChange({ ...value, thickness: next })}
          options={thicknessOptions.map((option) => {
            const text = thicknessOptionValue(option);
            return { value: text, label: thicknessChipLabel(option), testId: `${testIdPrefix}-rubber-thickness-chip-${text}` };
          })}
        />
      </div>
      {hardnessOptions.length ? (
        <div className="flex items-start gap-2">
          <span className="w-8 shrink-0 pt-2.5 text-xs font-bold text-ink/55">硬度</span>
          <ChoiceChips
            ariaLabel="硬度速选"
            className="min-w-0 flex-1"
            value={selectedHardness ?? ""}
            onChange={(next) => onChange({ ...value, hardness: next })}
            options={hardnessOptions.map((option) => ({
              value: option,
              label: /^\d+(\.\d+)?$/.test(option) ? `${option}°` : option,
              testId: `${testIdPrefix}-rubber-hardness-chip-${option}`,
            }))}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Topsheet colour swatches; tapping the selected one clears it. */
function ColorField({
  value,
  onChange,
  match,
  testIdPrefix,
}: {
  value: RubberFormState;
  onChange: (value: RubberFormState) => void;
  match: RubberEntry | undefined;
  testIdPrefix: string;
}) {
  const known = match?.colors;
  const colorText = (colors: readonly RubberColor[]) => `${colors.map((color) => rubberColorName[color]).join("/")}色`;
  return (
    <div className="grid gap-2">
      <FieldLabel hint={known ? `该型号有${colorText(known)}` : "选填"}>颜色</FieldLabel>
      <div role="group" aria-label="胶皮颜色" className="flex flex-wrap items-center gap-2">
        {RUBBER_COLORS.map((color) => {
          const selected = value.color === color;
          return (
            <button
              key={color}
              type="button"
              aria-pressed={selected}
              aria-label={`${rubberColorName[color]}色`}
              title={`${rubberColorName[color]}色`}
              onClick={() => onChange({ ...value, color: selected ? "" : color })}
              data-testid={`${testIdPrefix}-rubber-color-${color}`}
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition active:scale-95 ${
                selected ? "ring-2 ring-court ring-offset-2" : "ring-1 ring-inset ring-black/15"
              }`}
              style={{ backgroundColor: rubberColorSwatch[color] }}
            >
              {selected ? <Check size={18} strokeWidth={3} className="text-white" aria-hidden="true" /> : null}
            </button>
          );
        })}
        <span className="text-xs font-semibold text-ink/55" data-testid={`${testIdPrefix}-rubber-color-name`}>
          {value.color ? colorText([value.color]) : "未选"}
        </span>
      </div>
    </div>
  );
}

const CONDITION_COPY = {
  mount: { fresh: "全新胶皮", used: "已在用老胶皮", freshHint: "第一次贴拍的新胶皮", usedHint: "补录投入日期、已打时长和灌油历史" },
  stock: { fresh: "全新未拆", used: "用过的", freshHint: "新买的胶皮，同款可以一次登记多张", usedHint: "拆下来以后还会再贴的胶皮" },
} as const;

type RubberFormFieldsProps = {
  value: RubberFormState;
  onChange: (value: RubberFormState) => void;
  /** Prefix of the `data-testid`s: `${prefix}-rubber-name`, `${prefix}-rubber-hardness`, ... */
  testIdPrefix: string;
  /** See {@link RubberFormVariant} (default `edit`). */
  variant?: RubberFormVariant;
  /** `mount`: the day the rubber is mounted, the latest a used sheet's installation date may be. */
  mountDate?: string;
};

export function RubberFormFields({ value, onChange, testIdPrefix, variant = "edit", mountDate }: RubberFormFieldsProps) {
  const update = <K extends keyof RubberFormState>(key: K, next: RubberFormState[K]) => onChange({ ...value, [key]: next });
  const isNew = variant === "mount" || variant === "stock";
  const isStock = variant === "stock" || variant === "stock-edit";
  const used = variant !== "edit" && value.condition === "used";
  const showQuantity = isStock && !used;
  // Read once so React never toggles <details> while the user works inside it.
  const [lifeOpen] = useState(() =>
    Boolean(
      value.calendarDays ||
        value.playHours ||
        value.storageAgingPercent ||
        (value.boosted && value.boostCycleDays) ||
        (variant === "edit" && value.initialPlayHours),
    ),
  );
  const match = useMemo(() => matchRubberCatalog(value.name), [value.name]);
  const today = todayISO();
  const latestUsedDate = variant === "mount" && mountDate && mountDate < today ? mountDate : today;
  const copy = CONDITION_COPY[variant === "stock" ? "stock" : "mount"];
  const storagePercent = value.storageAgingPercent.trim() || String(DEFAULT_LIFE_PARAMETERS.storageAgingPercent);
  const lifeSummary = [
    `${value.calendarDays.trim() || DEFAULT_LIFE_PARAMETERS.calendarDays} 天`,
    `${value.playHours.trim() || formatHours(DEFAULT_LIFE_PARAMETERS.playMinutes)} h`,
    value.boosted ? `复灌 ${value.boostCycleDays.trim() || DEFAULT_LIFE_PARAMETERS.boostCycleDays} 天` : null,
    `囤货 ${storagePercent}%`,
    variant === "edit" && value.initialPlayHours.trim() ? `此前 ${value.initialPlayHours.trim()} h` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const priorBoosts = Math.max(1, Math.round(Number(value.priorBoostCount) || 1));
  const lastBoostDate = value.lastBoostDate || value.usedInstalledAt;
  const lastBoostText = lastBoostDate ? formatFullDate(lastBoostDate) : "上次灌油日期";
  const backfillSummary =
    priorBoosts > 1
      ? `保存时自动补记 ${priorBoosts} 次灌油：最后一次记在 ${lastBoostText}，此前 ${priorBoosts - 1} 次的日期从首次贴拍日起均匀估算。`
      : `保存时自动补记 1 次灌油，记在 ${lastBoostText}。`;

  let boostDescription = "大多数胶皮不用灌油；国产粘性胶皮（如狂飚）常需灌油";
  if (value.boosted) {
    if (variant === "mount" && !used) boostDescription = "贴拍时记一次初始灌油，之后显示灌油记录和复灌提醒";
    else if (isNew && used) boostDescription = "补录历史灌油次数和上次灌油";
    else boostDescription = "显示灌油记录和复灌提醒";
  }

  /** A catalog pick also applies the rubber's presets that are still blank. */
  function pickCatalogRubber(entry: RubberEntry, name: string) {
    const next: RubberFormState = { ...value, name };
    // New rubbers follow the catalog: only rubbers it marks as commonly boosted start with 需要灌油.
    if (isNew) next.boosted = entry.defaultBoosted ?? false;
    if (!value.hardness.trim() && entry.hardnessOptions?.length === 1) next.hardness = entry.hardnessOptions[0];
    if (!value.thickness.trim() && entry.thicknessOptions.length === 1) next.thickness = thicknessOptionValue(entry.thicknessOptions[0]);
    if (!value.color && entry.colors?.length === 1) next.color = entry.colors[0];
    onChange(next);
  }

  return (
    <div className="grid gap-4">
      {isNew ? (
        <div className="grid gap-2">
          <FieldLabel hint={used ? copy.usedHint : copy.freshHint}>胶皮状况</FieldLabel>
          <SegmentedControl
            ariaLabel="胶皮状况"
            value={value.condition}
            onChange={(condition) => update("condition", condition)}
            options={[
              { value: "fresh", label: copy.fresh, testId: `${testIdPrefix}-rubber-condition-fresh` },
              { value: "used", label: copy.used, testId: `${testIdPrefix}-rubber-condition-used` },
            ]}
          />
        </div>
      ) : null}
      <CatalogPicker
        kind="rubber"
        label="胶皮型号"
        value={value.name}
        onChange={(name) => update("name", name)}
        onPick={pickCatalogRubber}
        testId={`${testIdPrefix}-rubber-name`}
        placeholder="搜索或直接输入，如 省狂 / T05 / D09c"
      />
      <div className={showQuantity ? "grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-start" : "grid"}>
        <TextField
          label="自定义名称"
          hint="选填，区分同款胶皮"
          placeholder="如 1号、比赛用、备用"
          value={value.label}
          onChange={(label) => update("label", label)}
          maxLength={40}
          autoComplete="off"
          testId={`${testIdPrefix}-rubber-label`}
        />
        {showQuantity ? <QuantityField value={value.quantity} onChange={(quantity) => update("quantity", quantity)} testIdPrefix={testIdPrefix} /> : null}
      </div>
      <ColorField value={value} onChange={onChange} match={match} testIdPrefix={testIdPrefix} />
      <SpecChips value={value} onChange={onChange} match={match} testIdPrefix={testIdPrefix} />
      <div className="grid grid-cols-3 gap-3">
        <TextField
          label="硬度"
          value={value.hardness}
          onChange={(hardness) => update("hardness", hardness)}
          testId={`${testIdPrefix}-rubber-hardness`}
          autoComplete="off"
        />
        <TextField
          label="厚度 mm"
          // Text, not number: MAX / OX (set by the chips) are valid too.
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value.thickness}
          onChange={(thickness) => update("thickness", thickness)}
          testId={`${testIdPrefix}-rubber-thickness`}
        />
        <TextField
          label="重量 g"
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          placeholder="选填"
          value={value.weightGrams}
          onChange={(weightGrams) => update("weightGrams", weightGrams)}
          testId={`${testIdPrefix}-rubber-weight`}
        />
      </div>
      {used ? (
        <div className="grid gap-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3" data-testid={`${testIdPrefix}-rubber-used-fields`}>
          <div className={`grid gap-3 ${isStock ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            <TextField
              label={variant === "mount" ? "已投入使用日期" : "首次贴拍日期"}
              type="date"
              max={latestUsedDate}
              required
              value={value.usedInstalledAt}
              onChange={(usedInstalledAt) => update("usedInstalledAt", usedInstalledAt)}
              testId={`${testIdPrefix}-rubber-used-installed-at`}
            />
            {isStock ? (
              <TextField
                label="拆下日期"
                hint="从这天起按囤货速度老化"
                type="date"
                min={value.usedInstalledAt || undefined}
                max={today}
                value={value.stashedAt}
                onChange={(stashedAt) => update("stashedAt", stashedAt)}
                testId={`${testIdPrefix}-rubber-stashed-at`}
              />
            ) : null}
            <TextField
              label="此前已打时长（小时）"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="0"
              value={value.initialPlayHours}
              onChange={(initialPlayHours) => update("initialPlayHours", initialPlayHours)}
              testId={`${testIdPrefix}-rubber-initial-hours`}
            />
          </div>
          <p className="flex items-start gap-1.5 text-xs font-medium leading-5 text-amber-800/80">
            <History size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            {variant === "mount"
              ? "日历寿命从投入使用日期算起，此前已打时长直接计入打球寿命。"
              : `日历寿命从首次贴拍日算起；拆下后放在囤货里不再打球，按 ${storagePercent}% 的速度继续老化。已打时长计入打球寿命，再贴上球拍后接着累计。`}
          </p>
        </div>
      ) : null}
      <CheckboxField
        label="需要灌油"
        description={boostDescription}
        checked={value.boosted}
        onChange={(boosted) => update("boosted", boosted)}
        testId={`${testIdPrefix}-rubber-boosted`}
      />
      {variant === "mount" && value.boosted && !used ? (
        <TextField
          label="初始灌油层数"
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          value={value.boostLayers}
          onChange={(boostLayers) => update("boostLayers", boostLayers)}
          testId={`${testIdPrefix}-rubber-boost-layers`}
        />
      ) : null}
      {isNew && used && value.boosted ? (
        <div className="grid gap-3 rounded-lg border border-court/20 bg-court/5 p-3" data-testid={`${testIdPrefix}-rubber-boost-history`}>
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField
              label="历史已灌油次数"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={value.priorBoostCount}
              onChange={(priorBoostCount) => update("priorBoostCount", priorBoostCount)}
              testId={`${testIdPrefix}-rubber-prior-boosts`}
            />
            <TextField
              label="上次灌油日期"
              type="date"
              min={value.usedInstalledAt || undefined}
              max={latestUsedDate}
              value={value.lastBoostDate}
              onChange={(lastBoostDate) => update("lastBoostDate", lastBoostDate)}
              testId={`${testIdPrefix}-rubber-last-boost-date`}
            />
            <TextField
              label="上次灌油层数"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={value.boostLayers}
              onChange={(boostLayers) => update("boostLayers", boostLayers)}
              testId={`${testIdPrefix}-rubber-boost-layers`}
            />
          </div>
          <p className="text-xs font-medium leading-5 text-court" data-testid={`${testIdPrefix}-rubber-backfill-summary`}>
            {backfillSummary}
          </p>
        </div>
      ) : null}
      <details open={lifeOpen} className="group rounded-lg border border-ink/10 bg-paper">
        <summary
          className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 [&::-webkit-details-marker]:hidden"
          data-testid={`${testIdPrefix}-rubber-life-toggle`}
        >
          <span className="shrink-0 text-sm font-bold text-ink">{value.boosted ? "寿命与复灌参数" : "寿命参数"}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-ink/50">
            <span className="truncate">{lifeSummary}</span>
            <ChevronDown size={16} className="shrink-0 transition group-open:rotate-180" aria-hidden="true" />
          </span>
        </summary>
        <div className="grid gap-3 border-t border-ink/10 p-3">
          <div className={`grid grid-cols-2 gap-2 ${value.boosted ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
            <CompactNumberField
              label="日历寿命 · 天"
              placeholder={String(DEFAULT_LIFE_PARAMETERS.calendarDays)}
              value={value.calendarDays}
              onChange={(calendarDays) => update("calendarDays", calendarDays)}
              testId={`${testIdPrefix}-rubber-calendar-days`}
            />
            <CompactNumberField
              label="打球上限 · h"
              placeholder={formatHours(DEFAULT_LIFE_PARAMETERS.playMinutes)}
              decimal
              value={value.playHours}
              onChange={(playHours) => update("playHours", playHours)}
              testId={`${testIdPrefix}-rubber-play-hours`}
            />
            {value.boosted ? (
              <CompactNumberField
                label="复灌周期 · 天"
                placeholder={String(DEFAULT_LIFE_PARAMETERS.boostCycleDays)}
                value={value.boostCycleDays}
                onChange={(boostCycleDays) => update("boostCycleDays", boostCycleDays)}
                testId={`${testIdPrefix}-rubber-boost-cycle`}
              />
            ) : null}
            <CompactNumberField
              label="囤货老化 · %"
              placeholder={String(DEFAULT_LIFE_PARAMETERS.storageAgingPercent)}
              value={value.storageAgingPercent}
              onChange={(storageAgingPercent) => update("storageAgingPercent", storageAgingPercent)}
              testId={`${testIdPrefix}-rubber-storage-aging`}
            />
          </div>
          {variant === "edit" ? (
            <div className="grid grid-cols-3 items-end gap-2">
              <CompactNumberField
                label="此前已打 · h"
                placeholder="0"
                decimal
                min="0"
                value={value.initialPlayHours}
                onChange={(initialPlayHours) => update("initialPlayHours", initialPlayHours)}
                testId={`${testIdPrefix}-rubber-initial-hours`}
              />
              <p className="col-span-2 pb-1 text-xs font-medium leading-5 text-ink/50">
                没有打球记录的时长（录入 App 之前打的），计入打球寿命。贴在其他球拍时的打球记录会自动算上。
              </p>
            </div>
          ) : null}
          <p className="text-xs font-medium leading-5 text-ink/50">
            留空即使用默认值：日历寿命 {DEFAULT_LIFE_PARAMETERS.calendarDays} 天、打球 {formatHours(DEFAULT_LIFE_PARAMETERS.playMinutes)} 小时
            {value.boosted ? `、每 ${DEFAULT_LIFE_PARAMETERS.boostCycleDays} 天提醒复灌` : ""}。暂时撕下放在囤货里时不再打球，日历寿命按「囤货老化」的速度继续（默认{" "}
            {DEFAULT_LIFE_PARAMETERS.storageAgingPercent}%，即两天算一天）。
          </p>
        </div>
      </details>
      <TextAreaField
        label="备注"
        hint="选填"
        placeholder="批次、购买渠道…"
        value={value.notes}
        onChange={(notes) => update("notes", notes)}
        testId={`${testIdPrefix}-rubber-notes`}
      />
    </div>
  );
}
