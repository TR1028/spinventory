/** Picks where the rubber for one racket side comes from: keep / a new rubber / the inventory. */
import { Package } from "lucide-react";
import { useId } from "react";
import { getRubberQuantity, type Rubber } from "../db/schema";
import type { RubberSource } from "../db/store";
import { formatFullDate, formatHours } from "../utils/date";
import { calculateRubberLife } from "../utils/life";
import {
  createRubberForm,
  describeCustomLife,
  describeRubberSpecs,
  formToNewSource,
  RubberFormFields,
  RubberLabelPill,
  type RubberFormState,
} from "./RubberForm";
import { SegmentedControl, TextField, type SegmentOption } from "./ui";

export type SourceChoice = "keep" | "new" | "inventory";

export type RubberSourceState = {
  choice: SourceChoice;
  form: RubberFormState;
  inventoryId: string;
  /** Boosting inventory rubbers: layers of the boost done before gluing (blank = none logged). */
  inventoryBoostLayers: string;
};

export function createSourceState(choice: SourceChoice, form: RubberFormState = createRubberForm()): RubberSourceState {
  return { choice, form, inventoryId: "", inventoryBoostLayers: "" };
}

/**
 * Inventory offered to one side when the other side already picked `otherState`: that record is
 * left out unless it still has another sheet (`quantity` > 1).
 */
export function inventoryExcluding(inventory: Rubber[], otherState: RubberSourceState) {
  if (otherState.choice !== "inventory") return inventory;
  return inventory.filter((rubber) => rubber.id !== otherState.inventoryId || getRubberQuantity(rubber) > 1);
}

function parseBoostLayers(value: string) {
  const text = value.trim();
  if (!text) return undefined;
  const layers = Number(text);
  if (!Number.isFinite(layers) || layers <= 0) throw new Error("贴拍灌油层数需为大于 0 的整数");
  return Math.max(1, Math.round(layers));
}

/**
 * Converts the picker state into a store `RubberSource`; `null` means "leave the slot as it is".
 * `inventory` is the list the picker showed (a stale selection is rejected). Throws on bad input.
 */
export function resolveRubberSource(state: RubberSourceState, inventory: Rubber[], label = "胶皮"): RubberSource | null {
  if (state.choice === "keep") return null;
  if (state.choice === "new") return formToNewSource(state.form, label);
  const rubber = inventory.find((item) => item.id === state.inventoryId);
  if (!rubber) throw new Error(`请从囤货中选择${label}`);
  const boostLayers = rubber.boosted ? parseBoostLayers(state.inventoryBoostLayers) : undefined;
  return boostLayers ? { type: "inventory", rubberId: rubber.id, boostLayers } : { type: "inventory", rubberId: rubber.id };
}

/** One line about an inventory rubber's state: `×3 张` for stock, used life for taken-off sheets. */
export function describeInventoryState(rubber: Rubber) {
  if (!rubber.installedAt) {
    const count = getRubberQuantity(rubber);
    return count > 1 ? `全新未拆 · ${count} 张` : "全新未拆";
  }
  const life = calculateRubberLife(rubber, []);
  return `用过 · 首贴 ${formatFullDate(rubber.installedAt)} · 已打 ${formatHours(life.playMinutes)} h · 寿命 ${Math.round(life.usedPercent)}%`;
}

/** 「贴拍前灌油」 for a boosting rubber taken from the inventory. */
export function MountBoostField({
  value,
  onChange,
  testId,
}: {
  value: string;
  onChange: (value: string) => void;
  testId: string;
}) {
  return (
    <TextField
      label="贴拍前灌油层数"
      hint="选填，留空不记录"
      type="number"
      inputMode="numeric"
      min="1"
      step="1"
      placeholder="如 2"
      value={value}
      onChange={onChange}
      testId={testId}
    />
  );
}

type RubberSourcePickerProps = {
  value: RubberSourceState;
  onChange: (value: RubberSourceState) => void;
  choices: readonly SourceChoice[];
  /** Label of the `keep` choice, e.g. 保留当前 / 暂不贴. */
  keepLabel?: string;
  /** Unmounted rubbers that may be picked. */
  inventory: Rubber[];
  testIdPrefix: string;
  ariaLabel: string;
  /** Day the rubber is mounted (replace / activate flows): a used sheet's installation date may not be later. */
  mountDate?: string;
};

