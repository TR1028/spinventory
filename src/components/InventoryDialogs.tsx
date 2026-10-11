/** Dialogs of the inventory page: add / edit spare rubbers and blades, mount a rubber, activate a blade. */
import { Boxes, Check, Link2, PackagePlus, Sparkles } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { getInventoryRubbers, getMountedRubber } from "../db/domain";
import { getRacketStatus, RUBBER_SIDES, rubberSideName, type AppSnapshot, type Racket, type Rubber, type RubberSide } from "../db/schema";
import { useAppData } from "../db/store";
import { todayISO } from "../utils/date";
import { sortRackets } from "../utils/rackets";
import {
  createRubberForm,
  describeRubberSpecs,
  formToRubberFields,
  formToRubberUpdate,
  rubberToForm,
  RubberFormFields,
} from "./RubberForm";
import { RubberSourcePicker, createSourceState, resolveRubberSource, type RubberSourceState } from "./RubberSourcePicker";
import {
  CheckboxField,
  EmptyState,
  ErrorBanner,
  FieldLabel,
  Modal,
  Notice,
  SegmentedControl,
  TextAreaField,
  TextField,
  buttonClass,
  inputClass,
  useAsyncAction,
} from "./ui";

// ---------------------------------------------------------------------------
// Spare rubbers
// ---------------------------------------------------------------------------

/** Adds a rubber to the inventory, or edits one (`rubber`). */
export function RubberFormModal({ rubber, onClose }: { rubber?: Rubber; onClose: () => void }) {
  const { createRubber, updateRubber } = useAppData();
  const [form, setForm] = useState(() => (rubber ? rubberToForm(rubber) : createRubberForm()));
  const action = useAsyncAction();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void action.run(async () => {
      if (rubber) await updateRubber(rubber.id, formToRubberUpdate(form));
      else await createRubber(formToRubberFields(form));
      onClose();
    });
  }

  return (
    <Modal
      title={rubber ? "编辑囤货胶皮" : "添加囤货胶皮"}
      description="还没贴拍的胶皮不计算寿命，贴到球拍后才开始计时。"
      onClose={onClose}
      testId="rubber-form-modal"
    >
      <form onSubmit={handleSubmit} className="grid gap-4">
        <RubberFormFields value={form} onChange={setForm} testIdPrefix="inventory" />
        <ErrorBanner message={action.error} />
        <button type="submit" disabled={action.pending} className={buttonClass.primary} data-testid="inventory-rubber-submit">
          {rubber ? <Check size={18} aria-hidden="true" /> : <PackagePlus size={18} aria-hidden="true" />}
          {action.pending ? "保存中…" : rubber ? "保存修改" : "加入囤货"}
        </button>
      </form>
    </Modal>
  );
}

function preferredSide(data: AppSnapshot, racket: Racket): RubberSide {
  return RUBBER_SIDES.find((side) => !getMountedRubber(data, racket, side)) ?? "forehand";
}

