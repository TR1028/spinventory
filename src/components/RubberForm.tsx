/** Rubber form state, its conversions to store inputs, and the shared rubber editor fields. */
import { ChevronDown, History } from "lucide-react";
import { useMemo, useState } from "react";
import {
  DEFAULT_HARDNESS_OPTIONS,
  DEFAULT_THICKNESS_OPTIONS,
  formatThickness,
  getCatalogBrand,
  matchRubberCatalog,
  type RubberEntry,
} from "../data/catalog";
import type { Rubber } from "../db/schema";
import type { RubberFields, RubberSource, UpdateRubberInput, UsedRubberHistory } from "../db/store";
import { formatFullDate, formatHours, hoursInputValue, parseHoursInput, todayISO } from "../utils/date";
import { DEFAULT_LIFE_PARAMETERS } from "../utils/life";
import { CatalogPicker } from "./CatalogPicker";
import { CheckboxField, ChoiceChips, FieldLabel, SegmentedControl, TextAreaField, TextField, inputClass } from "./ui";

/** A rubber being mounted is a brand-new sheet, or one already in use before it was recorded. */
export type RubberCondition = "fresh" | "used";

/** Raw input values; blank life parameters mean "use the default". */
export type RubberFormState = {
  name: string;
  hardness: string;
  thicknessMm: string;
  /** Sheet weight in grams. */
  weightGrams: string;
  boosted: boolean;
  /** Layers of the first boost logged when a new boosted rubber is mounted (used sheets: of each backfilled boost). */
  boostLayers: string;
  calendarDays: string;
  playHours: string;
  /** Play time before the rubber was recorded in the app, in hours. */
  initialPlayHours: string;
  boostCycleDays: string;
  notes: string;
  /** New rubbers only: a brand-new sheet, or a used one whose history is backfilled. */
  condition: RubberCondition;
  /** Used sheets: the day the sheet was first glued on. */
  usedInstalledAt: string;
  /** Used + boosted sheets: boosts done before recording. */
  priorBoostCount: string;
  /** Used + boosted sheets: date of the latest of those boosts (blank = the installation date). */
  lastBoostDate: string;
};

export function createRubberForm(overrides: Partial<RubberFormState> = {}): RubberFormState {
  return {
    name: "",
    hardness: "",
    thicknessMm: "",
    weightGrams: "",
    boosted: false,
    boostLayers: "2",
    calendarDays: "",
    playHours: "",
    initialPlayHours: "",
    boostCycleDays: "",
    notes: "",
    condition: "fresh",
    usedInstalledAt: "",
    priorBoostCount: "1",
    lastBoostDate: "",
    ...overrides,
  };
}

const numberText = (value: number | undefined) => (value === undefined ? "" : String(value));

