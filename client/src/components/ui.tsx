import { forwardRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff, PackageOpen } from 'lucide-react';

type Variant = 'primary' | 'success' | 'danger' | 'outline' | 'outline-primary' | 'ghost' | 'dark' | 'link';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'outline', size = 'md', loading, icon, children, className = '', disabled, type = 'button', ...rest },
  ref,
) {
  const cls = ['btn', `btn-${variant}`, size !== 'md' ? `btn-${size}` : '', className].filter(Boolean).join(' ');
  return (
    <button ref={ref} type={type} className={cls} disabled={disabled || loading} {...rest}>
      {loading ? <span className={`spinner ${variant === 'primary' || variant === 'success' || variant === 'danger' || variant === 'dark' ? 'spinner-white' : ''}`} style={{ width: 14, height: 14 }} /> : icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tip?: string;
  tipPos?: 'top' | 'bottom' | 'left' | 'right';
  active?: boolean;
  size?: 'sm' | 'md';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { tip, tipPos, active, size = 'md', className = '', children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={['icon-btn', size === 'sm' ? 'icon-btn-sm' : '', active ? 'active' : '', className].filter(Boolean).join(' ')}
      data-tip={tip}
      data-tip-pos={tipPos && tipPos !== 'top' ? tipPos : undefined}
      aria-label={tip || rest['aria-label']}
      {...rest}
    >
      {children}
    </button>
  );
});

export function Field({
  label,
  required,
  error,
  hint,
  children,
  className = '',
  htmlFor,
}: {
  label?: ReactNode;
  required?: boolean;
  error?: string | null;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={`field ${className}`}>
      {label != null && (
        <label htmlFor={htmlFor}>
          {label}
          {required && <span className="req">*</span>}
        </label>
      )}
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; sm?: boolean }>(function Input(
  { invalid, sm, className = '', ...rest },
  ref,
) {
  return <input ref={ref} className={['input', sm ? 'input-sm' : '', invalid ? 'invalid' : '', className].filter(Boolean).join(' ')} {...rest} />;
});

export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const [show, setShow] = useState(false);
  const { invalid, className = '', ...rest } = props;
  return (
    <div className="input-icon">
      <Input {...rest} invalid={invalid} className={className} type={show ? 'text' : 'password'} style={{ paddingRight: 34 }} />
      <button type="button" className="password-toggle" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} tabIndex={-1}>
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; sm?: boolean; placeholder?: string }>(function Select(
  { invalid, sm, className = '', placeholder, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={['select', sm ? 'select-sm' : '', invalid ? 'invalid' : '', className].filter(Boolean).join(' ')} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea(
  { invalid, className = '', ...rest },
  ref,
) {
  return <textarea ref={ref} className={['textarea', invalid ? 'invalid' : '', className].filter(Boolean).join(' ')} {...rest} />;
});

export function Checkbox({ checked, onChange, label, disabled, title }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean; title?: string }) {
  return (
    <label className="checkbox" title={title} onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" />
      {label}
    </label>
  );
}

export function Spinner({ size = 'md', white }: { size?: 'md' | 'lg'; white?: boolean }) {
  return <span className={['spinner', size === 'lg' ? 'spinner-lg' : '', white ? 'spinner-white' : ''].join(' ')} role="status" aria-label="Loading" />;
}

export function PageLoading() {
  return (
    <div className="page-loading">
      <Spinner size="lg" />
    </div>
  );
}

export function Empty({ title = 'No data found', children, icon }: { title?: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty">
      {icon ?? <PackageOpen size={30} strokeWidth={1.4} />}
      <div className="empty-title">{title}</div>
      {children}
    </div>
  );
}

export function Badge({ tone = 'grey', children }: { tone?: 'grey' | 'success' | 'danger' | 'primary' | 'warning'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const tone = status === 'won' ? 'success' : status === 'lost' ? 'danger' : 'primary';
  return <Badge tone={tone}>{status === 'won' ? 'Won' : status === 'lost' ? 'Lost' : 'Active'}</Badge>;
}

export function Pagination({
  total,
  page,
  pageSize,
  onPage,
  onPageSize,
  sizes = [10, 25, 50, 100],
}: {
  total: number;
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize?: (s: number) => void;
  sizes?: number[];
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const items: (number | '…')[] = [];
  if (pages <= 7) for (let i = 1; i <= pages; i++) items.push(i);
  else {
    items.push(1);
    if (page > 3) items.push('…');
    for (let i = Math.max(2, page - 1); i <= Math.min(pages - 1, page + 1); i++) items.push(i);
    if (page < pages - 2) items.push('…');
    items.push(pages);
  }
  return (
    <div className="pagination">
      <div className="row gap-12">
        <span>Total records: {total}</span>
        {onPageSize && (
          <select className="select select-sm" style={{ width: 150 }} value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} aria-label="Records per page">
            {sizes.map((s) => (
              <option key={s} value={s}>
                {s} records per page
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="pager">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft size={14} />
        </button>
        {items.map((it, i) =>
          it === '…' ? (
            <span key={`e${i}`} style={{ padding: '0 4px' }}>
              …
            </span>
          ) : (
            <button key={it} className={it === page ? 'active' : ''} onClick={() => onPage(it)}>
              {it}
            </button>
          ),
        )}
        <button disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className = '' }: { tabs: { value: T; label: ReactNode; count?: number; icon?: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={`tabs ${className}`} role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} className={`tab ${value === t.value ? 'active' : ''}`} onClick={() => onChange(t.value)}>
          {t.icon}
          {t.label}
          {t.count != null && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function BoxTabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="box-tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} className={`box-tab ${value === t.value ? 'active' : ''}`} onClick={() => onChange(t.value)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
