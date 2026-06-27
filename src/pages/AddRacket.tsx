import { ArrowLeft, Check, Plus } from "lucide-react";
import { FormEvent, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/database";
import type { RubberSide } from "../db/schema";
import { todayISO } from "../utils/date";
import { createId } from "../utils/id";

type AddRacketProps = {
  onBack: () => void;
  onCreated: (racketId: string) => void;
};

type NewRubberState = {
  name: string;
  hardness: string;
  thicknessMm: string;
  boosted: boolean;
  boostLayers: string;
};

const defaultRubberState: NewRubberState = {
  name: "",
  hardness: "",
  thicknessMm: "",
  boosted: false,
  boostLayers: "2",
};

function parseOptionalNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function RubberFields({
  label,
  value,
  onChange,
  testIdPrefix,
}: {
  label: string;
  value: NewRubberState;
  onChange: (value: NewRubberState) => void;
  testIdPrefix: string;
}) {
  return (
    <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
      <h2 className="text-base font-black text-ink">{label}</h2>
      <div className="mt-4 grid gap-4">
        <label className="grid gap-2">
          <span className="text-sm font-bold text-ink">胶皮名称</span>
          <input
            data-testid={`${testIdPrefix}-rubber-name`}
            value={value.name}
            onChange={(event) => onChange({ ...value, name: event.target.value })}
            className="tap-target w-full rounded-lg border border-ink/12 bg-white px-3 text-base font-semibold text-ink shadow-sm outline-none transition focus:border-court focus:ring-4 focus:ring-court/15"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-2">
            <span className="text-sm font-bold text-ink">硬度</span>
            <input
              data-testid={`${testIdPrefix}-rubber-hardness`}
              value={value.hardness}
              onChange={(event) => onChange({ ...value, hardness: event.target.value })}
              className="tap-target w-full rounded-lg border border-ink/12 bg-white px-3 text-base font-semibold text-ink shadow-sm outline-none transition focus:border-court focus:ring-4 focus:ring-court/15"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-bold text-ink">厚度 mm</span>
            <input
              data-testid={`${testIdPrefix}-rubber-thickness`}
              type="number"
              inputMode="decimal"
              value={value.thicknessMm}
              onChange={(event) => onChange({ ...value, thicknessMm: event.target.value })}
              className="tap-target w-full rounded-lg border border-ink/12 bg-white px-3 text-base font-semibold text-ink shadow-sm outline-none transition focus:border-court focus:ring-4 focus:ring-court/15"
            />
          </label>
        </div>
        <label className="flex min-h-11 items-center justify-between gap-4 rounded-lg border border-ink/10 bg-paper px-3">
          <span className="text-sm font-bold text-ink">初始已灌油</span>
          <input
            data-testid={`${testIdPrefix}-rubber-boosted`}
            type="checkbox"
            checked={value.boosted}
            onChange={(event) => onChange({ ...value, boosted: event.target.checked })}
            className="h-5 w-5 accent-court"
          />
        </label>
        {value.boosted ? (
          <label className="grid gap-2">
            <span className="text-sm font-bold text-ink">初始灌油层数</span>
            <input
              data-testid={`${testIdPrefix}-rubber-boost-layers`}
              type="number"
              inputMode="numeric"
              min="1"
              value={value.boostLayers}
              onChange={(event) => onChange({ ...value, boostLayers: event.target.value })}
              className="tap-target w-full rounded-lg border border-ink/12 bg-white px-3 text-base font-semibold text-ink shadow-sm outline-none transition focus:border-court focus:ring-4 focus:ring-court/15"
            />
          </label>
        ) : null}
      </div>
    </section>
  );
}

export function AddRacket({ onBack, onCreated }: AddRacketProps) {
  const rackets = useLiveQuery(() => db.rackets.toArray(), []);
  const [name, setName] = useState("");
  const [blade, setBlade] = useState("");
  const [installedAt, setInstalledAt] = useState(todayISO());
  const [forehand, setForehand] = useState<NewRubberState>({
    ...defaultRubberState,
    boosted: true,
  });
  const [backhand, setBackhand] = useState<NewRubberState>(defaultRubberState);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function createRubber({
    racketId,
    side,
    rubber,
  }: {
    racketId: string;
    side: RubberSide;
    rubber: NewRubberState;
  }) {
    const rubberId = createId("rubber");
    await db.rubbers.add({
      id: rubberId,
      racketId,
      side,
      name: rubber.name.trim(),
      hardness: rubber.hardness.trim() || undefined,
      thicknessMm: parseOptionalNumber(rubber.thicknessMm),
      installedAt,
      boosted: rubber.boosted,
      createdAt: new Date().toISOString(),
    });

    if (rubber.boosted) {
      const layers = Number(rubber.boostLayers);
      await db.boostingLogs.add({
        id: createId("boost"),
        rubberId,
        date: installedAt,
        boostNumber: 1,
        layers: Number.isFinite(layers) && layers > 0 ? Math.round(layers) : 1,
        notes: "Initial boost",
        createdAt: new Date().toISOString(),
      });
    }

    return rubberId;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim() || !blade.trim() || !forehand.name.trim() || !backhand.name.trim()) {
      setError("请填写球拍、底板和两面胶皮名称");
      return;
    }

    setIsSaving(true);
    setError("");

    const racketId = createId("racket");
    const sortOrder = (rackets?.reduce((max, racket) => Math.max(max, racket.sortOrder ?? 0), 0) ?? 0) + 1;

    await db.transaction("rw", db.rackets, db.rubbers, db.boostingLogs, async () => {
      const forehandRubberId = await createRubber({ racketId, side: "forehand", rubber: forehand });
      const backhandRubberId = await createRubber({ racketId, side: "backhand", rubber: backhand });

      await db.rackets.add({
        id: racketId,
        name: name.trim(),
        blade: blade.trim(),
        forehandRubberId,
        backhandRubberId,
        sortOrder,
        createdAt: new Date().toISOString(),
      });
    });

    setIsSaving(false);
    onCreated(racketId);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-4 sm:px-6">
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
          <div className="mt-4 grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-bold text-ink">球拍名</span>
              <input
                data-testid="new-racket-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="tap-target w-full rounded-lg border border-ink/12 bg-white px-3 text-base font-semibold text-ink shadow-sm outline-none transition focus:border-court focus:ring-4 focus:ring-court/15"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold text-ink">底板</span>
              <input
                data-testid="new-racket-blade"
                value={blade}
                onChange={(event) => setBlade(event.target.value)}
                className="tap-target w-full rounded-lg border border-ink/12 bg-white px-3 text-base font-semibold text-ink shadow-sm outline-none transition focus:border-court focus:ring-4 focus:ring-court/15"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold text-ink">胶皮安装日期</span>
              <input
                data-testid="new-racket-installed-at"
                type="date"
                value={installedAt}
                onChange={(event) => setInstalledAt(event.target.value)}
                className="tap-target w-full rounded-lg border border-ink/12 bg-white px-3 text-base font-semibold text-ink shadow-sm outline-none transition focus:border-court focus:ring-4 focus:ring-court/15"
              />
            </label>
          </div>
        </section>

        <RubberFields label="正手胶皮" value={forehand} onChange={setForehand} testIdPrefix="new-forehand" />
        <RubberFields label="反手胶皮" value={backhand} onChange={setBackhand} testIdPrefix="new-backhand" />

        {error ? <div className="rounded-lg bg-spin/10 px-3 py-2 text-sm font-semibold text-spin">{error}</div> : null}

        <button
          data-testid="create-racket-button"
          type="submit"
          disabled={isSaving}
          className="tap-target mb-3 inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-4 text-base font-black text-white shadow-soft transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-ink/40"
        >
          {isSaving ? <Check size={20} aria-hidden="true" /> : <Plus size={20} aria-hidden="true" />}
          {isSaving ? "保存中" : "创建球拍"}
        </button>
      </form>
    </div>
  );
}