export function rubberToForm(rubber: Rubber): RubberFormState {
  return createRubberForm({
    name: rubber.name,
    hardness: rubber.hardness ?? "",
    thicknessMm: numberText(rubber.thicknessMm),
    weightGrams: numberText(rubber.weightGrams),
    boosted: rubber.boosted,
    calendarDays: numberText(rubber.customCalendarDays),
    playHours: rubber.customPlayMinutes === undefined ? "" : formatHours(rubber.customPlayMinutes),
    initialPlayHours: hoursInputValue(rubber.initialPlayMinutes),
    boostCycleDays: numberText(rubber.boostCycleDays),
    notes: rubber.notes ?? "",
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

/** Validates the form (throws with a Chinese message); `label` names the rubber in messages. */
export function formToRubberFields(form: RubberFormState, label = "胶皮"): RubberFields {
  const name = form.name.trim();
  if (!name) throw new Error(`请填写${label}名称`);
  const playHours = parsePositive(form.playHours, "打球时长上限");
  return {
    name,
    hardness: form.hardness.trim() || undefined,
    thicknessMm: parsePositive(form.thicknessMm, "厚度"),
    weightGrams: parsePositive(form.weightGrams, "胶皮重量"),
    boosted: form.boosted,
    customCalendarDays: parsePositive(form.calendarDays, "日历寿命", true),
    customPlayMinutes: playHours === undefined ? undefined : Math.round(playHours * 60),
    initialPlayMinutes: parseHoursInput(form.initialPlayHours, "此前已打时长"),
    boostCycleDays: parsePositive(form.boostCycleDays, "复灌周期", true),
    notes: form.notes.trim() || undefined,
  };
}

/** Like {@link formToRubberFields}, but blank optional fields are cleared (`null`) on the record. */
export function formToRubberUpdate(form: RubberFormState): UpdateRubberInput {
  const fields = formToRubberFields(form);
  return {
    name: fields.name,
    hardness: fields.hardness ?? null,
    thicknessMm: fields.thicknessMm ?? null,
    weightGrams: fields.weightGrams ?? null,
    boosted: fields.boosted,
    customCalendarDays: fields.customCalendarDays ?? null,
    customPlayMinutes: fields.customPlayMinutes ?? null,
    initialPlayMinutes: fields.initialPlayMinutes ?? null,
    boostCycleDays: fields.boostCycleDays ?? null,
    notes: fields.notes ?? null,
  };
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

  const installedAt = form.usedInstalledAt.trim();
  if (!installedAt) throw new Error(`请选择${label}的已投入使用日期`);
  const history: UsedRubberHistory = { installedAt };
  if (rubber.boosted) {
    history.priorBoostCount = parsePositive(form.priorBoostCount, "历史已灌油次数", true) ?? 1;
    history.lastBoostDate = form.lastBoostDate.trim() || undefined;
    history.boostLayers = boostLayers;
  }
  return { type: "new", rubber, initialBoostLayers: boostLayers, used: history };
}

/** "硬度 47 · 2.1 mm · 48 g · 已灌油" (or a placeholder when nothing was filled in). */
export function describeRubberSpecs(rubber: Pick<Rubber, "hardness" | "thicknessMm" | "weightGrams" | "boosted">) {
  const parts = [
    rubber.hardness ? `硬度 ${rubber.hardness}` : null,
    rubber.thicknessMm ? `${rubber.thicknessMm} mm` : null,
    rubber.weightGrams ? `${rubber.weightGrams} g` : null,
    rubber.boosted ? "已灌油" : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "未填写规格";
}

/** Summary of the life parameters a rubber overrides, or `undefined` when it uses the defaults. */
export function describeCustomLife(rubber: Pick<Rubber, "customCalendarDays" | "customPlayMinutes" | "boostCycleDays">) {
  const parts = [
    rubber.customCalendarDays ? `${rubber.customCalendarDays} 天` : null,
    rubber.customPlayMinutes ? `${formatHours(rubber.customPlayMinutes)} h` : null,
    rubber.boostCycleDays ? `复灌 ${rubber.boostCycleDays} 天` : null,
  ].filter(Boolean);
  return parts.length ? `自定义寿命 ${parts.join(" · ")}` : undefined;
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

/** `41°` / `41度` -> `41`. */
const normalizeHardness = (value: string) => value.trim().replace(/\s*(°|度)$/, "");

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
  const thicknessOptions = match ? match.thicknessOptions : DEFAULT_THICKNESS_OPTIONS;
  const hardnessOptions = match ? (match.hardnessOptions ?? []) : DEFAULT_HARDNESS_OPTIONS;
  const thickness = value.thicknessMm.trim() ? Number(value.thicknessMm) : Number.NaN;
  const selectedThickness = thicknessOptions.find((option) => Math.abs(option - thickness) < 0.001);
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
          value={selectedThickness === undefined ? "" : formatThickness(selectedThickness)}
          onChange={(next) => onChange({ ...value, thicknessMm: next })}
          options={thicknessOptions.map((option) => {
            const text = formatThickness(option);
            return { value: text, label: `${text} mm`, testId: `${testIdPrefix}-rubber-thickness-chip-${text}` };
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
              label: `${option}°`,
              testId: `${testIdPrefix}-rubber-hardness-chip-${option}`,
            }))}
          />
        </div>
      ) : null}
    </div>
  );
}

type RubberFormFieldsProps = {
  value: RubberFormState;
  onChange: (value: RubberFormState) => void;
  /** Prefix of the `data-testid`s: `${prefix}-rubber-name`, `${prefix}-rubber-hardness`, ... */
  testIdPrefix: string;
  /**
   * New rubbers (being mounted): offers 「全新胶皮」 / 「已在用老胶皮」. A fresh boosted sheet asks for
   * the first boost's layers, a used one for its installation date, play time and boost history.
   */
  isNew?: boolean;
  /** New rubbers: the day they are mounted, the latest a used sheet's installation date may be. */
  mountDate?: string;
};

