import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface BaseProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  hideLabel?: boolean;
}

type InputProps = BaseProps & InputHTMLAttributes<HTMLInputElement> & { multiline?: false };
type TextareaProps = BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement> & { multiline: true };

// Labelled text field. The label is always rendered (visually hidden with
// hideLabel) so every field has an accessible name; hint and error text are
// wired up through aria-describedby, and errors set aria-invalid.
const Input = forwardRef<HTMLInputElement | HTMLTextAreaElement, InputProps | TextareaProps>(
  function Input(props, ref) {
    const { id, label, hint, error, hideLabel, className, ...rest } = props;
    const hintId = hint ? `${id}-hint` : undefined;
    const errorId = error ? `${id}-error` : undefined;
    const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
    const shared = {
      id,
      'aria-describedby': describedBy,
      'aria-invalid': error ? true : undefined,
      className: ['input', className ?? ''].filter(Boolean).join(' '),
    };

    return (
      <div className="field">
        <label htmlFor={id} className={hideLabel ? 'sr-only' : undefined}>
          {label}
        </label>
        {rest.multiline ? (
          <textarea
            ref={ref as React.Ref<HTMLTextAreaElement>}
            {...(omitMultiline(rest) as TextareaHTMLAttributes<HTMLTextAreaElement>)}
            {...shared}
          />
        ) : (
          <input
            ref={ref as React.Ref<HTMLInputElement>}
            {...(omitMultiline(rest) as InputHTMLAttributes<HTMLInputElement>)}
            {...shared}
          />
        )}
        {hint && (
          <p id={hintId} className="field-hint">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

function omitMultiline<T extends { multiline?: boolean }>(value: T): Omit<T, 'multiline'> {
  const { multiline: _multiline, ...rest } = value;
  return rest;
}

export default Input;
