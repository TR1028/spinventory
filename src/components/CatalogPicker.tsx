/**
 * Searchable blade / rubber name field backed by the built-in catalog (`src/data/catalog.ts`).
 *
 * An ARIA combobox: typing filters a dropdown grouped by brand, the brand pills narrow it down and
 * ↑ / ↓ / Enter / Esc work from the keyboard. The catalog only makes suggestions: whatever is typed
 * stays the value, so gear missing from the catalog can always be entered by hand.
 */
import { Check, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  catalogBrands,
  catalogValue,
  describeCatalogEntry,
  normalizeSearchText,
  searchCatalog,
  type BrandId,
  type CatalogEntryOf,
  type CatalogKind,
} from "../data/catalog";
import { FieldLabel, inputClass } from "./ui";

type BrandFilter = BrandId | "all";

type CatalogPickerProps<K extends CatalogKind> = {
  kind: K;
  label: ReactNode;
  hint?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  /**
   * Called instead of `onChange` when a catalog entry is picked, with the text written into the
   * field (`catalogValue(entry)`), so callers can apply the entry's presets in the same update.
   */
  onPick?: (entry: CatalogEntryOf<K>, value: string) => void;
  /** `data-testid` of the `<input>`; options are `${testId}-option-${entry.id}`, pills `${testId}-brand-${id}`. */
  testId: string;
  placeholder?: string;
  /** Classes of the wrapper (e.g. grid column spans). */
  className?: string;
};

