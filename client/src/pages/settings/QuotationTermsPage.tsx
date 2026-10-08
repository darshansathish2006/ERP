import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { Company } from '../../lib/types';
import { Button, Field, IconButton, Input, Select, Textarea } from '../../components/ui';
import { useToast } from '../../components/feedback';
import { useMasters } from '../../context/MastersContext';
import { ReadOnlyNote, SubPage, useDirty, usePerms } from './common';

interface Line {
  id: number;
  text: string;
}

interface BrandRow {
  id: number;
  label: string;
  names: string;
}

let seq = 0;
const toLines = (arr: string[] | undefined): Line[] => (arr || []).map((text) => ({ id: ++seq, text }));
const clean = (lines: Line[]) => lines.map((l) => l.text.trim()).filter(Boolean);
const sameList = (a: string[], b: string[] | undefined) => {
  const bb = b || [];
  return a.length === bb.length && a.every((x, i) => x === bb[i]);
};
const toBrands = (b: Company['brands']): BrandRow[] => (b || []).map((r) => ({ id: ++seq, label: r.label, names: r.names.join(', ') }));
const cleanBrands = (rows: BrandRow[]) =>
  rows
    .map((r) => ({ label: r.label.trim(), names: r.names.split(',').map((n) => n.trim()).filter(Boolean) }))
    .filter((r) => r.label || r.names.length);

const DEFAULT_BANK_AFTER = 1;

interface Draft {
  letter: Line[];
  payment: Line[];
  terms: Line[];
  bankAfterId: number | null;
  warrantyTitle: string;
  warranty: string;
  warrantyPoints: Line[];
  warrantyNote: string;
  prereq: Line[];
  acceptance: string;
  brands: BrandRow[];
}

function toDraft(c: Company): Draft {
  const terms = toLines(c.terms);
  const idx = Math.min(c.bankDetailsAfter ?? DEFAULT_BANK_AFTER, terms.length - 1);
  return {
    letter: toLines(c.letter),
    payment: toLines(c.paymentTerms),
    terms,
    bankAfterId: terms[idx]?.id ?? null,
    warrantyTitle: c.warrantyTitle || '',
    warranty: c.warranty || '',
    warrantyPoints: toLines(c.warrantyPoints),
    warrantyNote: c.warrantyNote || '',
    prereq: toLines(c.prerequisites),
    acceptance: c.acceptance || '',
    brands: toBrands(c.brands),
  };
}

/** Index of the chosen term among the non-blank terms that will be saved. */
function bankIndex(d: Draft, fallback: number): number {
  const kept = d.terms.filter((l) => l.text.trim());
  const i = kept.findIndex((l) => l.id === d.bankAfterId);
  return i >= 0 ? i : Math.max(0, Math.min(fallback, kept.length - 1));
}

const SECTIONS = [
  { id: 'qt-letter', label: 'Covering letter' },
  { id: 'qt-payment', label: 'Payment terms' },
  { id: 'qt-terms', label: 'Terms & conditions' },
  { id: 'qt-warranty', label: 'Warranty' },
  { id: 'qt-prereq', label: 'Prerequisites' },
  { id: 'qt-acceptance', label: 'Acceptance' },
  { id: 'qt-brands', label: 'Brands' },
];

