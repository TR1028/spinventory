/** 「更换胶皮」: retires whatever is on one side of a racket and mounts a new or inventory rubber. */
import { Archive, ArrowRightLeft } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { getInventoryRubbers, getMountedRubber } from "../db/domain";
import { rubberSideName, type Racket, type RubberSide } from "../db/schema";
import { useAppData } from "../db/store";
import { formatFullDate, todayISO } from "../utils/date";
import { RubberSourcePicker, createSourceState, resolveRubberSource, type RubberSourceState } from "./RubberSourcePicker";
import { ErrorBanner, Modal, Notice, TextField, buttonClass, useAsyncAction } from "./ui";

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
  const action = useAsyncAction();
  const sideName = rubberSideName[side];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void action.run(async () => {
      const resolved = resolveRubberSource(source, inventory, "新胶皮");
      if (!resolved) return;
      await replaceRubber(racket.id, { side, date, source: resolved });
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
          min={current?.installedAt}
          required
          testId="replace-date"
        />

        {current ? (
          <Notice tone="warn" icon={<Archive size={16} aria-hidden="true" />} testId="replace-retire-notice">
            当前的「{current.name}」将在 {date ? formatFullDate(date) : "更换当天"} 退役，移入历任退役胶皮档案；它的寿命、打球时长和灌油记录会冻结保存。
          </Notice>
        ) : null}

        <RubberSourcePicker
          value={source}
          onChange={setSource}
          choices={["new", "inventory"]}
          inventory={inventory}
          testIdPrefix="replace"
          ariaLabel="新胶皮来源"
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
