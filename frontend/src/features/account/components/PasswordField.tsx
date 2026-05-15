import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password' | 'off';
  disabled?: boolean;
  /** Force visibility from the parent (e.g. share toggle across "new" + "confirm"). */
  forceShow?: boolean;
  /** Hide the eye toggle (used when visibility is controlled externally). */
  hideToggle?: boolean;
}

export default function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  disabled,
  forceShow,
  hideToggle,
}: PasswordFieldProps) {
  const [localShow, setLocalShow] = useState(false);
  const visible = forceShow ?? localShow;

  return (
    <div className="space-y-2">
      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          disabled={disabled}
          className="w-full h-12 px-4 pr-11 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/40 outline-none text-sm disabled:opacity-60"
        />
        {!hideToggle && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setLocalShow((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          >
            {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
}
