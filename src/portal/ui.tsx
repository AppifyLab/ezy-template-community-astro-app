import {
  type ButtonHTMLAttributes,
  type FormEvent,
  type ReactElement,
  type ReactNode,
  useRef,
  useState,
} from 'react';

/**
 * The app's controls. EVERY button and EVERY form field in an app uses these
 * (AGENTS.md "Buttons and forms"): a button always shows when it is busy and
 * can never be pressed twice; a field always has a label and shows its own
 * error in place, in words, never a browser bubble.
 */

// ---------------------------------------------------------------- buttons --

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'link' | 'danger';
  size?: 'md' | 'sm';
  /** The action is running: spinner, `aria-busy`, and the button cannot be pressed. */
  pending?: boolean;
  /** What the button says while pending ("Saving…"). Defaults to its label. */
  pendingLabel?: ReactNode;
};

/**
 * `type="button"` unless you say `submit`, so a button inside a form never
 * submits it by accident. Disabled while `pending` OR `disabled`, so a double
 * click never sends twice. Keep the label short and a verb ("Save", "Delete").
 */
export function Button({
  variant = 'primary',
  size = 'md',
  pending = false,
  pendingLabel,
  disabled,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    'button',
    variant === 'primary' ? '' : variant,
    size === 'sm' ? 'small-button' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      {...rest}
      type={type}
      className={classes}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      aria-disabled={disabled || pending || undefined}>
      {pending && <span className="spinner" aria-hidden="true" />}
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}

// ----------------------------------------------------------------- fields --

/**
 * One labelled field: the label, the control, a hint, and its error IN PLACE.
 * The control gets its wiring from `form.field(name)` (id, value, onChange,
 * onBlur, aria-invalid, aria-describedby).
 */
export function Field({
  label,
  hint,
  error,
  id,
  optional,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  id: string;
  optional?: boolean;
  children: ReactElement;
}) {
  return (
    <div className="field" data-invalid={error ? '' : undefined}>
      <label htmlFor={id}>
        {label}
        {optional && <span className="muted"> (optional)</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------- validation --

/** A rule: the error message when the value is wrong, `null` when it is fine. */
export type Rule = (value: string) => string | null;

/** Pure, reusable rules. Mirror the server's limits exactly (the server checks again). */
export const rules = {
  required:
    (message = 'This field is required.'): Rule =>
    value =>
      value.trim() ? null : message,
  maxLength:
    (max: number, message = `Use at most ${max} characters.`): Rule =>
    value =>
      value.trim().length <= max ? null : message,
  minLength:
    (min: number, message = `Use at least ${min} characters.`): Rule =>
    value =>
      !value.trim() || value.trim().length >= min ? null : message,
  email:
    (message = 'Enter a valid email address, like name@example.com.'): Rule =>
    value =>
      !value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? null : message,
  pattern:
    (re: RegExp, message: string): Rule =>
    value =>
      !value.trim() || re.test(value.trim()) ? null : message,
  wholeNumber:
    (message = 'Use whole numbers only, like 2500.'): Rule =>
    value =>
      !value.trim() || /^\d+$/.test(value.trim()) ? null : message,
};

type Values = Record<string, string | boolean>;
type Schema<V extends Values> = Partial<Record<keyof V, Rule[]>>;
type Errors<V extends Values> = Partial<Record<keyof V, string>>;

/**
 * A small form state: values, per-field errors, when to show them.
 *
 * - An error shows after the field is left (blur) or after a submit attempt,
 *   never while the visitor is still typing their first value; once shown it
 *   updates on every keystroke, so it disappears the moment the value is right.
 * - `submit(onValid)` validates everything, shows every error, focuses the
 *   first wrong field, and only then calls `onValid`.
 * - `setServerErrors` puts the server's answer on the fields it names.
 */
export function useForm<V extends Values>(initial: V, schema: Schema<V>) {
  const [values, setValues] = useState<V>(initial);
  const [touched, setTouched] = useState<Partial<Record<keyof V, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [server, setServer] = useState<Errors<V>>({});
  const refs = useRef<Partial<Record<keyof V, HTMLElement | null>>>({});

  const check = (name: keyof V, all: V = values): string | undefined => {
    const value = all[name];
    if (typeof value !== 'string') return undefined;
    for (const rule of schema[name] ?? []) {
      const message = rule(value);
      if (message) return message;
    }
    return undefined;
  };
  const errorOf = (name: keyof V) =>
    touched[name] || submitted ? (server[name] ?? check(name)) : server[name];

  const set = <K extends keyof V>(name: K, value: V[K]) => {
    setValues(current => ({...current, [name]: value}));
    setServer(current => ({...current, [name]: undefined}));
  };

  /** Everything a text input, textarea or select needs. */
  const field = (name: keyof V & string) => {
    const error = errorOf(name);
    const id = `f-${name}`;
    return {
      id,
      name,
      value: String(values[name] ?? ''),
      ref: (node: HTMLElement | null) => {
        refs.current[name] = node;
      },
      onChange: (event: {target: {value: string}}) => set(name, event.target.value as V[typeof name]),
      onBlur: () => setTouched(current => ({...current, [name]: true})),
      'aria-invalid': error ? true : undefined,
      'aria-describedby': error ? `${id}-error` : `${id}-hint`,
    };
  };

  const submit = (onValid: (values: V) => void) => (event?: FormEvent) => {
    event?.preventDefault();
    setSubmitted(true);
    const first = (Object.keys(schema) as (keyof V)[]).find(name => check(name));
    if (first) {
      refs.current[first]?.focus();
      return;
    }
    onValid(values);
  };

  const reset = (next: V = initial) => {
    setValues(next);
    setTouched({});
    setSubmitted(false);
    setServer({});
  };

  return {
    values,
    set,
    field,
    error: errorOf,
    submit,
    reset,
    setServerErrors: (errors: Errors<V>) => setServer(errors),
  };
}
