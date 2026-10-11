/** Blade details (grip, weights, service history): form state, editor fields and display badges. */
import { CalendarClock, Hand, Scale } from "lucide-react";
import { GRIP_TYPES, gripTypeLabel, type GripType, type Racket } from "../db/schema";
import type { RacketSpecs, UpdateRacketInput } from "../db/store";
import { daysBetween, hoursInputValue, parseHoursInput, todayISO } from "../utils/date";
import { ChoiceChips, FieldLabel, TextField } from "./ui";

/** Raw input values of the blade details; blank means "not recorded". */
export type RacketSpecForm = {
  gripType: GripType | "";
  bladeWeightGrams: string;
  totalWeightGrams: string;
  /** `YYYY-MM-DD` the blade was first put into service. */
  startedAt: string;
  /** Play time on the blade before it was recorded in the app, in hours. */
  initialPlayHours: string;
};

const numberText = (value: number | undefined) => (value === undefined ? "" : String(value));

export function createRacketSpecForm(racket?: Pick<Racket, keyof RacketSpecs>): RacketSpecForm {
  return {
    gripType: racket?.gripType ?? "",
    bladeWeightGrams: numberText(racket?.bladeWeightGrams),
    totalWeightGrams: numberText(racket?.totalWeightGrams),
    startedAt: racket?.startedAt ?? "",
    initialPlayHours: hoursInputValue(racket?.initialPlayMinutes),
  };
}

function parseGrams(value: string, label: string) {
  const text = value.trim();
  if (!text) return undefined;
  const grams = Number(text);
  if (!Number.isFinite(grams) || grams <= 0) throw new Error(`${label}需为大于 0 的数字`);
  return grams;
}

/** Validates the blade details (throws with a Chinese message) for `createRacket`. */
export function specFormToInput(form: RacketSpecForm): RacketSpecs {
  return {
    gripType: form.gripType || undefined,
    bladeWeightGrams: parseGrams(form.bladeWeightGrams, "底板重量"),
    totalWeightGrams: parseGrams(form.totalWeightGrams, "整拍重量"),
    startedAt: form.startedAt.trim() || undefined,
    initialPlayMinutes: parseHoursInput(form.initialPlayHours, "底板此前已打时长"),
  };
}

/** Like {@link specFormToInput}, but blank fields clear the stored value (`null`) for `updateRacket`. */
export function specFormToUpdate(form: RacketSpecForm): Pick<UpdateRacketInput, keyof RacketSpecs> {
  const specs = specFormToInput(form);
  return {
    gripType: specs.gripType ?? null,
    bladeWeightGrams: specs.bladeWeightGrams ?? null,
    totalWeightGrams: specs.totalWeightGrams ?? null,
    startedAt: specs.startedAt ?? null,
    initialPlayMinutes: specs.initialPlayMinutes ?? null,
  };
}

/** Grip chips plus weight / service-history inputs; `data-testid`s are `${testIdPrefix}-grip-FL`, `${testIdPrefix}-blade-weight`, ... */
export function RacketSpecFields({
  value,
  onChange,
  testIdPrefix,
}: {
  value: RacketSpecForm;
  onChange: (value: RacketSpecForm) => void;
  testIdPrefix: string;
}) {
  const update = <K extends keyof RacketSpecForm>(key: K, next: RacketSpecForm[K]) => onChange({ ...value, [key]: next });

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <FieldLabel hint="再点一次可取消">握拍 / 柄型</FieldLabel>
        <ChoiceChips
          ariaLabel="握拍柄型"
          value={value.gripType}
          onChange={(gripType) => update("gripType", gripType)}
          options={GRIP_TYPES.map((grip) => ({ value: grip, label: gripTypeLabel[grip], testId: `${testIdPrefix}-grip-${grip}` }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <TextField
          label="底板重量 g"
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          placeholder="如 89"
          value={value.bladeWeightGrams}
          onChange={(bladeWeightGrams) => update("bladeWeightGrams", bladeWeightGrams)}
          testId={`${testIdPrefix}-blade-weight`}
        />
        <TextField
          label="整拍重量 g"
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          placeholder="如 188"
          value={value.totalWeightGrams}
          onChange={(totalWeightGrams) => update("totalWeightGrams", totalWeightGrams)}
          testId={`${testIdPrefix}-total-weight`}
        />
        <TextField
          label="底板启用日期"
          type="date"
          max={todayISO()}
          value={value.startedAt}
          onChange={(startedAt) => update("startedAt", startedAt)}
          testId={`${testIdPrefix}-started-at`}
        />
        <TextField
          label="录入前已打 · 小时"
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          placeholder="0"
          value={value.initialPlayHours}
          onChange={(initialPlayHours) => update("initialPlayHours", initialPlayHours)}
          testId={`${testIdPrefix}-initial-hours`}
        />
      </div>
    </div>
  );
}

type SpecBadge = { key: "grip" | "weight" | "service"; text: string };

const gramsText = (grams: number) => `${Math.round(grams * 10) / 10}g`;

/** Display texts: grip (`横板 FL`), weights (`整拍 188g · 裸板 89g`), service (`底板已服役 30 天`). */
export function describeRacketSpecs(racket: Pick<Racket, keyof RacketSpecs>, today = todayISO()): SpecBadge[] {
  const badges: SpecBadge[] = [];
  const grip = racket.gripType ? gripTypeLabel[racket.gripType] : undefined;
  if (grip) badges.push({ key: "grip", text: grip });
  const weights = [
    racket.totalWeightGrams ? `整拍 ${gramsText(racket.totalWeightGrams)}` : null,
    racket.bladeWeightGrams ? `裸板 ${gramsText(racket.bladeWeightGrams)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  if (weights) badges.push({ key: "weight", text: weights });
  if (racket.startedAt) badges.push({ key: "service", text: `底板已服役 ${daysBetween(racket.startedAt, today)} 天` });
  return badges;
}

const badgeIcons = { grip: Hand, weight: Scale, service: CalendarClock } as const;

/** Grip / weight / service chips of a racket; renders nothing when no detail is recorded. */
export function RacketSpecBadges({
  racket,
  tone = "light",
  className = "",
}: {
  racket: Racket;
  /** `dark` for the dark racket header. */
  tone?: "light" | "dark";
  className?: string;
}) {
  const badges = describeRacketSpecs(racket);
  if (!badges.length) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`} data-testid={`racket-specs-${racket.id}`}>
      {badges.map(({ key, text }) => {
        const Icon = badgeIcons[key];
        return (
          <span
            key={key}
            data-testid={`racket-spec-${key}-${racket.id}`}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
              tone === "dark" ? "bg-white/10 text-white/80" : "bg-ink/5 text-ink/60"
            }`}
          >
            <Icon size={12} aria-hidden="true" />
            {text}
          </span>
        );
      })}
    </div>
  );
}
