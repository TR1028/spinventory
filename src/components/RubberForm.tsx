/** Rubber form state, its conversions to store inputs, and the shared rubber editor fields. */
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { Rubber } from "../db/schema";
import type { RubberFields, RubberSource, UpdateRubberInput } from "../db/store";
import { formatHours } from "../utils/date";
import { DEFAULT_LIFE_PARAMETERS } from "../utils/life";
import { CheckboxField, TextAreaField, TextField, inputClass } from "./ui";

/** Raw input values; blank life parameters mean "use the default". */
export type RubberFormState = {
  name: string;
  hardness: string;
  thicknessMm: string;
  boosted: boolean;
  /** Layers of the first boost logged when a new boosted rubber is mounted. */
  boostLayers: string;
  calendarDays: string;
  playHours: string;
  boostCycleDays: string;
  notes: string;
};

export function createRubberForm(overrides: Partial<RubberFormState> = {}): RubberFormState {
  return {
    name: "",
    hardness: "",
    thicknessMm: "",
    boosted: false,
    boostLayers: "2",
    calendarDays: "",
    playHours: "",
    boostCycleDays: "",
    notes: "",
    ...overrides,
  };
}

const numberText = (value: number | undefined) => (value === undefined ? "" : String(value));

export function rubberToForm(rubber: Rubber): RubberFormState {
  return createRubberForm({
    name: rubber.name,
    hardness: rubber.hardness ?? "",
    thicknessMm: numberText(rubber.thicknessMm),
    boosted: rubber.boosted,
    calendarDays: numberText(rubber.customCalendarDays),
    playHours: rubber.customPlayMinutes === undefined ? "" : formatHours(rubber.customPlayMinutes),
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
    boosted: form.boosted,
    customCalendarDays: parsePositive(form.calendarDays, "日历寿命", true),
    customPlayMinutes: playHours === undefined ? undefined : Math.round(playHours * 60),
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
    boosted: fields.boosted,
    customCalendarDays: fields.customCalendarDays ?? null,
    customPlayMinutes: fields.customPlayMinutes ?? null,
    boostCycleDays: fields.boostCycleDays ?? null,
    notes: fields.notes ?? null,
  };
}

/** A brand-new rubber to mount; a boosted one also logs its first boost. */
export function formToNewSource(form: RubberFormState, label?: string): RubberSource {
  const rubber = formToRubberFields(form, label);
  const initialBoostLayers = rubber.boosted ? (parsePositive(form.boostLayers, "初始灌油层数", true) ?? 1) : undefined;
  return { type: "new", rubber, initialBoostLayers };
}

/** "硬度 47 · 2.1 mm · 已灌油" (or a placeholder when nothing was filled in). */
export function describeRubberSpecs(rubber: Pick<Rubber, "hardness" | "thicknessMm" | "boosted">) {
  const parts = [
    rubber.hardness ? `硬度 ${rubber.hardness}` : null,
    rubber.thicknessMm ? `${rubber.thicknessMm} mm` : null,
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  testId: string;
  decimal?: boolean;
}) {
  return (
    <label className="grid min-w-0 gap-1.5">
      <span className="truncate text-xs font-bold text-ink/70">{label}</span>
      <input
        type="number"
        inputMode={decimal ? "decimal" : "numeric"}
        min="1"
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

type RubberFormFieldsProps = {
  value: RubberFormState;
  onChange: (value: RubberFormState) => void;
  /** Prefix of the `data-testid`s: `${prefix}-rubber-name`, `${prefix}-rubber-hardness`, ... */
  testIdPrefix: string;
  /** New rubbers: the checkbox reads "初始已灌油" and asks for the first boost's layers. */
  isNew?: boolean;
};

export function RubberFormFields({ value, onChange, testIdPrefix, isNew = false }: RubberFormFieldsProps) {
  const update = <K extends keyof RubberFormState>(key: K, next: RubberFormState[K]) => onChange({ ...value, [key]: next });
  // Read once so React never toggles <details> while the user works inside it.
  const [lifeOpen] = useState(() => Boolean(value.calendarDays || value.playHours || value.boostCycleDays));
  const lifeSummary = [
    `${value.calendarDays.trim() || DEFAULT_LIFE_PARAMETERS.calendarDays} 天`,
    `${value.playHours.trim() || formatHours(DEFAULT_LIFE_PARAMETERS.playMinutes)} h`,
    `复灌 ${value.boostCycleDays.trim() || DEFAULT_LIFE_PARAMETERS.boostCycleDays} 天`,
  ].join(" · ");

  return (
    <div className="grid gap-4">
      <TextField
        label="胶皮名称"
        value={value.name}
        onChange={(name) => update("name", name)}
        testId={`${testIdPrefix}-rubber-name`}
        autoComplete="off"
      />
      <div className="grid grid-cols-2 gap-3">
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
      </div>
      <CheckboxField
        label={isNew ? "初始已灌油" : "已灌油"}
        checked={value.boosted}
        onChange={(boosted) => update("boosted", boosted)}
        testId={`${testIdPrefix}-rubber-boosted`}
      />
      {isNew && value.boosted ? (
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
        placeholder="批次、购买渠道、重量…"
        value={value.notes}
        onChange={(notes) => update("notes", notes)}
        testId={`${testIdPrefix}-rubber-notes`}
      />
    </div>
  );
}