/** 「贴到球拍」: mounts an inventory rubber, retiring whatever is on the chosen side. */
export function MountRubberModal({ rubber, onClose }: { rubber: Rubber; onClose: () => void }) {
  const { data, replaceRubber, updateRacket } = useAppData();
  const rackets = useMemo(
    () => sortRackets(data.rackets.filter((racket) => getRacketStatus(racket) !== "retired")),
    [data.rackets],
  );
  const activeRackets = rackets.filter((racket) => getRacketStatus(racket) === "active");
  const spareRackets = rackets.filter((racket) => getRacketStatus(racket) === "inventory");
  const [racketId, setRacketId] = useState(() => rackets[0]?.id ?? "");
  const [side, setSide] = useState<RubberSide>(() => (rackets[0] ? preferredSide(data, rackets[0]) : "forehand"));
  const [date, setDate] = useState(todayISO);
  const [activate, setActivate] = useState(true);
  const action = useAsyncAction();

  const racket = rackets.find((item) => item.id === racketId);
  const occupant = racket ? getMountedRubber(data, racket, side) : undefined;
  const isSpare = racket ? getRacketStatus(racket) === "inventory" : false;

  function selectRacket(nextId: string) {
    setRacketId(nextId);
    const next = rackets.find((item) => item.id === nextId);
    if (next) setSide(preferredSide(data, next));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void action.run(async () => {
      if (!racket) throw new Error("请选择要贴的球拍");
      await replaceRubber(racket.id, { side, date, source: { type: "inventory", rubberId: rubber.id } });
      if (isSpare && activate) await updateRacket(racket.id, { status: "active" });
      onClose();
    });
  }

  return (
    <Modal title="贴到球拍" description={`${rubber.name} · ${describeRubberSpecs(rubber)}`} onClose={onClose} testId="mount-rubber-modal">
      {rackets.length ? (
        <form onSubmit={handleSubmit} className="grid gap-4">
          <label className="grid gap-2">
            <FieldLabel>球拍</FieldLabel>
            <select
              value={racketId}
              onChange={(event) => selectRacket(event.target.value)}
              className={inputClass}
              data-testid="mount-racket-select"
            >
              {activeRackets.length ? (
                <optgroup label="在用球拍">
                  {activeRackets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {spareRackets.length ? (
                <optgroup label="闲置底板">
                  {spareRackets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.blade}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </label>

          <div className="grid gap-2">
            <FieldLabel>位置</FieldLabel>
            <SegmentedControl
              ariaLabel="贴在正手还是反手"
              value={side}
              onChange={setSide}
              options={RUBBER_SIDES.map((item) => ({
                value: item,
                label: `${rubberSideName[item]}${racket && getMountedRubber(data, racket, item) ? "" : " · 空位"}`,
                testId: `mount-side-${item}`,
              }))}
            />
          </div>

          {occupant ? (
            <Notice tone="warn" testId="mount-occupant-notice">
              该位置当前是「{occupant.name}」，贴上后它会自动退役，移入历任退役胶皮档案。
            </Notice>
          ) : (
            <Notice tone="info">该位置目前空着，贴上后开始计算寿命。</Notice>
          )}

          <TextField
            label="贴拍日期"
            type="date"
            value={date}
            onChange={setDate}
            min={occupant?.installedAt}
            required
            testId="mount-date"
          />

          {isSpare ? (
            <CheckboxField
              label="同时启用这块底板"
              description="移到首页的在用球拍"
              checked={activate}
              onChange={setActivate}
              testId="mount-activate"
            />
          ) : null}

          <ErrorBanner message={action.error} />
          <button type="submit" disabled={action.pending} className={buttonClass.court} data-testid="mount-submit">
            <Link2 size={18} aria-hidden="true" />
            {action.pending ? "保存中…" : "贴到球拍"}
          </button>
        </form>
      ) : (
        <EmptyState
          icon={<Boxes size={20} aria-hidden="true" />}
          title="还没有可以贴胶皮的球拍"
          description="先新增球拍，或在闲置底板库里添加备用底板。"
        />
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Spare blades
// ---------------------------------------------------------------------------

/** Adds a spare blade (a racket with status `inventory` and no rubbers), or edits one (`racket`). */
export function BladeFormModal({ racket, onClose }: { racket?: Racket; onClose: () => void }) {
  const { createRacket, updateRacket } = useAppData();
  const [blade, setBlade] = useState(racket?.blade ?? "");
  const [name, setName] = useState(racket?.name ?? "");
  const [notes, setNotes] = useState(racket?.notes ?? "");
  const action = useAsyncAction();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void action.run(async () => {
      const bladeName = blade.trim();
      if (!bladeName) throw new Error("请填写底板型号");
      const racketName = name.trim() || bladeName;
      if (racket) await updateRacket(racket.id, { name: racketName, blade: bladeName, notes: notes.trim() || null });
      else await createRacket({ name: racketName, blade: bladeName, notes: notes.trim() || undefined, status: "inventory" });
      onClose();
    });
  }

  return (
    <Modal
      title={racket ? "编辑底板" : "添加闲置底板"}
      description="备用底板先放在囤货里，配好胶皮后一键启用。"
      onClose={onClose}
      testId="blade-form-modal"
    >
      <form onSubmit={handleSubmit} className="grid gap-4">
        <TextField label="底板型号" value={blade} onChange={setBlade} autoComplete="off" testId="blade-form-blade" />
        <TextField
          label="名称"
          hint="选填，默认同底板型号"
          value={name}
          onChange={setName}
          autoComplete="off"
          testId="blade-form-name"
        />
        <TextAreaField label="备注" hint="选填" value={notes} onChange={setNotes} testId="blade-form-notes" />
        <ErrorBanner message={action.error} />
        <button type="submit" disabled={action.pending} className={buttonClass.primary} data-testid="blade-form-submit">
          <Check size={18} aria-hidden="true" />
          {action.pending ? "保存中…" : racket ? "保存修改" : "加入囤货"}
        </button>
      </form>
    </Modal>
  );
}

/** 「配胶启用」: mounts rubbers on a spare blade (new or from the inventory) and makes it active. */
export function ActivateBladeModal({ racket, onClose }: { racket: Racket; onClose: () => void }) {
  const { data, replaceRubber, updateRacket } = useAppData();
  const inventory = useMemo(() => getInventoryRubbers(data), [data]);
  const mounted: Record<RubberSide, Rubber | undefined> = {
    forehand: getMountedRubber(data, racket, "forehand"),
    backhand: getMountedRubber(data, racket, "backhand"),
  };
  const [date, setDate] = useState(todayISO);
  const [sources, setSources] = useState<Record<RubberSide, RubberSourceState>>(() => ({
    forehand: createSourceState(mounted.forehand ? "keep" : "new"),
    backhand: createSourceState(mounted.backhand ? "keep" : "new"),
  }));
  const action = useAsyncAction();

  /** Inventory offered to one side, without the rubber the other side already picked. */
  const inventoryFor = (side: RubberSide) => {
    const other = sources[side === "forehand" ? "backhand" : "forehand"];
    return other.choice === "inventory" ? inventory.filter((rubber) => rubber.id !== other.inventoryId) : inventory;
  };

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void action.run(async () => {
      const plan = RUBBER_SIDES.map((side) => ({
        side,
        source: resolveRubberSource(sources[side], inventoryFor(side), `${rubberSideName[side]}胶皮`),
      }));
      if (!plan.some(({ side, source }) => source || mounted[side])) throw new Error("至少贴上一面胶皮才能启用这块底板");

      for (const { side, source } of plan) {
        if (!source) continue;
        await replaceRubber(racket.id, { side, date, source });
        // This side is done: a retry after a later failure must not mount it again.
        setSources((current) => ({ ...current, [side]: createSourceState("keep") }));
      }
      await updateRacket(racket.id, { status: "active" });
      onClose();
    });
  }

  return (
    <Modal title="配胶启用" description={`${racket.name} · ${racket.blade}`} onClose={onClose} testId="activate-blade-modal">
      <form onSubmit={handleSubmit} className="grid gap-4">
        <p className="text-sm font-medium leading-6 text-ink/65">为两面选好胶皮，保存后这块底板会移到首页的在用球拍。</p>
        <TextField label="贴拍日期" type="date" value={date} onChange={setDate} required testId="activate-date" />

        {RUBBER_SIDES.map((side) => {
          const current = mounted[side];
          const source = sources[side];
          return (
            <section key={side} className="grid gap-3 rounded-lg border border-ink/10 bg-white p-3" data-testid={`activate-side-${side}`}>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="shrink-0 text-sm font-black text-ink">{rubberSideName[side]}胶皮</h3>
                <span className="min-w-0 truncate text-xs font-medium text-ink/55">
                  {current ? `当前：${current.name}` : "当前空位"}
                </span>
              </div>
              <RubberSourcePicker
                value={source}
                onChange={(next) => setSources((all) => ({ ...all, [side]: next }))}
                choices={["keep", "new", "inventory"]}
                keepLabel={current ? "保留当前" : "暂不贴"}
                inventory={inventoryFor(side)}
                testIdPrefix={`activate-${side}`}
                ariaLabel={`${rubberSideName[side]}胶皮来源`}
              />
              {current && source.choice !== "keep" ? (
                <Notice tone="warn">「{current.name}」会自动退役，移入历任退役胶皮档案。</Notice>
              ) : null}
            </section>
          );
        })}

        <ErrorBanner message={action.error} />
        <button type="submit" disabled={action.pending} className={buttonClass.court} data-testid="activate-submit">
          <Sparkles size={18} aria-hidden="true" />
          {action.pending ? "保存中…" : "启用这块底板"}
        </button>
      </form>
    </Modal>
  );
}
