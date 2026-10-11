import { ArrowLeft, Check, Plus } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { CatalogPicker } from "../components/CatalogPicker";
import { RacketSpecFields, createRacketSpecForm, specFormToInput } from "../components/RacketSpecs";
import { createRubberForm } from "../components/RubberForm";
import { RubberSourcePicker, createSourceState, resolveRubberSource, type RubberSourceState } from "../components/RubberSourcePicker";
import { ErrorBanner, Notice, TextAreaField, TextField, useAsyncAction } from "../components/ui";
import { getInventoryRubbers } from "../db/domain";
import { RUBBER_SIDES, rubberSideName, type RubberSide } from "../db/schema";
import { useAppData } from "../db/store";
import { todayISO } from "../utils/date";

type AddRacketProps = {
  onBack: () => void;
  onCreated: (racketId: string) => void;
};

const testIdPrefixes: Record<RubberSide, string> = {
  forehand: "new-forehand",
  backhand: "new-backhand",
};

export function AddRacket({ onBack, onCreated }: AddRacketProps) {
  const { data, createRacket } = useAppData();
  const inventory = useMemo(() => getInventoryRubbers(data), [data]);
  const [name, setName] = useState("");
  const [blade, setBlade] = useState("");
  const [installedAt, setInstalledAt] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [specs, setSpecs] = useState(() => createRacketSpecForm());
  const [sources, setSources] = useState<Record<RubberSide, RubberSourceState>>(() => ({
    forehand: createSourceState("new", createRubberForm({ boosted: true })),
    backhand: createSourceState("new"),
  }));
  const action = useAsyncAction();
  const bareBlade = sources.forehand.choice === "keep" && sources.backhand.choice === "keep";

  /** Inventory offered to one side, without the rubber the other side already picked. */
  const inventoryFor = (side: RubberSide) => {
    const other = sources[side === "forehand" ? "backhand" : "forehand"];
    return other.choice === "inventory" ? inventory.filter((rubber) => rubber.id !== other.inventoryId) : inventory;
  };

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void action.run(async () => {
      const bladeName = blade.trim();
      if (!bladeName) throw new Error("请填写底板");
      const specInput = specFormToInput(specs);
      const forehand = resolveRubberSource(sources.forehand, inventoryFor("forehand"), "正手胶皮") ?? undefined;
      const backhand = resolveRubberSource(sources.backhand, inventoryFor("backhand"), "反手胶皮") ?? undefined;
      const racketId = await createRacket({
        ...specInput,
        // The racket name is optional and defaults to the blade, like spare blades in the inventory.
        name: name.trim() || bladeName,
        blade: bladeName,
        installedAt,
        notes: notes.trim() || undefined,
        forehand,
        backhand,
      });
      onCreated(racketId);
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-4 sm:px-6 lg:gap-6 lg:px-8 lg:py-8">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="tap-target inline-flex items-center justify-center rounded-full bg-white text-ink shadow-sm ring-1 ring-ink/10 transition active:scale-95"
          aria-label="返回"
          title="返回"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <div className="rounded-full bg-limeglass px-3 py-1 text-xs font-bold text-court">新增球拍</div>
      </div>

      <header>
        <h1 className="text-3xl font-black tracking-normal text-ink">新增球拍</h1>
        <p className="mt-2 text-sm font-medium text-ink/56">先建立当前配置，后续再记录打球和灌油。</p>
      </header>

      <form onSubmit={handleSubmit} className="grid gap-5">
        <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
          <h2 className="text-base font-black text-ink">球拍信息</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3 md:items-start">
            <CatalogPicker
              kind="blade"
              label="底板"
              value={blade}
              onChange={setBlade}
              testId="new-racket-blade"
              placeholder="搜索或直接输入，如 vis / 龙5 / fzd"
              className="md:col-span-2"
            />
            <TextField
              label="球拍名"
              hint="选填，默认同底板"
              value={name}
              onChange={setName}
              placeholder={blade.trim() || "如 主力拍"}
              autoComplete="off"
              testId="new-racket-name"
            />
            <div className="grid gap-3 rounded-lg border border-ink/10 bg-paper p-3 md:col-span-3">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-black text-ink">底板规格与服役</h3>
                <span className="text-xs font-medium text-ink/45">均为选填</span>
              </div>
              <RacketSpecFields value={specs} onChange={setSpecs} testIdPrefix="new-racket" />
            </div>
            <TextField
              label="胶皮安装日期"
              hint="全新胶皮从这天算起"
              type="date"
              value={installedAt}
              onChange={setInstalledAt}
              testId="new-racket-installed-at"
            />
            <div className="md:col-span-2">
              <TextAreaField label="备注" hint="选填" value={notes} onChange={setNotes} testId="new-racket-notes" />
            </div>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
          {RUBBER_SIDES.map((side) => (
            <section key={side} className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
              <h2 className="text-base font-black text-ink">{rubberSideName[side]}胶皮</h2>
              <div className="mt-4">
                <RubberSourcePicker
                  value={sources[side]}
                  onChange={(next) => setSources((current) => ({ ...current, [side]: next }))}
                  choices={["new", "inventory", "keep"]}
                  keepLabel="暂不贴"
                  inventory={inventoryFor(side)}
                  testIdPrefix={testIdPrefixes[side]}
                  ariaLabel={`${rubberSideName[side]}胶皮来源`}
                />
              </div>
            </section>
          ))}
        </div>

        {bareBlade ? <Notice tone="muted">两面都不贴时，这块球拍会作为闲置底板放进囤货，之后可以随时配胶启用。</Notice> : null}

        <ErrorBanner message={action.error} />

        <button
          data-testid="create-racket-button"
          type="submit"
          disabled={action.pending}
          className="tap-target mb-3 inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-4 text-base font-black text-white shadow-soft transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-ink/40"
        >
          {action.pending ? <Check size={20} aria-hidden="true" /> : <Plus size={20} aria-hidden="true" />}
          {action.pending ? "保存中" : "创建球拍"}
        </button>
      </form>
    </div>
  );
}