export function QuotationTermsPage() {
  const { masters, refresh } = useMasters();
  const toast = useToast();
  const canEdit = usePerms().settings;
  const company = masters.company;
  const [d, setD] = useState<Draft>(() => toDraft(company));
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setD((prev) => ({ ...prev, [key]: value }));

  const savedBankAfter = company.bankDetailsAfter ?? DEFAULT_BANK_AFTER;
  const dirty =
    !sameList(clean(d.letter), company.letter) ||
    !sameList(clean(d.payment), company.paymentTerms) ||
    !sameList(clean(d.terms), company.terms) ||
    bankIndex(d, savedBankAfter) !== Math.max(0, Math.min(savedBankAfter, (company.terms?.length ?? 1) - 1)) ||
    d.warrantyTitle.trim() !== (company.warrantyTitle || '') ||
    d.warranty.trim() !== (company.warranty || '') ||
    !sameList(clean(d.warrantyPoints), company.warrantyPoints) ||
    d.warrantyNote.trim() !== (company.warrantyNote || '') ||
    !sameList(clean(d.prereq), company.prerequisites) ||
    d.acceptance.trim() !== (company.acceptance || '') ||
    JSON.stringify(cleanBrands(d.brands)) !== JSON.stringify(company.brands || []);
  useDirty(dirty);

  const allLines = [...d.letter, ...d.payment, ...d.terms, ...d.warrantyPoints, ...d.prereq];
  const blanks = allLines.filter((l) => !l.text.trim()).length;

  async function save() {
    if (allLines.some((l) => l.text.trim().length > 1000)) {
      toast.error('Each line must be 1000 characters or fewer.');
      return;
    }
    if (!clean(d.terms).length) {
      toast.error('Add at least one term & condition.');
      return;
    }
    setSaving(true);
    try {
      const saved = await api.put<Company>('/api/settings/company', {
        ...company,
        letter: clean(d.letter),
        paymentTerms: clean(d.payment),
        terms: clean(d.terms),
        bankDetailsAfter: bankIndex(d, savedBankAfter),
        warrantyTitle: d.warrantyTitle.trim(),
        warranty: d.warranty.trim(),
        warrantyPoints: clean(d.warrantyPoints),
        warrantyNote: d.warrantyNote.trim(),
        prerequisites: clean(d.prereq),
        acceptance: d.acceptance.trim(),
        brands: cleanBrands(d.brands),
      });
      await refresh();
      setD(toDraft(saved));
      toast.success('Quotation terms saved');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const keptTerms = d.terms.filter((l) => l.text.trim());
  const disabled = !canEdit || saving;

  return (
    <SubPage
      footer={
        canEdit && (
          <>
            {dirty ? (
              <span className="adm-toolbar-note warn">
                Unsaved changes{blanks ? ` · ${blanks} blank line${blanks > 1 ? 's' : ''} will be removed` : ''}
              </span>
            ) : (
              <span className="adm-toolbar-note">No unsaved changes</span>
            )}
            <Button variant="ghost" icon={<RotateCcw size={14} />} disabled={!dirty || saving} onClick={() => setD(toDraft(company))}>
              Reset
            </Button>
            <Button variant="primary" icon={<Save size={14} />} loading={saving} disabled={!dirty} onClick={() => void save()}>
              Save
            </Button>
          </>
        )
      }
    >
      {!canEdit && <ReadOnlyNote />}
      <div className="adm-jump" aria-label="Jump to section">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" className="adm-jump-link" onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="card card-pad adm-narrow">
        <div className="adm-cell-sub mb-16">
          Text wrapped in <code className="adm-code">**double asterisks**</code> prints in bold. Lines starting with <code className="adm-code">a. </code>, <code className="adm-code">b. </code> … print as indented
          sub-points.
        </div>

        <Section id="qt-letter" title="Covering letter" count={d.letter.length} hint="Paragraphs of the letter on the first page.">
          <ListEditor label="Letter paragraph" lines={d.letter} onChange={(v) => set('letter', v)} addLabel="Add paragraph" disabled={disabled} numbered={false} />
        </Section>

        <Section id="qt-payment" title="Payment terms" count={d.payment.length} hint="Printed as the sub-points (a, b, …) of term 1 “Payments terms”.">
          <ListEditor label="Payment term" lines={d.payment} onChange={(v) => set('payment', v)} addLabel="Add payment term" disabled={disabled} letters />
        </Section>

        <Section id="qt-terms" title="Terms & conditions" count={d.terms.length} hint="Numbered from 2 – term 1 is the payment terms above.">
          <ListEditor label="Term" lines={d.terms} onChange={(v) => set('terms', v)} addLabel="Add term" disabled={disabled} startAt={2} />
          <Field label="Print the bank details after" className="mt-12" htmlFor="qt-bank" hint="The company bank account block is inserted after this term.">
            <Select id="qt-bank" value={d.bankAfterId ?? ''} disabled={disabled || !keptTerms.length} onChange={(e) => set('bankAfterId', Number(e.target.value))} style={{ maxWidth: 560 }}>
              {!keptTerms.length && <option value="">Add a term first</option>}
              {keptTerms.map((l, i) => (
                <option key={l.id} value={l.id}>
                  Term {i + 2}: {l.text.replace(/\*\*/g, '').slice(0, 70)}
                  {l.text.length > 70 ? '…' : ''}
                </option>
              ))}
            </Select>
          </Field>
        </Section>

        <Section id="qt-warranty" title="Warranty">
          <div className="col gap-12">
            <Field label="Warranty title" htmlFor="qt-wtitle">
              <Input id="qt-wtitle" value={d.warrantyTitle} disabled={disabled} maxLength={300} onChange={(e) => set('warrantyTitle', e.target.value)} />
            </Field>
            <Field label="Warranty clarification" htmlFor="qt-warranty-text">
              <Textarea id="qt-warranty-text" rows={3} value={d.warranty} disabled={disabled} onChange={(e) => set('warranty', e.target.value)} />
            </Field>
            <div>
              <div className="field-label mb-8">Warranty points</div>
              <ListEditor label="Warranty point" lines={d.warrantyPoints} onChange={(v) => set('warrantyPoints', v)} addLabel="Add point" disabled={disabled} numbered={false} />
            </div>
            <Field label="Warranty note" htmlFor="qt-wnote">
              <Textarea id="qt-wnote" rows={2} value={d.warrantyNote} disabled={disabled} onChange={(e) => set('warrantyNote', e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section id="qt-prereq" title="Prerequisites at site" count={d.prereq.length} hint="Numbered; lines starting with “a. ” are sub-points of the previous item.">
          <ListEditor label="Prerequisite" lines={d.prereq} onChange={(v) => set('prereq', v)} addLabel="Add prerequisite" disabled={disabled} />
        </Section>

        <Section id="qt-acceptance" title="Acceptance">
          <Field htmlFor="qt-accept" hint="Printed above the customer signature.">
            <Textarea id="qt-accept" rows={3} value={d.acceptance} disabled={disabled} onChange={(e) => set('acceptance', e.target.value)} />
          </Field>
        </Section>

        <Section id="qt-brands" title="Brands" count={d.brands.length} hint="Brands of the materials used, printed as a table on the quotation.">
          <BrandsEditor rows={d.brands} onChange={(v) => set('brands', v)} disabled={disabled} />
        </Section>
      </div>
    </SubPage>
  );
}

function Section({ id, title, count, hint, children }: { id: string; title: string; count?: number; hint?: string; children: ReactNode }) {
  return (
    <div className="adm-form-section adm-qt-section" id={id}>
      <div className="adm-section-title">
        {title}
        {count !== undefined && <span className="badge badge-grey">{count}</span>}
      </div>
      {hint && <div className="adm-cell-sub mb-8">{hint}</div>}
      {children}
    </div>
  );
}

function ListEditor({
  label,
  lines,
  onChange,
  addLabel,
  disabled,
  startAt = 1,
  numbered = true,
  letters,
}: {
  label: string;
  lines: Line[];
  onChange: (lines: Line[]) => void;
  addLabel: string;
  disabled?: boolean;
  startAt?: number;
  numbered?: boolean;
  letters?: boolean;
}) {
  const [lastAdded, setLastAdded] = useState<number | null>(null);
  const update = (id: number, text: string) => onChange(lines.map((l) => (l.id === id ? { ...l, text } : l)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= lines.length) return;
    const next = [...lines];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = () => {
    const l = { id: ++seq, text: '' };
    setLastAdded(l.id);
    onChange([...lines, l]);
  };
  return (
    <div className="adm-list-editor">
      {lines.length === 0 && <div className="muted fs-12">No lines yet.</div>}
      {lines.map((l, i) => (
        <div key={l.id} className="adm-list-row">
          <span className={`adm-list-no ${numbered || letters ? '' : 'adm-list-dot'}`}>{letters ? String.fromCharCode(97 + (i % 26)) : numbered ? i + startAt : '•'}</span>
          <Textarea
            rows={2}
            value={l.text}
            onChange={(e) => update(l.id, e.target.value)}
            autoFocus={l.id === lastAdded}
            disabled={disabled}
            aria-label={`${label} ${i + 1}`}
            placeholder="Type the line as it should appear on the quotation"
          />
          {!disabled && (
            <div className="adm-list-actions-row">
              <IconButton size="sm" tip="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                <ArrowUp size={14} />
              </IconButton>
              <IconButton size="sm" tip="Move down" onClick={() => move(i, 1)} disabled={i === lines.length - 1}>
                <ArrowDown size={14} />
              </IconButton>
              <IconButton size="sm" tip="Remove" tipPos="left" className="adm-icon-danger" onClick={() => onChange(lines.filter((x) => x.id !== l.id))}>
                <Trash2 size={14} />
              </IconButton>
            </div>
          )}
        </div>
      ))}
      {!disabled && (
        <div>
          <Button size="sm" variant="outline" icon={<Plus size={14} />} onClick={add}>
            {addLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

function BrandsEditor({ rows, onChange, disabled }: { rows: BrandRow[]; onChange: (rows: BrandRow[]) => void; disabled?: boolean }) {
  const update = (id: number, patch: Partial<BrandRow>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="adm-list-editor">
      {rows.length > 0 && (
        <div className="adm-brand-row adm-brand-head">
          <span>Material</span>
          <span>Brand names (comma separated)</span>
          <span />
        </div>
      )}
      {rows.map((r, i) => (
        <div key={r.id} className="adm-brand-row">
          <Input sm value={r.label} disabled={disabled} maxLength={60} placeholder="e.g. HARDWARE" aria-label={`Brand row ${i + 1} material`} onChange={(e) => update(r.id, { label: e.target.value })} />
          <Input sm value={r.names} disabled={disabled} maxLength={300} placeholder="e.g. SIEGENIA, DEKA" aria-label={`Brand row ${i + 1} names`} onChange={(e) => update(r.id, { names: e.target.value })} />
          {!disabled ? (
            <div className="adm-list-actions-row">
              <IconButton size="sm" tip="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                <ArrowUp size={14} />
              </IconButton>
              <IconButton size="sm" tip="Move down" onClick={() => move(i, 1)} disabled={i === rows.length - 1}>
                <ArrowDown size={14} />
              </IconButton>
              <IconButton size="sm" tip="Remove" tipPos="left" className="adm-icon-danger" onClick={() => onChange(rows.filter((x) => x.id !== r.id))}>
                <Trash2 size={14} />
              </IconButton>
            </div>
          ) : (
            <span />
          )}
        </div>
      ))}
      {rows.length === 0 && <div className="muted fs-12">No brands listed.</div>}
      {!disabled && (
        <div>
          <Button size="sm" variant="outline" icon={<Plus size={14} />} onClick={() => onChange([...rows, { id: ++seq, label: '', names: '' }])}>
            Add brand row
          </Button>
        </div>
      )}
    </div>
  );
}
