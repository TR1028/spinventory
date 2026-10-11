/** 「更换胶皮」: takes the rubber on one side of a racket off (retired or back to the inventory) and mounts a new or inventory rubber. */
import { ArrowRightLeft } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { getInventoryRubbers, getMountedRubber } from "../db/domain";
import { getRubberMountedDate, rubberSideName, type Racket, type RubberSide } from "../db/schema";
import { useAppData, type OutgoingRubberAction } from "../db/store";
import { todayISO } from "../utils/date";
import { OutgoingRubberField } from "./OutgoingRubberField";
import { RubberSourcePicker, createSourceState, resolveRubberSource, type RubberSourceState } from "./RubberSourcePicker";
import { ErrorBanner, Modal, TextField, buttonClass, useAsyncAction } from "./ui";

type ReplaceRubberModalProps = {
  racket: Racket;
  side: RubberSide;
  onClose: () => void;
};

export function ReplaceRubberModal({ racket, side, onClose }: ReplaceRubberModalProps) {
  const { data, replaceRubber } = useAppData();
  const current = getMountedRubber(data, racket, side);
  const inventory = useMemo(() => getInventoryRubbers(data), [data]);
  const [date, setDate] = useState(todayISO);
  const [source, setSource] = useState<RubberSourceState>(() => createSourceState("new"));
  const [outgoing, setOutgoing] = useState<OutgoingRubberAction>("retire");
  const action = useAsyncAction();
  const sideName = rubberSideName[side];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void action.run(async () => {
      const resolved = resolveRubberSource(source, inventory, "新胶皮");
      if (!resolved) return;
      await replaceRubber(racket.id, { side, date, source: resolved, outgoing: current ? outgoing : undefined });
      onClose();
    });
  }

  return (
    <Modal
      title={current ? "更换胶皮" : "贴上胶皮"}
      description={`${racket.name} · ${sideName}`}
      onClose={onClose}
      testId="replace-rubber-modal"
    >
      <form onSubmit={handleSubmit} className="grid gap-4">
        <TextField
          label={current ? "更换日期" : "贴拍日期"}
          type="date"
          value={date}
          onChange={setDate}
          min={current ? getRubberMountedDate(current) : undefined}
          required
          testId="replace-date"
        />

        {current ? <OutgoingRubberField rubber={current} value={outgoing} onChange={setOutgoing} date={date} testIdPrefix="replace" /> : null}

        <RubberSourcePicker
          value={source}
          onChange={setSource}
          choices={["new", "inventory"]}
          inventory={inventory}
          testIdPrefix="replace"
          ariaLabel="新胶皮来源"
          mountDate={date}
        />

        <ErrorBanner message={action.error} />
        <button type="submit" disabled={action.pending} className={buttonClass.primary} data-testid="replace-submit">
          <ArrowRightLeft size={18} aria-hidden="true" />
          {action.pending ? "保存中…" : current ? `确认更换${sideName}胶皮` : `贴上${sideName}胶皮`}
        </button>
      </form>
    </Modal>
  );
}
