/**
 * Small UI kit shared by pages and dialogs: Tailwind class presets plus a few accessible
 * primitives (form fields, segmented control, bottom-sheet modal, two-step confirm button).
 */
import { ArrowLeft, ChevronDown, Droplets, Trash2, TriangleAlert, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { getErrorMessage } from "../utils/errors";

// ---------------------------------------------------------------------------
// Class presets
// ---------------------------------------------------------------------------

export const inputClass =
  "tap-target w-full min-w-0 rounded-lg border border-ink/15 bg-white px-3 text-base font-semibold text-ink shadow-sm outline-none transition placeholder:font-medium placeholder:text-ink/30 focus:border-court focus:ring-4 focus:ring-court/15 disabled:bg-ink/5 disabled:text-ink/40";

export const textareaClass =
  "w-full min-w-0 resize-none rounded-lg border border-ink/15 bg-white px-3 py-3 text-base font-medium text-ink shadow-sm outline-none transition placeholder:text-ink/30 focus:border-court focus:ring-4 focus:ring-court/15";

export const cardClass = "rounded-lg border border-ink/10 bg-white p-4 shadow-soft";

const buttonBase =
  "tap-target inline-flex items-center justify-center gap-2 rounded-lg px-4 text-sm font-black transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50";

export const buttonClass = {
  primary: `${buttonBase} bg-ink text-white shadow-sm`,
  court: `${buttonBase} bg-court text-white shadow-sm`,
  secondary: `${buttonBase} bg-white text-ink shadow-sm ring-1 ring-ink/15`,
  danger: `${buttonBase} bg-spin text-white shadow-sm`,
  dangerSoft: `${buttonBase} bg-spin/10 text-spin`,
  ghost:
    "tap-target inline-flex items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-bold text-ink/65 transition hover:bg-ink/5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50",
  /** Round icon-only button (always pair with `aria-label`). */
  icon: "tap-target inline-flex shrink-0 items-center justify-center rounded-full text-ink/55 transition hover:bg-ink/5 hover:text-ink active:scale-95 disabled:cursor-not-allowed disabled:opacity-50",
  /** Armed state of an icon-only {@link ConfirmButton}. */
  armedPill:
    "tap-target inline-flex shrink-0 items-center justify-center gap-1 rounded-full bg-spin px-3 text-xs font-black text-white shadow-sm transition active:scale-95",
} as const;

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

export function FieldLabel({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <span className="flex items-baseline justify-between gap-2">
      <span className="text-sm font-bold text-ink">{children}</span>
      {hint ? <span className="text-xs font-medium text-ink/45">{hint}</span> : null}
    </span>
  );
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className"> & {
  label: ReactNode;
  hint?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  testId?: string;
  /** Classes of the wrapping `<label>`. */
  className?: string;
};

export function TextField({ label, hint, value, onChange, testId, className = "", ...inputProps }: TextFieldProps) {
  return (
    <label className={`grid min-w-0 gap-2 ${className}`}>
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <input
        {...inputProps}
        data-testid={testId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    </label>
  );
}

type TextAreaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "className"> & {
  label: ReactNode;
  hint?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  testId?: string;
  className?: string;
};

export function TextAreaField({ label, hint, value, onChange, testId, className = "", rows = 2, ...rest }: TextAreaFieldProps) {
  return (
    <label className={`grid min-w-0 gap-2 ${className}`}>
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <textarea
        {...rest}
        rows={rows}
        data-testid={testId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={textareaClass}
      />
    </label>
  );
}

export function CheckboxField({
  label,
  description,
  checked,
  onChange,
  testId,
  disabled,
}: {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  testId?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-lg border border-ink/10 bg-paper px-3 py-2">
      <span className="min-w-0">
        <span className="block text-sm font-bold text-ink">{label}</span>
        {description ? <span className="mt-0.5 block text-xs font-medium text-ink/50">{description}</span> : null}
      </span>
      <input
        type="checkbox"
        data-testid={testId}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 shrink-0 accent-court"
      />
    </label>
  );
}

export type SegmentOption<T extends string> = { value: T; label: ReactNode; testId?: string; disabled?: boolean };

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = "",
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`grid gap-1 rounded-lg bg-ink/5 p-1 ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={option.disabled}
            data-testid={option.testId}
            onClick={() => onChange(option.value)}
            className={`min-h-10 min-w-0 rounded-md px-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
              selected ? "bg-white text-ink shadow-sm" : "text-ink/55 hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export function ErrorBanner({ message, onDismiss }: { message: string | null | undefined; onDismiss?: () => void }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg bg-spin/10 px-3 py-2 text-sm font-semibold text-spin">
      <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 break-words">{message}</span>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="-my-1 -mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition hover:bg-spin/10"
          aria-label="关闭提示"
          title="关闭提示"
        >
          <X size={16} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

/** Amber "re-boost due" badge for boosted rubbers whose last boost is older than their cycle. */
export function ReboostBadge({ daysSinceLastBoost, cycleDays }: { daysSinceLastBoost?: number; cycleDays?: number }) {
  const title =
    daysSinceLastBoost !== undefined && cycleDays !== undefined
      ? `距上次灌油 ${daysSinceLastBoost} 天，复灌周期 ${cycleDays} 天`
      : undefined;
  return (
    <span
      title={title}
      data-testid="reboost-badge"
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-700"
    >
      <Droplets size={12} aria-hidden="true" />
      建议复灌
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  children,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-ink/15 bg-white/60 px-4 py-6 text-center">
      {icon ? (
        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-ink/5 text-ink/50">{icon}</div>
      ) : null}
      <p className="text-sm font-bold text-ink">{title}</p>
      {description ? <p className="mt-1 text-xs font-medium leading-5 text-ink/55">{description}</p> : null}
      {children ? <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div> : null}
    </div>
  );
}

/** "展开全部 n 条 / 收起" toggle for lists that only show their first few entries. */
export function ShowMoreButton({
  expanded,
  total,
  limit,
  onToggle,
  testId,
}: {
  expanded: boolean;
  total: number;
  limit: number;
  onToggle: () => void;
  testId?: string;
}) {
  if (total <= limit) return null;
  return (
    <button type="button" onClick={onToggle} data-testid={testId} className={`${buttonClass.ghost} mt-2 w-full`}>
      {expanded ? "收起" : `展开全部 ${total} 条`}
      <ChevronDown size={16} className={`transition ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Navigation & dialogs
// ---------------------------------------------------------------------------

export function BackButton({ onClick, label = "返回" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tap-target inline-flex items-center justify-center rounded-full bg-white text-ink shadow-sm ring-1 ring-ink/10 transition active:scale-95"
      aria-label={label}
      title={label}
    >
      <ArrowLeft size={20} aria-hidden="true" />
    </button>
  );
}

/** Ref that always holds the latest value (for callbacks used by long-lived effects). */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * Bottom sheet on phones, centered dialog on larger screens. Render it conditionally (it is open
 * while mounted); Esc, the close button and a tap on the backdrop call `onClose`.
 */
export function Modal({
  title,
  description,
  onClose,
  children,
  testId,
}: {
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
}) {
  const onCloseRef = useLatest(onClose);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [onCloseRef]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-paper shadow-2xl outline-none sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-ink/10 bg-white px-4 py-3">
          <div className="min-w-0 pt-1">
            <h2 id={titleId} className="text-lg font-black leading-tight text-ink">
              {title}
            </h2>
            {description ? <p className="mt-1 text-xs font-medium leading-5 text-ink/55">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            className={`${buttonClass.icon} -mr-2`}
            aria-label="关闭"
            title="关闭"
            data-testid="modal-close"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Destructive button that needs two taps: the first arms it (showing `confirmLabel`), the second
 * runs `onConfirm`. It disarms itself after 4 seconds.
 */
export function ConfirmButton({
  onConfirm,
  label,
  confirmLabel = "确认删除",
  icon,
  className = buttonClass.dangerSoft,
  armedClassName = buttonClass.danger,
  disabled,
  testId,
  ariaLabel,
}: {
  onConfirm: () => void;
  label?: ReactNode;
  confirmLabel?: ReactNode;
  icon?: ReactNode;
  className?: string;
  armedClassName?: string;
  disabled?: boolean;
  testId?: string;
  /** Accessible name while not armed (required for icon-only buttons). */
  ariaLabel?: string;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return undefined;
    const timer = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  return (
    <button
      type="button"
      disabled={disabled}
      data-testid={testId}
      data-armed={armed ? "true" : undefined}
      aria-label={armed ? undefined : ariaLabel}
      title={armed ? undefined : ariaLabel}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
      className={armed ? armedClassName : className}
    >
      {icon ?? <Trash2 size={16} aria-hidden="true" />}
      {armed ? confirmLabel : label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Runs one async action at a time and keeps its user-facing error. `run` resolves to `true` when
 * the action succeeded (follow-ups such as closing a dialog can also live inside the action).
 */
export function useAsyncAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(false);

  const run = useCallback(async (action: () => Promise<unknown>) => {
    if (pendingRef.current) return false;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (caught) {
      setError(getErrorMessage(caught));
      return false;
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }, []);

  return { run, pending, error, setError };
}

/**
 * State seeded from a record and re-seeded whenever `version` changes (e.g. the record's
 * `updatedAt`), so edit forms follow saves from other devices without clobbering every keystroke.
 */
export function useSyncedState<T>(create: () => T, version: string) {
  const [state, setState] = useState(create);
  const [seenVersion, setSeenVersion] = useState(version);
  if (seenVersion !== version) {
    setSeenVersion(version);
    setState(create());
  }
  return [state, setState] as const;
}

const noticeTones = {
  info: "bg-court/10 text-court",
  warn: "bg-amber-50 text-amber-800",
  muted: "bg-paper text-ink/65",
} as const;

/** Inline hint box, e.g. "the current rubber will be retired". */
export function Notice({
  tone = "info",
  icon,
  children,
  testId,
}: {
  tone?: keyof typeof noticeTones;
  icon?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm font-medium leading-6 ${noticeTones[tone]}`} data-testid={testId}>
      {icon ? <span className="mt-1 shrink-0">{icon}</span> : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