export function RubberFormFields({ value, onChange, testIdPrefix, isNew = false, mountDate }: RubberFormFieldsProps) {
  const update = <K extends keyof RubberFormState>(key: K, next: RubberFormState[K]) => onChange({ ...value, [key]: next });
  // Read once so React never toggles <details> while the user works inside it.
  const [lifeOpen] = useState(() =>
    Boolean(value.calendarDays || value.playHours || value.boostCycleDays || (!isNew && value.initialPlayHours)),
  );
  const match = useMemo(() => matchRubberCatalog(value.name), [value.name]);
  const used = isNew && value.condition === "used";
  const today = todayISO();
  const latestUsedDate = mountDate && mountDate < today ? mountDate : today;
  const lifeSummary = [
    `${value.calendarDays.trim() || DEFAULT_LIFE_PARAMETERS.calendarDays} 天`,
    `${value.playHours.trim() || formatHours(DEFAULT_LIFE_PARAMETERS.playMinutes)} h`,
    `复灌 ${value.boostCycleDays.trim() || DEFAULT_LIFE_PARAMETERS.boostCycleDays} 天`,
    !isNew && value.initialPlayHours.trim() ? `录入前 ${value.initialPlayHours.trim()} h` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const priorBoosts = Math.max(1, Math.round(Number(value.priorBoostCount) || 1));
  const lastBoostDate = value.lastBoostDate || value.usedInstalledAt;
  const lastBoostText = lastBoostDate ? formatFullDate(lastBoostDate) : "上次灌油日期";
  const backfillSummary =
    priorBoosts > 1
      ? `保存时自动补记 ${priorBoosts} 次灌油：最后一次记在 ${lastBoostText}，此前 ${priorBoosts - 1} 次的日期从投入使用日起均匀估算。`
      : `保存时自动补记 1 次灌油，记在 ${lastBoostText}。`;

  /** A catalog pick also applies the rubber's presets that are still blank. */
  function pickCatalogRubber(entry: RubberEntry, name: string) {
    const next: RubberFormState = { ...value, name };
    if (isNew && entry.defaultBoosted !== undefined) next.boosted = entry.defaultBoosted;
    if (!value.hardness.trim() && entry.hardnessOptions?.length === 1) next.hardness = entry.hardnessOptions[0];
    if (!value.thicknessMm.trim() && entry.thicknessOptions.length === 1) next.thicknessMm = formatThickness(entry.thicknessOptions[0]);
    onChange(next);
  }

  return (
    <div className="grid gap-4">
      {isNew ? (
        <div className="grid gap-2">
          <FieldLabel hint={used ? "补录投入日期、已打时长和灌油历史" : "第一次贴拍的新胶皮"}>胶皮状况</FieldLabel>
          <SegmentedControl
            ariaLabel="胶皮状况"
            value={value.condition}
            onChange={(condition) => update("condition", condition)}
            options={[
              { value: "fresh", label: "全新胶皮", testId: `${testIdPrefix}-rubber-condition-fresh` },
              { value: "used", label: "已在用老胶皮", testId: `${testIdPrefix}-rubber-condition-used` },
            ]}
          />
        </div>
      ) : null}
      <CatalogPicker
        kind="rubber"
        label="胶皮名称"
        value={value.name}
        onChange={(name) => update("name", name)}
        onPick={pickCatalogRubber}
        testId={`${testIdPrefix}-rubber-name`}
        placeholder="搜索或直接输入，如 省狂 / T05 / D09c"
      />
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
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={value.thicknessMm}
          onChange={(thicknessMm) => update("thicknessMm", thicknessMm)}
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
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="已投入使用日期"
              type="date"
              max={latestUsedDate}
              required
              value={value.usedInstalledAt}
              onChange={(usedInstalledAt) => update("usedInstalledAt", usedInstalledAt)}
              testId={`${testIdPrefix}-rubber-used-installed-at`}
            />
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
            日历寿命从投入使用日期算起，此前已打时长直接计入打球寿命。
          </p>
        </div>
      ) : null}
      <CheckboxField
        label={isNew && !used ? "初始已灌油" : "已灌油"}
        description={used ? "勾选后补录历史灌油次数和上次灌油" : undefined}
        checked={value.boosted}
        onChange={(boosted) => update("boosted", boosted)}
        testId={`${testIdPrefix}-rubber-boosted`}
      />
      {isNew && value.boosted && !used ? (
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
      {used && value.boosted ? (
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
          <span className="shrink-0 text-sm font-bold text-ink">寿命与复灌参数</span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-ink/50">
            <span className="truncate">{lifeSummary}</span>
            <ChevronDown size={16} className="shrink-0 transition group-open:rotate-180" aria-hidden="true" />
          </span>
        </summary>
        <div className="grid gap-3 border-t border-ink/10 p-3">
          <div className="grid grid-cols-3 gap-2">
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
            <CompactNumberField
              label="复灌周期 · 天"
              placeholder={String(DEFAULT_LIFE_PARAMETERS.boostCycleDays)}
              value={value.boostCycleDays}
              onChange={(boostCycleDays) => update("boostCycleDays", boostCycleDays)}
              testId={`${testIdPrefix}-rubber-boost-cycle`}
            />
          </div>
          {!isNew ? (
            <div className="grid grid-cols-3 items-end gap-2">
              <CompactNumberField
                label="录入前已打 · h"
                placeholder="0"
                decimal
                min="0"
                value={value.initialPlayHours}
                onChange={(initialPlayHours) => update("initialPlayHours", initialPlayHours)}
                testId={`${testIdPrefix}-rubber-initial-hours`}
              />
              <p className="col-span-2 pb-1 text-xs font-medium leading-5 text-ink/50">开始用 App 记录前这张胶皮已打的时长，计入打球寿命。</p>
            </div>
          ) : null}
          <p className="text-xs font-medium leading-5 text-ink/50">
            留空即使用默认值：日历寿命 {DEFAULT_LIFE_PARAMETERS.calendarDays} 天、打球{" "}
            {formatHours(DEFAULT_LIFE_PARAMETERS.playMinutes)} 小时；已灌油的胶皮每{" "}
            {DEFAULT_LIFE_PARAMETERS.boostCycleDays} 天提醒复灌。
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
