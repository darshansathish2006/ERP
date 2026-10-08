import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Search, X } from 'lucide-react';
import { useAnchoredPosition } from './overlay';

export interface ComboOption {
  value: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
}

interface BaseProps {
  options: ComboOption[];
  placeholder?: string;
  searchable?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  createLabel?: string;
  onCreate?: (query: string) => void;
  sm?: boolean;
  id?: string;
  clearable?: boolean;
}

interface SingleProps extends BaseProps {
  multiple?: false;
  value: string;
  onChange: (value: string) => void;
}
interface MultiProps extends BaseProps {
  multiple: true;
  value: string[];
  onChange: (value: string[]) => void;
}

export function Combobox(props: SingleProps | MultiProps) {
  const { options, placeholder = 'Select', searchable = true, invalid, disabled, createLabel, onCreate, sm, id, clearable } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hl, setHl] = useState(0);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const style = useAnchoredPosition(open, anchorRef, panelRef, 'bottom-start', true);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    setHl(0);
    const t = window.setTimeout(() => searchRef.current?.focus(), 10);
    const h = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', h);
    };
  }, [open]);

  const isSelected = (v: string) => (props.multiple ? props.value.includes(v) : props.value === v);
  const choose = (v: string) => {
    if (props.multiple) {
      props.onChange(props.value.includes(v) ? props.value.filter((x) => x !== v) : [...props.value, v]);
    } else {
      props.onChange(v);
      setOpen(false);
      setQuery('');
      anchorRef.current?.focus();
    }
  };

  const display = (() => {
    if (props.multiple) {
      if (!props.value.length) return <span className="placeholder">{placeholder}</span>;
      return (
        <span className="chips">
          {props.value.map((v) => (
            <span key={v} className="chip">
              {options.find((o) => o.value === v)?.label ?? v}
            </span>
          ))}
        </span>
      );
    }
    const sel = options.find((o) => o.value === props.value);
    if (!sel) return props.value ? <span>{props.value}</span> : <span className="placeholder">{placeholder}</span>;
    return (
      <span className="row gap-4 ellipsis">
        {sel.icon}
        <span className="ellipsis">{sel.label}</span>
      </span>
    );
  })();

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHl((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHl((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[hl]) choose(filtered[hl].value);
      else if (onCreate && query.trim()) {
        onCreate(query.trim());
        setOpen(false);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className={`combo ${open ? 'open' : ''} ${invalid ? 'invalid' : ''}`}>
      <button
        id={id}
        ref={anchorRef}
        type="button"
        className={`combo-control ${sm ? 'sm' : ''}`}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={disabled ? { background: 'var(--surface-3)', cursor: 'not-allowed', color: 'var(--muted)' } : undefined}
      >
        <span className="grow" style={{ display: 'flex', overflow: 'hidden' }}>
          {display}
        </span>
        {clearable && !disabled && (props.multiple ? props.value.length > 0 : !!props.value) && (
          <span
            role="button"
            aria-label="Clear"
            style={{ display: 'flex', marginRight: 4, color: 'var(--muted)' }}
            onClick={(e) => {
              e.stopPropagation();
              if (props.multiple) props.onChange([]);
              else props.onChange('');
            }}
          >
            <X size={13} />
          </span>
        )}
      </button>
      {open &&
        createPortal(
          <div className="combo-panel" ref={panelRef} style={style} role="listbox" onKeyDown={onKey}>
            {searchable && (
              <div className="combo-search">
                <div className="input-icon">
                  <Search size={14} />
                  <input
                    ref={searchRef}
                    className="input input-sm"
                    placeholder="Search..."
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setHl(0);
                    }}
                  />
                </div>
              </div>
            )}
            <div className="combo-options" tabIndex={searchable ? -1 : 0} onKeyDown={searchable ? undefined : onKey}>
              {filtered.length === 0 && <div className="combo-empty">No options found</div>}
              {filtered.map((o, i) => (
                <div
                  key={o.value}
                  className={`combo-option ${isSelected(o.value) && !props.multiple ? 'selected' : ''} ${i === hl ? 'hl' : ''}`}
                  onMouseEnter={() => setHl(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o.value)}
                  role="option"
                  aria-selected={isSelected(o.value)}
                >
                  {props.multiple && <input type="checkbox" readOnly checked={isSelected(o.value)} style={{ accentColor: 'var(--primary)' }} />}
                  {o.icon}
                  <span className="grow">{o.label}</span>
                  {o.hint && <span className="fs-11" style={{ opacity: 0.7 }}>{o.hint}</span>}
                </div>
              ))}
            </div>
            {onCreate && (
              <div
                className="combo-action"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onCreate(query.trim());
                  setOpen(false);
                  setQuery('');
                }}
              >
                <Plus size={14} /> {createLabel || 'Create'}
                {query.trim() ? ` "${query.trim()}"` : ''}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
