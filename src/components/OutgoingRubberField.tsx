/** Choice of what happens to the rubber taken off a racket side: 退役归档 or 放回囤货 (used again later). */
import { Archive, PackageOpen } from "lucide-react";
import { getRubberDisplayName, type Rubber } from "../db/schema";
import type { OutgoingRubberAction } from "../db/store";
import { formatFullDate } from "../utils/date";
import { FieldLabel, SegmentedControl } from "./ui";

export function OutgoingRubberField({
  rubber,
  value,
  onChange,
  date,
  testIdPrefix,
}: {
  /** The rubber that comes off. */
  rubber: Rubber;
  value: OutgoingRubberAction;
  onChange: (value: OutgoingRubberAction) => void;
  /** Change date (`YYYY-MM-DD`), shown in the explanation. */
  date?: string;
  testIdPrefix: string;
}) {
  const when = date ? formatFullDate(date) : "当天";
  const stash = value === "stash";
  return (
    <div
      className={`grid gap-2.5 rounded-lg border p-3 ${stash ? "border-court/25 bg-court/5" : "border-amber-200 bg-amber-50/70"}`}
      data-testid={`${testIdPrefix}-outgoing`}
    >
      <FieldLabel hint="撕下不一定是退役">当前「{getRubberDisplayName(rubber)}」撕下后</FieldLabel>
      <SegmentedControl
        ariaLabel="撕下的胶皮怎么处理"
        value={value}
        onChange={onChange}
        options={[
          { value: "retire", label: "退役归档", testId: `${testIdPrefix}-outgoing-retire` },
          { value: "stash", label: "放回囤货", testId: `${testIdPrefix}-outgoing-stash` },
        ]}
      />
      <p className={`flex items-start gap-1.5 text-xs font-medium leading-5 ${stash ? "text-court" : "text-amber-800/85"}`}>
        {stash ? (
          <PackageOpen size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        ) : (
          <Archive size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        )}
        {stash
          ? `${when}撕下，放进囤货的「拆下待用」：已用天数、打球时长和灌油记录都保留，之后贴到任意球拍接着计算。`
          : `${when}退役，移入这块球拍的历任退役胶皮档案；寿命、打球时长和灌油记录冻结保存。`}
      </p>
    </div>
  );
}
