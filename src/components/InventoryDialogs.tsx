/** Dialogs of the inventory page: add / edit spare rubbers and blades, mount a rubber, activate a blade. */
import { Boxes, Check, Link2, PackagePlus, Sparkles } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { getInventoryRubbers, getMountedRubber } from "../db/domain";
import {
  getRacketStatus,
  getRubberDisplayName,
  getRubberMountedDate,
  getRubberQuantity,
  RUBBER_SIDES,
  rubberSideName,
  type AppSnapshot,
  type Racket,
  type Rubber,
  type RubberSide,
} from "../db/schema";
import { useAppData, type OutgoingRubberAction } from "../db/store";
import { formatFullDate, todayISO } from "../utils/date";
import { sortRackets } from "../utils/rackets";
import { CatalogPicker } from "./CatalogPicker";
import { OutgoingRubberField } from "./OutgoingRubberField";
import { RacketSpecFields, createRacketSpecForm, specFormToInput, specFormToUpdate } from "./RacketSpecs";
import { createRubberForm, describeRubberSpecs, formToStockInput, formToStockUpdate, rubberToForm, RubberFormFields } from "./RubberForm";
import {
  MountBoostField,
  RubberSourcePicker,
  createSourceState,
  describeInventoryState,
  inventoryExcluding,
  resolveRubberSource,
  type RubberSourceState,
} from "./RubberSourcePicker";
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

/** Adds rubbers to the inventory (several brand-new sheets, or one used sheet), or edits one (`rubber`). */
export function RubberFormModal({ rubber, onClose }: { rubber?: Rubber; onClose: () => void }) {
  const { createRubber, updateRubber } = useAppData();
  const [form, setForm] = useState(() => (rubber ? rubberToForm(rubber) : createRubberForm()));
  const action = useAsyncAction();
  const used = rubber ? Boolean(rubber.installedAt) : form.condition === "used";
  const count = Math.max(1, Math.round(Number(form.quantity) || 1));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void action.run(async () => {
      if (rubber) await updateRubber(rubber.id, formToStockUpdate(form, rubber));
      else await createRubber(formToStockInput(form));
      onClose();
    });
  }

  let description = "新买的胶皮不计算寿命，贴到球拍后才开始计时；拆下来还要用的胶皮选「用过的」。";
  if (rubber) {
    description = used
      ? "拆下待用的胶皮：首次贴拍日期和已打时长决定剩余寿命，再贴上球拍后接着累计。"
      : "全新未拆的囤货胶皮，贴到球拍后才开始计时。";
  }

  return (
    <Modal title={rubber ? "编辑囤货胶皮" : "添加囤货胶皮"} description={description} onClose={onClose} testId="rubber-form-modal">
      <form onSubmit={handleSubmit} className="grid gap-4">
        <RubberFormFields value={form} onChange={setForm} testIdPrefix="inventory" variant={rubber ? "stock-edit" : "stock"} />
        <ErrorBanner message={action.error} />
        <button type="submit" disabled={action.pending} className={buttonClass.primary} data-testid="inventory-rubber-submit">
          {rubber ? <Check size={18} aria-hidden="true" /> : <PackagePlus size={18} aria-hidden="true" />}
          {action.pending ? "保存中…" : rubber ? "保存修改" : !used && count > 1 ? `加入囤货（${count} 张）` : "加入囤货"}
        </button>
      </form>
    </Modal>
  );
}

function preferredSide(data: AppSnapshot, racket: Racket): RubberSide {
  return RUBBER_SIDES.find((side) => !getMountedRubber(data, racket, side)) ?? "forehand";
}

function parseOptionalLayers(value: string) {
  const text = value.trim();
  if (!text) return undefined;
  const layers = Number(text);
  if (!Number.isFinite(layers) || layers <= 0) throw new Error("贴拍灌油层数需为大于 0 的整数");
  return Math.max(1, Math.round(layers));
}

