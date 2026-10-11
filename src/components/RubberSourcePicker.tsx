/** Picks where the rubber for one racket side comes from: keep / a new rubber / the inventory. */
import { Package } from "lucide-react";
import { useId } from "react";
import type { Rubber } from "../db/schema";
import type { RubberSource } from "../db/store";
import {
  createRubberForm,
  describeCustomLife,
  describeRubberSpecs,
  formToNewSource,
  RubberFormFields,
  type RubberFormState,
} from "./RubberForm";
import { SegmentedControl, type SegmentOption } from "./ui";

export type SourceChoice = "keep" | "new" | "inventory";

export type RubberSourceState = { choice: SourceChoice; form: RubberFormState; inventoryId: string };

export function createSourceState(choice: SourceChoice, form: RubberFormState = createRubberForm()): RubberSourceState {
  return { choice, form, inventoryId: "" };
}

/**
 * Converts the picker state into a store `RubberSource`; `null` means "leave the slot as it is".
 * `inventory` is the list the picker showed (a stale selection is rejected). Throws on bad input.
 */
export function resolveRubberSource(state: RubberSourceState, inventory: Rubber[], label = "胶皮"): RubberSource | null {
  if (state.choice === "keep") return null;
  if (state.choice === "new") return formToNewSource(state.form, label);
  if (!inventory.some((rubber) => rubber.id === state.inventoryId)) throw new Error(`请从囤货中选择${label}`);
  return { type: "inventory", rubberId: state.inventoryId };
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
  const selectedId = inventory.some((rubber) => rubber.id === value.inventoryId) ? value.inventoryId : "";
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
    // Preselect the newest inventory rubber so a single tap is enough in the common case.
    const inventoryId = choice === "inventory" && !selectedId ? (inventory[0]?.id ?? "") : value.inventoryId;
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
          isNew
          mountDate={mountDate}
        />
      ) : null}

      {value.choice === "inventory" && inventory.length ? (
        <div className="grid max-h-72 gap-2 overflow-y-auto p-0.5" role="radiogroup" aria-label="选择囤货胶皮">
          {inventory.map((rubber) => {
            const selected = rubber.id === selectedId;
            const customLife = describeCustomLife(rubber);
            return (
              <label
                key={rubber.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ${
                  selected ? "border-court bg-court/5 ring-2 ring-court/15" : "border-ink/10 bg-white"
                }`}
              >
                <input
                  type="radio"
                  name={groupName}
                  checked={selected}
                  onChange={() => onChange({ ...value, inventoryId: rubber.id })}
                  className="mt-1 h-4 w-4 shrink-0 accent-court"
                  data-testid={`${testIdPrefix}-inventory-option-${rubber.id}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink">{rubber.name}</span>
                  <span className="mt-0.5 block text-xs font-medium text-ink/55">{describeRubberSpecs(rubber)}</span>
                  {customLife ? <span className="mt-0.5 block text-xs font-semibold text-court">{customLife}</span> : null}
                  {rubber.notes ? <span className="mt-0.5 block truncate text-xs text-ink/45">{rubber.notes}</span> : null}
                </span>
              </label>
            );
          })}
        </div>
      ) : null}

      {value.choice === "inventory" && !inventory.length ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-ink/15 bg-white/60 px-3 py-4 text-sm font-medium text-ink/55">
          <Package size={18} className="shrink-0" aria-hidden="true" />
          囤货库里没有可用的闲置胶皮，可以改选「新胶皮」。
        </div>
      ) : null}
    </div>
  );
}