export function RubberSourcePicker({
  value,
  onChange,
  choices,
  keepLabel = "暂不贴",
  inventory,
  testIdPrefix,
  ariaLabel,
  mountDate,
}: RubberSourcePickerProps) {
  const groupName = useId();
  const selected = inventory.find((rubber) => rubber.id === value.inventoryId);
  const labels: Record<SourceChoice, string> = {
    keep: keepLabel,
    new: "录入胶皮",
    inventory: inventory.length ? `从囤货选 (${inventory.length})` : "从囤货选",
  };
  const options: SegmentOption<SourceChoice>[] = choices.map((choice) => ({
    value: choice,
    label: labels[choice],
    testId: `${testIdPrefix}-source-${choice}`,
  }));

  function selectChoice(choice: SourceChoice) {
    // Preselect the first inventory rubber so a single tap is enough in the common case.
    const inventoryId = choice === "inventory" && !selected ? (inventory[0]?.id ?? "") : value.inventoryId;
    onChange({ ...value, choice, inventoryId });
  }

  return (
    <div className="grid gap-4">
      <SegmentedControl ariaLabel={ariaLabel} options={options} value={value.choice} onChange={selectChoice} />

      {value.choice === "new" ? (
        <RubberFormFields
          value={value.form}
          onChange={(form) => onChange({ ...value, form })}
          testIdPrefix={testIdPrefix}
          variant="mount"
          mountDate={mountDate}
        />
      ) : null}

      {value.choice === "inventory" && inventory.length ? (
        <div className="grid max-h-72 gap-2 overflow-y-auto p-0.5" role="radiogroup" aria-label="选择囤货胶皮">
          {inventory.map((rubber) => {
            const isSelected = rubber.id === selected?.id;
            const customLife = describeCustomLife(rubber);
            const count = getRubberQuantity(rubber);
            return (
              <label
                key={rubber.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ${
                  isSelected ? "border-court bg-court/5 ring-2 ring-court/15" : "border-ink/10 bg-white"
                }`}
              >
                <input
                  type="radio"
                  name={groupName}
                  checked={isSelected}
                  onChange={() => onChange({ ...value, inventoryId: rubber.id })}
                  className="mt-1 h-4 w-4 shrink-0 accent-court"
                  data-testid={`${testIdPrefix}-inventory-option-${rubber.id}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-ink">{rubber.name}</span>
                    <RubberLabelPill label={rubber.label} />
                    {count > 1 ? <span className="shrink-0 text-xs font-black text-court">×{count}</span> : null}
                  </span>
                  <span className="mt-0.5 block text-xs font-medium text-ink/55">{describeRubberSpecs(rubber)}</span>
                  <span className={`mt-0.5 block text-xs font-semibold ${rubber.installedAt ? "text-amber-700" : "text-ink/45"}`}>
                    {describeInventoryState(rubber)}
                  </span>
                  {customLife ? <span className="mt-0.5 block text-xs font-semibold text-court">{customLife}</span> : null}
                  {rubber.notes ? <span className="mt-0.5 block truncate text-xs text-ink/45">{rubber.notes}</span> : null}
                </span>
              </label>
            );
          })}
        </div>
      ) : null}

      {value.choice === "inventory" && selected?.boosted ? (
        <MountBoostField
          value={value.inventoryBoostLayers}
          onChange={(inventoryBoostLayers) => onChange({ ...value, inventoryBoostLayers })}
          testId={`${testIdPrefix}-inventory-boost-layers`}
        />
      ) : null}

      {value.choice === "inventory" && !inventory.length ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-ink/15 bg-white/60 px-3 py-4 text-sm font-medium text-ink/55">
          <Package size={18} className="shrink-0" aria-hidden="true" />
          囤货库里没有可用的闲置胶皮，可以改选「录入胶皮」。
        </div>
      ) : null}
    </div>
  );
}