export function CatalogPicker<K extends CatalogKind>({
  kind,
  label,
  hint,
  value,
  onChange,
  onPick,
  testId,
  placeholder,
  className = "",
}: CatalogPickerProps<K>) {
  const baseId = useId();
  const inputId = `${baseId}input`;
  const listboxId = `${baseId}listbox`;
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // The dropdown only shows while the input has focus, so a value set from code never leaves it
  // covering the rest of the form.
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  /** Text typed since the dropdown opened; blank lists the whole catalog. */
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState<BrandFilter>("all");
  const [activeIndex, setActiveIndex] = useState(-1);

  const brands = useMemo(() => catalogBrands(kind), [kind]);
  const groups = useMemo(() => searchCatalog(kind, query, brand === "all" ? undefined : brand), [kind, query, brand]);
  const options = useMemo(() => groups.flatMap((group) => group.entries), [groups]);
  const optionIndex = useMemo(() => new Map(options.map((entry, index) => [entry.id, index])), [options]);

  const listVisible = focused && open && (options.length > 0 || brand !== "all");
  const hintVisible = focused && open && !listVisible && query.trim() !== "";
  const activeEntry = listVisible && activeIndex >= 0 ? options[activeIndex] : undefined;
  const activeId = activeEntry ? `${baseId}${activeEntry.id}` : undefined;
  const currentValue = normalizeSearchText(value);
  const brandName = brands.find((item) => item.id === brand)?.name ?? "";

  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  function resetSearch() {
    setQuery("");
    setActiveIndex(-1);
  }

  function handleFocus() {
    setFocused(true);
    setOpen(true);
    resetSearch();
  }

  function handleBlur() {
    setFocused(false);
    setOpen(false);
  }

  function handleInput(text: string) {
    onChange(text);
    setQuery(text);
    setOpen(true);
    setActiveIndex(-1);
  }

  function pick(entry: CatalogEntryOf<K>, viaPointer: boolean) {
    const next = catalogValue(entry);
    if (onPick) onPick(entry, next);
    else onChange(next);
    setOpen(false);
    resetSearch();
    // A tapped option is a final choice: drop the focus so the on-screen keyboard closes.
    if (viaPointer) inputRef.current?.blur();
  }

  function selectBrand(next: BrandFilter) {
    setBrand(next);
    setActiveIndex(-1);
    listRef.current?.scrollTo({ top: 0 });
  }

  function clear() {
    onChange("");
    resetSearch();
    setOpen(true);
    inputRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Keys pressed while an IME (e.g. pinyin) is composing belong to the IME.
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => Math.max(-1, Math.min(options.length - 1, index + step)));
      return;
    }
    if (event.key === "Enter" && activeEntry) {
      // Without a highlighted option Enter keeps submitting the form.
      event.preventDefault();
      pick(activeEntry, false);
      return;
    }
    if (event.key === "Escape" && (listVisible || hintVisible)) {
      // Close only the dropdown, not a dialog around the form.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className={`relative grid min-w-0 gap-2 ${className}`}>
      <label htmlFor={inputId} className="min-w-0">
        <FieldLabel hint={hint}>{label}</FieldLabel>
      </label>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" aria-hidden="true" />
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={listVisible}
          aria-controls={listVisible ? listboxId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={placeholder}
          data-testid={testId}
          value={value}
          onChange={(event) => handleInput(event.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={`${inputClass} pl-9 ${value ? "pr-11" : ""}`}
        />
        {value ? (
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onClick={clear}
            className="absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-ink/40 transition hover:bg-ink/5 hover:text-ink"
            aria-label="清空"
            title="清空"
            data-testid={`${testId}-clear`}
          >
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {hintVisible ? (
        <div
          role="status"
          className="pointer-events-none absolute inset-x-0 top-full z-30 mt-1 rounded-lg border border-ink/10 bg-white px-3 py-2 text-xs font-medium leading-5 text-ink/55 shadow-soft"
          data-testid={`${testId}-custom-hint`}
        >
          目录里没有匹配的型号，直接使用输入的名称即可。
        </div>
      ) : null}

      {listVisible ? (
        <div
          className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-ink/10 bg-white shadow-2xl sm:min-w-[24rem]"
          // Keep the focus in the input while pills and options are tapped.
          onMouseDown={(event) => event.preventDefault()}
          data-testid={`${testId}-panel`}
        >
          <div role="group" aria-label="按品牌筛选" className="flex gap-1.5 overflow-x-auto border-b border-ink/10 p-2">
            {[{ id: "all" as const, name: "全部" }, ...brands].map((item) => {
              const selected = brand === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  tabIndex={-1}
                  aria-pressed={selected}
                  onClick={() => selectBrand(item.id)}
                  data-testid={`${testId}-brand-${item.id}`}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                    selected ? "bg-ink text-white" : "bg-ink/5 text-ink/65 hover:text-ink"
                  }`}
                >
                  {item.name}
                </button>
              );
            })}
          </div>

          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label={kind === "blade" ? "底板目录" : "胶皮目录"}
            className="max-h-72 overflow-y-auto overscroll-contain"
          >
            {groups.map((group) => {
              const headingId = `${baseId}${group.brand.id}-heading`;
              return (
                <div key={group.brand.id} role="group" aria-labelledby={headingId}>
                  <div id={headingId} className="sticky top-0 z-10 bg-white/95 px-3 pb-1 pt-2 text-[11px] font-black tracking-wide text-ink/45">
                    {group.brand.name} · {group.brand.en}
                  </div>
                  {group.entries.map((entry) => {
                    const index = optionIndex.get(entry.id) ?? -1;
                    const active = index === activeIndex;
                    const current = normalizeSearchText(catalogValue(entry)) === currentValue;
                    const details = describeCatalogEntry(entry);
                    return (
                      <div
                        key={entry.id}
                        id={`${baseId}${entry.id}`}
                        role="option"
                        aria-selected={active}
                        data-testid={`${testId}-option-${entry.id}`}
                        onClick={() => pick(entry, true)}
                        className={`flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 transition ${active ? "bg-court/10" : "hover:bg-ink/5"}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-ink">{entry.name}</div>
                          {details ? <div className="truncate text-xs font-medium text-ink/50">{details}</div> : null}
                        </div>
                        {current ? <Check size={16} className="shrink-0 text-court" aria-hidden="true" /> : null}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {options.length ? (
            <p className="border-t border-ink/10 px-3 py-1.5 text-[11px] font-medium text-ink/45">找不到型号？直接输入名称即可保存。</p>
          ) : (
            <p className="px-3 py-4 text-xs font-medium leading-5 text-ink/55">
              「{brandName}」里没有匹配的型号。可以切换品牌，或直接使用输入的名称。
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