/** 「贴到球拍」: mounts an inventory rubber; whatever is on the chosen side is retired or put back. */
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
  const [outgoing, setOutgoing] = useState<OutgoingRubberAction>("retire");
  const [boostLayers, setBoostLayers] = useState("");
  const action = useAsyncAction();

  const racket = rackets.find((item) => item.id === racketId);
  const occupant = racket ? getMountedRubber(data, racket, side) : undefined;
  const isSpare = racket ? getRacketStatus(racket) === "inventory" : false;
  const count = getRubberQuantity(rubber);
  const earliest = [occupant ? getRubberMountedDate(occupant) : undefined, rubber.installedAt].filter(Boolean).sort().pop();

  function selectRacket(nextId: string) {
    setRacketId(nextId);
    const next = rackets.find((item) => item.id === nextId);
    if (next) setSide(preferredSide(data, next));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void action.run(async () => {
      if (!racket) throw new Error("请选择要贴的球拍");
      const layers = rubber.boosted ? parseOptionalLayers(boostLayers) : undefined;
      await replaceRubber(racket.id, {
        side,
        date,
        source: layers ? { type: "inventory", rubberId: rubber.id, boostLayers: layers } : { type: "inventory", rubberId: rubber.id },
        outgoing: occupant ? outgoing : undefined,
      });
      if (isSpare && activate) await updateRacket(racket.id, { status: "active" });
      onClose();
    });
  }

  return (
    <Modal
      title="贴到球拍"
      description={`${getRubberDisplayName(rubber)} · ${describeRubberSpecs(rubber)}`}
      onClose={onClose}
      testId="mount-rubber-modal"
    >
      {rackets.length ? (
        <form onSubmit={handleSubmit} className="grid gap-4">
          {rubber.installedAt ? (
            <Notice tone="info" testId="mount-used-notice">
              这张胶皮用过（{describeInventoryState(rubber)}），贴上后寿命接着之前的累计。
            </Notice>
          ) : count > 1 ? (
            <Notice tone="muted">囤货里有 {count} 张，贴上其中 1 张，剩下 {count - 1} 张继续囤着。</Notice>
          ) : null}

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
            <OutgoingRubberField rubber={occupant} value={outgoing} onChange={setOutgoing} date={date} testIdPrefix="mount" />
          ) : (
            <Notice tone="info">该位置目前空着，贴上后开始计算寿命。</Notice>
          )}

          <TextField
            label="贴拍日期"
            hint={rubber.installedAt ? `首次贴拍 ${formatFullDate(rubber.installedAt)}` : undefined}
            type="date"
            value={date}
            onChange={setDate}
            min={earliest}
            required
            testId="mount-date"
          />

          {rubber.boosted ? <MountBoostField value={boostLayers} onChange={setBoostLayers} testId="mount-boost-layers" /> : null}

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
  const [specs, setSpecs] = useState(() => createRacketSpecForm(racket));
  const action = useAsyncAction();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void action.run(async () => {
      const bladeName = blade.trim();
      if (!bladeName) throw new Error("请填写底板型号");
      const racketName = name.trim() || bladeName;
      if (racket) {
        await updateRacket(racket.id, { name: racketName, blade: bladeName, notes: notes.trim() || null, ...specFormToUpdate(specs) });
      } else {
        await createRacket({
          name: racketName,
          blade: bladeName,
          notes: notes.trim() || undefined,
          status: "inventory",
          ...specFormToInput(specs),
        });
      }
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
        <CatalogPicker
          kind="blade"
          label="底板型号"
          hint="可搜索或直接输入"
          value={blade}
          onChange={setBlade}
          placeholder="如 维斯卡利亚、vis、w968"
          testId="blade-form-blade"
        />
        <TextField
          label="名称"
          hint="选填，默认同底板型号"
          value={name}
          onChange={setName}
          autoComplete="off"
          testId="blade-form-name"
        />
        <RacketSpecFields value={specs} onChange={setSpecs} testIdPrefix="blade-form" />
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
  const [outgoing, setOutgoing] = useState<Record<RubberSide, OutgoingRubberAction>>({ forehand: "retire", backhand: "retire" });
  const action = useAsyncAction();

  /** Inventory offered to one side, without the record the other side already picked (unless it has more sheets). */
  const inventoryFor = (side: RubberSide) => inventoryExcluding(inventory, sources[side === "forehand" ? "backhand" : "forehand"]);

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
        await replaceRubber(racket.id, { side, date, source, outgoing: mounted[side] ? outgoing[side] : undefined });
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
                  {current ? `当前：${getRubberDisplayName(current)}` : "当前空位"}
                </span>
              </div>
              <RubberSourcePicker
                value={source}
                onChange={(next) => setSources((all) => ({ ...all, [side]: next }))}
                choices={["keep", "new", "inventory"]}
                keepLabel={current ? "保留当前" : "暂不贴"}
                inventory={inventoryFor(side)}
                mountDate={date}
                testIdPrefix={`activate-${side}`}
                ariaLabel={`${rubberSideName[side]}胶皮来源`}
              />
              {current && source.choice !== "keep" ? (
                <OutgoingRubberField
                  rubber={current}
                  value={outgoing[side]}
                  onChange={(next) => setOutgoing((all) => ({ ...all, [side]: next }))}
                  date={date}
                  testIdPrefix={`activate-${side}`}
                />
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
