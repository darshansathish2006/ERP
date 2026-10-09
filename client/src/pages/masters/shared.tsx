import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Search, X } from 'lucide-react';
import type { ColorDef } from '../../lib/types';

/** Returns `value` once it has stopped changing for `delay` ms. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Toolbar search input with a leading icon and a clear button. */
export function SearchBox({ value, onChange, placeholder = 'Search', width }: { value: string; onChange: (v: string) => void; placeholder?: string; width?: number }) {
  return (
    <div className="toolbar-search">
      <Search size={14} />
      <input
        className={`input ${value ? 'adm-has-clear' : ''}`}
        type="text"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        style={width ? { width } : undefined}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.stopPropagation();
            onChange('');
          }
        }}
      />
      {value && (
        <button type="button" className="adm-search-clear" onClick={() => onChange('')} aria-label="Clear search">
          <X size={13} />
        </button>
      )}
    </div>
  );
}

/** Parse a user-entered number; blank or non-numeric input gives null. */
export function parseNum(s: string | null | undefined): number | null {
  const t = String(s ?? '').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function isValidRate(s: string | null | undefined): boolean {
  const n = parseNum(s);
  return n !== null && n >= 0;
}

export function numStr(n: number | null | undefined): string {
  return n == null ? '' : String(n);
}

/** Right-aligned ₹ input used for inline rate editing. */
export function RateInput({ value, onChange, dirty, label, disabled }: { value: string; onChange: (v: string) => void; dirty?: boolean; label: string; disabled?: boolean }) {
  const invalid = !isValidRate(value);
  return (
    <div className={`input-rupee adm-rate ${dirty ? 'dirty' : ''}`}>
      <input
        className={`input input-sm ${invalid ? 'invalid' : ''}`}
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        value={value}
        disabled={disabled}
        aria-label={label}
        aria-invalid={invalid || undefined}
        title={invalid ? 'Enter a rate of 0 or more' : undefined}
        onChange={(e) => onChange(e.target.value)}
        onWheel={(e) => e.currentTarget.blur()}
      />
    </div>
  );
}

/** Square swatch split diagonally: inside colour top-left, outside colour bottom-right. */
export function ColorSwatch({ color, size = 44 }: { color: Pick<ColorDef, 'hex_in' | 'hex_out'> & { name?: string }; size?: number }) {
  return (
    <span
      className="adm-swatch"
      role="img"
      aria-label={color.name ? `${color.name} swatch` : 'Colour swatch'}
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${color.hex_in} 50%, ${color.hex_out} 50%)` }}
    />
  );
}

export const UNITS = ['Meter', 'Pcs', 'Set', 'CAN', 'SQMT'] as const;

export const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Why master records are locked (used by systems, the BOM rules, designs …), keyed by code / id. */
export interface MasterUsage {
  items: Record<string, string[]>;
  glasses: Record<string, string[]>;
  colors: Record<string, string[]>;
  systems: Record<string, string[]>;
}

/** Loads /api/masters/usage; refresh() after adding, editing or deleting records. */
export function useMasterUsage(): { usage: MasterUsage | null; refresh: () => Promise<void> } {
  const [usage, setUsage] = useState<MasterUsage | null>(null);
  const refresh = useCallback(async () => {
    try {
      setUsage(await api.get<MasterUsage>('/api/masters/usage'));
    } catch {
      setUsage({ items: {}, glasses: {}, colors: {}, systems: {} });
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { usage, refresh };
}

/** "Used by A; B" tooltip text for a locked record. */
export function usageText(reasons: string[] | undefined): string {
  return reasons?.length ? `Used by ${reasons.join('; ')}` : '';
}
