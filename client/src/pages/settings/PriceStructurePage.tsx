import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Calculator, Check, ListPlus, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { CostHead } from '../../lib/types';
import { Badge, Button, Checkbox, Empty, Field, IconButton, Input, Select, Textarea } from '../../components/ui';
import { Modal } from '../../components/overlay';
import { useConfirm, useToast } from '../../components/feedback';
import { useMasters } from '../../context/MastersContext';
import { Kebab, ReadOnlyNote, SkeletonRows, SubPage, useDirty, usePerms } from './common';
import { evaFormula } from './shared';

interface PriceStructure {
  id: number;
  name: string;
  cost_heads: CostHead[];
  is_default: boolean;
}

interface HeadDraft {
  key: number;
  name: string;
  calcType: string;
  formula: string;
  rate: number;
  visibility: CostHead['visibility'];
  remark: string;
  userRights: string;
}

const ADMIN_RIGHTS = 'Administrator';
const ALLOCATE_RIGHTS = 'Allocate permission';
const FORMULA_TYPES = ['CustomFormula', 'Percentage'];

const CALC_HELP: Record<string, string> = {
  CustomFormula: 'Formula × Rate',
  Percentage: 'Formula × Rate ÷ 100',
  AreaSqftFg: 'Rate × design area in sqft',
  AreaSqmFg: 'Rate × design area in sqm',
  UserDefinedFGOverhead: 'Rate × design add-on costs entered on the quote',
  ManualPriceAutoAdjustment: 'Rate × adjustment needed to reach a frozen (manual) sqft rate',
  LumpSumDivideByArea: 'Lump sum shared across all designs in proportion to area',
  LumpSumPerDesign: 'Rate added once per design',
};

let keySeq = 0;
const toDraft = (h: CostHead): HeadDraft => ({
  key: ++keySeq,
  name: h.name,
  calcType: h.calcType,
  formula: h.formula ?? '',
  rate: Number(h.rate) || 0,
  visibility: h.visibility === 'summary' ? 'summary' : 'hidden',
  remark: h.remark ?? '',
  userRights: h.userRights === ALLOCATE_RIGHTS ? ALLOCATE_RIGHTS : ADMIN_RIGHTS,
});

const sameHead = (d: HeadDraft, h: CostHead) =>
  d.name === h.name &&
  d.calcType === h.calcType &&
  d.formula === (h.formula ?? '') &&
  d.rate === (Number(h.rate) || 0) &&
  d.visibility === (h.visibility === 'summary' ? 'summary' : 'hidden') &&
  d.remark === (h.remark ?? '') &&
  d.userRights === (h.userRights === ALLOCATE_RIGHTS ? ALLOCATE_RIGHTS : ADMIN_RIGHTS);

/** Mirrors the server-side checks for unknown variables and cost head references. */
export function formulaIssue(formula: string, earlier: string[], vars: Record<string, string>): string | null {
  const open = formula.split('[').length - 1;
  const close = formula.split(']').length - 1;
  if (open !== close) return 'Unbalanced [ ] in cost head reference';
  for (const m of formula.matchAll(/\[([^\]]*)\]/g)) {
    const ref = m[1].trim();
    if (!earlier.includes(ref)) return `Unknown cost head [${ref}] – it must be defined above this row`;
  }
  const noRefs = formula.replace(/\[[^\]]*\]/g, ' ');
  for (const m of noRefs.matchAll(/#([A-Za-z0-9_]*)/g)) {
    const v = m[1].toUpperCase();
    if (!v) return 'Expected a variable name after #';
    if (!(v in vars)) return `Unknown variable #${v}`;
  }
  const bad = /[^0-9.#A-Za-z_+\-*/()\s]/.exec(noRefs);
  if (bad) return `Unexpected character "${bad[0]}"`;
  return null;
}

/** Formula heads that only add up other heads (Total, Basic Value, Grand Total …) are highlighted. */
const isSumRow = (h: HeadDraft) => h.calcType === 'CustomFormula' && h.formula.includes('[') && !h.formula.includes('#');

export function PriceStructurePage() {
  const { masters, refresh } = useMasters();
  const toast = useToast();
  const confirm = useConfirm();
  const canEdit = usePerms().settings;
  const [list, setList] = useState<PriceStructure[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [heads, setHeads] = useState<HeadDraft[]>([]);
  const [makeDefault, setMakeDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [headModal, setHeadModal] = useState<{ mode: 'add' | 'reporting' } | { mode: 'edit'; key: number } | null>(null);

  const loadDraft = useCallback((ps: PriceStructure) => {
    setSelectedId(ps.id);
    setName(ps.name);
    setRenaming(null);
    setHeads(ps.cost_heads.map(toDraft));
    setMakeDefault(ps.is_default);
  }, []);

  const load = useCallback(
    async (select?: number) => {
      try {
        const rows = await api.get<PriceStructure[]>('/api/price-structures');
        setList(rows);
        setLoadError(null);
        const pick = rows.find((p) => p.id === select) ?? rows.find((p) => p.is_default) ?? rows[0];
        if (pick) loadDraft(pick);
      } catch (e) {
        setLoadError(errorMessage(e));
        toast.error(errorMessage(e));
      }
    },
    [loadDraft, toast],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const selected = list?.find((p) => p.id === selectedId) ?? null;
  const headsDirty = !!selected && (name !== selected.name || heads.length !== selected.cost_heads.length || heads.some((h, i) => !sameHead(h, selected.cost_heads[i])));
  const defaultDirty = !!selected && makeDefault && !selected.is_default;
  const dirty = headsDirty || defaultDirty || renaming !== null;
  useDirty(dirty);

  const issues = useMemo(() => {
    const out = new Map<number, string>();
    const seen: string[] = [];
    for (const h of heads) {
      const n = h.name.trim();
      if (!n) out.set(h.key, 'Name is required');
      else if (seen.includes(n)) out.set(h.key, `Duplicate name "${n}"`);
      else if (FORMULA_TYPES.includes(h.calcType)) {
        const f = formulaIssue(h.formula, seen, masters.formulaVariables);
        if (f) out.set(h.key, f);
      }
      if (n) seen.push(n);
    }
    return out;
  }, [heads, masters.formulaVariables]);

  const nameError = !name.trim() ? 'Name is required' : list?.some((p) => p.id !== selectedId && p.name.toLowerCase() === name.trim().toLowerCase()) ? 'Another price structure already uses this name' : null;

  async function switchTo(ps: PriceStructure) {
    if (ps.id === selectedId) return;
    if (dirty) {
      const ok = await confirm({
        title: 'Discard changes?',
        message: `You have unsaved changes to “${selected?.name}”. Discard them and open “${ps.name}”?`,
        confirmText: 'Discard changes',
        danger: true,
      });
      if (!ok) return;
    }
    loadDraft(ps);
  }

  const move = (i: number, d: -1 | 1) =>
    setHeads((prev) => {
      const j = i + d;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  async function removeHead(h: HeadDraft) {
    const users = heads.filter((o) => o.key !== h.key && o.formula.includes(`[${h.name}]`)).map((o) => o.name);
    const ok = await confirm({
      title: 'Delete cost head?',
      message: (
        <>
          <b>{h.name}</b> will be removed from {name}.
          {users.length > 0 && (
            <div className="alert alert-warning mt-8">
              It is used in the formula of {users.join(', ')}. Update {users.length > 1 ? 'those formulas' : 'that formula'} before saving.
            </div>
          )}
        </>
      ),
      confirmText: 'Delete',
      danger: true,
    });
    if (ok) setHeads((prev) => prev.filter((o) => o.key !== h.key));
  }

  function commitRename() {
    if (renaming === null) return;
    const n = renaming.trim();
    if (n) setName(n);
    setRenaming(null);
  }

  async function save() {
    if (!selected) return;
    if (renaming !== null) commitRename();
    const finalName = (renaming ?? name).trim();
    if (!finalName) {
      toast.error('Price structure name is required');
      return;
    }
    if (list?.some((p) => p.id !== selected.id && p.name.toLowerCase() === finalName.toLowerCase())) {
      toast.error('Another price structure already uses this name');
      return;
    }
    if (!heads.length) {
      toast.error('At least one cost head is required');
      return;
    }
    const first = heads.find((h) => issues.has(h.key));
    if (first) {
      toast.error(`Row ${heads.indexOf(first) + 1}${first.name.trim() ? ` (${first.name.trim()})` : ''}: ${issues.get(first.key)}`);
      return;
    }
    setSaving(true);
    try {
      if (headsDirty || finalName !== selected.name) {
        await api.put(`/api/price-structures/${selected.id}`, {
          name: finalName,
          cost_heads: heads.map((h, i) => ({
            sl: i + 1,
            name: h.name.trim(),
            calcType: h.calcType,
            formula: h.formula.trim(),
            rate: h.rate,
            visibility: h.visibility,
            remark: h.remark.trim(),
            userRights: h.userRights,
          })),
        });
      }
      if (makeDefault && !selected.is_default) await api.put(`/api/price-structures/${selected.id}/default`);
      await load(selected.id);
      await refresh();
      toast.success(`${finalName} saved`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const editingHead = headModal?.mode === 'edit' ? heads.find((h) => h.key === headModal.key) : undefined;
  const insertAt = heads.length ? heads.length - 1 : 0; // new heads go above the Grand Total (last head)
  const modalIndex = editingHead ? heads.indexOf(editingHead) : insertAt;

  return (
    <SubPage
      fill
      actions={
        canEdit && (
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setAddOpen(true)} disabled={!list}>
            Add price structure
          </Button>
        )
      }
      footer={
        canEdit &&
        selected && (
          <>
            <div className="adm-ps-default">
              <Checkbox
                checked={makeDefault}
                onChange={setMakeDefault}
                disabled={selected.is_default || saving}
                title={selected.is_default ? 'This is the default price structure. Set another one as default to change it.' : undefined}
                label="Set as default"
              />
              <span className="adm-cell-sub">New quotes use the default price structure. Existing quotes keep their own cost heads.</span>
            </div>
            {dirty && <span className="adm-toolbar-note warn">Unsaved changes</span>}
            <Button variant="outline" onClick={() => selected && loadDraft(selected)} disabled={!dirty || saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!dirty}>
              Save
            </Button>
          </>
        )
      }
    >
      {!canEdit && <ReadOnlyNote />}
      <div className="adm-ps">
        <aside className="card adm-pl-levels" aria-label="Price structures">
          <div className="adm-pl-levels-head">
            Price structures
            {list && <span className="tab-count">{list.length}</span>}
          </div>
          <div className="adm-pl-list">
            {!list && !loadError && Array.from({ length: 3 }, (_, i) => <span key={i} className="skeleton adm-skel adm-pl-skel" />)}
            {loadError && !list && (
              <div className="adm-cell-sub" style={{ padding: 8 }}>
                Could not load.{' '}
                <button type="button" className="adm-linkbtn" onClick={() => void load()}>
                  Retry
                </button>
              </div>
            )}
            {list?.map((p) => (
              <div key={p.id} className={`adm-pl-level ${p.id === selectedId ? 'active' : ''}`}>
                <button type="button" className="adm-pl-level-name" onClick={() => void switchTo(p)} title={p.name} aria-current={p.id === selectedId ? 'true' : undefined}>
                  {p.id === selectedId ? name : p.name}
                </button>
                {p.is_default && <Badge tone="primary">Default</Badge>}
              </div>
            ))}
          </div>
        </aside>
        <section className="list-card">
          <div className="adm-ps-heading">
            {renaming !== null ? (
              <div className="row" style={{ flex: 1, minWidth: 220 }}>
                <Input
                  autoFocus
                  value={renaming}
                  maxLength={80}
                  aria-label="Price structure name"
                  style={{ maxWidth: 320 }}
                  onChange={(e) => setRenaming(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    else if (e.key === 'Escape') {
                      e.stopPropagation();
                      setRenaming(null);
                    }
                  }}
                />
                <IconButton size="sm" tip="Apply" onClick={commitRename}>
                  <Check size={15} />
                </IconButton>
                <IconButton size="sm" tip="Cancel" onClick={() => setRenaming(null)}>
                  <X size={15} />
                </IconButton>
              </div>
            ) : (
              <div className="row grow">
                <h2 className="ellipsis">{selected ? name : list ? 'No price structure' : ' '}</h2>
                {selected?.is_default && <Badge tone="primary">Default</Badge>}
                {canEdit && selected && (
                  <IconButton size="sm" tip="Rename" onClick={() => setRenaming(name)}>
                    <Pencil size={14} />
                  </IconButton>
                )}
                {nameError && selected && <span className="field-error">{nameError}</span>}
              </div>
            )}
            {canEdit && selected && (
              <div className="row">
                <Button size="sm" variant="outline-primary" icon={<ListPlus size={14} />} onClick={() => setHeadModal({ mode: 'reporting' })}>
                  Add reporting element
                </Button>
                <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setHeadModal({ mode: 'add' })}>
                  Add cost head
                </Button>
              </div>
            )}
          </div>
          <div className="table-wrap">
            <table className="table adm-ps-grid">
              <thead>
                <tr>
                  {canEdit && <th className="kebab-cell" aria-label="Actions" />}
                  <th style={{ width: 60 }}>Sl No.</th>
                  <th style={{ minWidth: 190 }}>Cost Heads</th>
                  <th>User Rights</th>
                  <th>Calculation Type</th>
                  <th className="num">Default Rate</th>
                  <th style={{ minWidth: 300 }}>Calculation Formula</th>
                </tr>
              </thead>
              <tbody>
                {!list && !loadError && <SkeletonRows rows={10} cols={canEdit ? 7 : 6} />}
                {heads.map((h, i) => {
                  const issue = issues.get(h.key);
                  const isLast = i === heads.length - 1;
                  return (
                    <tr key={h.key} className={isSumRow(h) ? 'adm-ps-sum' : ''}>
                      {canEdit && (
                        <td className="kebab-cell">
                          <Kebab
                            label={`Actions for ${h.name}`}
                            items={[
                              { label: 'Edit', icon: <Pencil size={14} />, onClick: () => setHeadModal({ mode: 'edit', key: h.key }) },
                              { label: 'Move up', icon: <ArrowUp size={14} />, disabled: i === 0, onClick: () => move(i, -1) },
                              { label: 'Move down', icon: <ArrowDown size={14} />, disabled: isLast, onClick: () => move(i, 1) },
                              { separator: true },
                              { label: 'Delete', icon: <Trash2 size={14} />, danger: true, disabled: heads.length <= 1, onClick: () => void removeHead(h) },
                            ]}
                          />
                        </td>
                      )}
                      <td className="muted">{i + 1}</td>
                      <td>
                        <div className="adm-cell-main">{h.name || <span className="text-danger">Unnamed</span>}</div>
                        {h.visibility === 'summary' && <div className="adm-cell-sub">Shown in quote summary</div>}
                        {isLast && <div className="adm-cell-sub">Grand Total of the design</div>}
                        {h.remark && <div className="adm-cell-sub">{h.remark}</div>}
                        {issue && <div className="field-error">{issue}</div>}
                      </td>
                      <td className="nowrap">
                        {canEdit ? (
                          <button
                            type="button"
                            className="adm-linkbtn"
                            title="Click to switch between Administrator and Allocate permission"
                            onClick={() => setHeads((prev) => prev.map((o) => (o.key === h.key ? { ...o, userRights: o.userRights === ADMIN_RIGHTS ? ALLOCATE_RIGHTS : ADMIN_RIGHTS } : o)))}
                          >
                            {h.userRights}
                          </button>
                        ) : (
                          <span className="text-primary">{h.userRights}</span>
                        )}
                      </td>
                      <td className="nowrap" title={CALC_HELP[h.calcType]}>
                        {h.calcType}
                      </td>
                      <td className="num">{h.rate}</td>
                      <td>
                        <div className="adm-ps-formula">{evaFormula(h.formula) || <span className="muted">—</span>}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {list && !list.length && <Empty title="No price structures" icon={<Calculator size={30} strokeWidth={1.4} />} />}
          </div>
        </section>
      </div>
      {addOpen && list && (
        <AddStructureModal
          list={list}
          defaultCopy={selectedId}
          onClose={() => setAddOpen(false)}
          onCreated={async (id, n) => {
            setAddOpen(false);
            if (dirty) {
              const ok = await confirm({ title: 'Open the new price structure?', message: 'Your unsaved changes to the current structure will be discarded.', confirmText: 'Discard and open', danger: true });
              await load(ok ? id : (selectedId ?? undefined));
            } else await load(id);
            await refresh();
            toast.success(`${n} created`);
          }}
        />
      )}
      {headModal && (
        <HeadModal
          title={headModal.mode === 'edit' ? `Edit ${editingHead?.name ?? 'cost head'}` : headModal.mode === 'reporting' ? 'Add reporting element' : 'Add cost head'}
          initial={
            editingHead ?? {
              key: ++keySeq,
              name: '',
              calcType: 'CustomFormula',
              formula: '',
              rate: 1,
              visibility: headModal.mode === 'reporting' ? 'summary' : 'hidden',
              remark: '',
              userRights: ADMIN_RIGHTS,
            }
          }
          earlier={heads.slice(0, modalIndex).map((h) => h.name.trim()).filter(Boolean)}
          otherNames={heads.filter((h) => h.key !== editingHead?.key).map((h) => h.name.trim())}
          onClose={() => setHeadModal(null)}
          onSave={(d) => {
            setHeads((prev) => (editingHead ? prev.map((h) => (h.key === d.key ? d : h)) : [...prev.slice(0, insertAt), d, ...prev.slice(insertAt)]));
            setHeadModal(null);
          }}
        />
      )}
    </SubPage>
  );
}

function AddStructureModal({
  list,
  defaultCopy,
  onClose,
  onCreated,
}: {
  list: PriceStructure[];
  defaultCopy: number | null;
  onClose: () => void;
  onCreated: (id: number, name: string) => Promise<void>;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [copyFrom, setCopyFrom] = useState<number | ''>(defaultCopy ?? list[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const n = name.trim();
    if (!n) return setError('Name is required');
    if (list.some((p) => p.name.toLowerCase() === n.toLowerCase())) return setError('A price structure with this name already exists');
    setSaving(true);
    try {
      const created = await api.post<{ id: number; name: string }>('/api/price-structures', { name: n, copyFrom: copyFrom || undefined });
      await onCreated(created.id, created.name);
    } catch (e) {
      toast.error(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Add price structure"
      closeOnBackdrop={false}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="adm-ps-add" loading={saving}>
            Add price structure
          </Button>
        </>
      }
    >
      <form id="adm-ps-add" className="col gap-12" onSubmit={(e) => void submit(e)} noValidate>
        <Field label="Name" required error={error} htmlFor="ps-new-name">
          <Input
            id="ps-new-name"
            value={name}
            autoFocus
            maxLength={80}
            invalid={!!error}
            placeholder="e.g. Builder Projects"
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
        </Field>
        <Field label="Copy cost heads from" hint="Saved cost heads are copied; you can change them afterwards." htmlFor="ps-copy">
          <Select id="ps-copy" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value ? Number(e.target.value) : '')}>
            {list.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      </form>
    </Modal>
  );
}

function HeadModal({
  title,
  initial,
  earlier,
  otherNames,
  onClose,
  onSave,
}: {
  title: string;
  initial: HeadDraft;
  /** Names of the heads above this one – the only ones a formula may reference. */
  earlier: string[];
  otherNames: string[];
  onClose: () => void;
  onSave: (d: HeadDraft) => void;
}) {
  const { masters } = useMasters();
  const [d, setD] = useState<HeadDraft>(initial);
  const [rate, setRate] = useState(String(initial.rate));
  const [touched, setTouched] = useState(false);
  const formulaRef = useRef<HTMLTextAreaElement | null>(null);
  const usesFormula = FORMULA_TYPES.includes(d.calcType);

  const n = d.name.trim();
  const nameError = !n ? 'Name is required' : otherNames.includes(n) ? 'Another cost head already uses this name' : /[[\]]/.test(n) ? 'Name cannot contain [ or ]' : null;
  const rateNum = rate.trim() === '' ? null : Number(rate);
  const rateError = rateNum === null || !Number.isFinite(rateNum) ? 'Enter a number' : null;
  const formulaError = usesFormula ? formulaIssue(d.formula, earlier, masters.formulaVariables) : null;

  const insert = (token: string) => {
    const el = formulaRef.current;
    const f = d.formula;
    const start = el ? el.selectionStart : f.length;
    const end = el ? el.selectionEnd : f.length;
    const before = f.slice(0, start);
    const after = f.slice(end);
    const pre = before && !/\s$/.test(before) ? ' ' : '';
    const post = after && !/^\s/.test(after) ? ' ' : '';
    const next = `${before}${pre}${token}${post}${after}`;
    setD((p) => ({ ...p, formula: next }));
    const caret = before.length + pre.length + token.length;
    window.setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    }, 0);
  };

  function submit(ev: FormEvent) {
    ev.preventDefault();
    setTouched(true);
    if (nameError || rateError || formulaError) return;
    onSave({ ...d, name: n, formula: d.formula.trim(), remark: d.remark.trim(), rate: rateNum ?? 0 });
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={title}
      closeOnBackdrop={false}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="adm-head-form">
            Apply
          </Button>
        </>
      }
    >
      <form id="adm-head-form" className="adm-form-grid" onSubmit={submit} noValidate>
        <Field label="Cost head name" required error={touched ? nameError : null} className="adm-span-2" htmlFor="hd-name">
          <Input id="hd-name" value={d.name} autoFocus maxLength={80} invalid={touched && !!nameError} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. Packing Charges" />
        </Field>
        <Field label="Calculation type" required hint={CALC_HELP[d.calcType]} htmlFor="hd-type">
          <Select id="hd-type" value={d.calcType} onChange={(e) => setD({ ...d, calcType: e.target.value })}>
            {masters.calcTypes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            {!masters.calcTypes.includes(d.calcType) && <option value={d.calcType}>{d.calcType}</option>}
          </Select>
        </Field>
        <Field label="Default rate" required error={touched ? rateError : null} hint={d.calcType === 'Percentage' ? 'Percentage, e.g. 18 for 18%' : undefined} htmlFor="hd-rate">
          <Input id="hd-rate" type="number" step="any" value={rate} invalid={touched && !!rateError} onWheel={(e) => e.currentTarget.blur()} onChange={(e) => setRate(e.target.value)} />
        </Field>
        <Field
          label="Calculation formula"
          className="adm-span-2"
          error={formulaError}
          hint={usesFormula ? 'Click a variable or cost head below to insert it at the cursor.' : `Not evaluated for ${d.calcType} – kept for reference.`}
          htmlFor="hd-formula"
        >
          <Textarea
            id="hd-formula"
            ref={formulaRef}
            rows={3}
            className="adm-formula-input"
            spellCheck={false}
            maxLength={1000}
            value={d.formula}
            invalid={!!formulaError}
            placeholder="e.g. [Basic Value] - [Discount]"
            onChange={(e) => setD({ ...d, formula: e.target.value })}
          />
        </Field>
        {d.formula.trim() && (
          <div className="adm-span-2 adm-formula-preview">
            <span className="adm-cell-sub">Shown as </span>
            <span className="adm-ps-formula">{evaFormula(d.formula)}</span>
          </div>
        )}
        <div className="adm-span-2">
          <div className="field-label mb-8">Variables</div>
          <div className="adm-chips">
            {Object.entries(masters.formulaVariables).map(([v, desc]) => (
              <button key={v} type="button" className="adm-token" title={desc} onClick={() => insert(`#${v}`)}>
                #{v}
              </button>
            ))}
          </div>
          <div className="field-label mt-12 mb-8">Cost heads above this row</div>
          <div className="adm-chips">
            {earlier.length ? (
              earlier.map((h) => (
                <button key={h} type="button" className="adm-token ref" onClick={() => insert(`[${h}]`)}>
                  [{h}]
                </button>
              ))
            ) : (
              <span className="adm-cell-sub">This is the first cost head.</span>
            )}
          </div>
        </div>
        <Field label="Visibility" htmlFor="hd-vis">
          <Select id="hd-vis" value={d.visibility} onChange={(e) => setD({ ...d, visibility: e.target.value as HeadDraft['visibility'] })}>
            <option value="hidden">Do not show in Quote</option>
            <option value="summary">Show in Quote Summary</option>
          </Select>
        </Field>
        <Field label="User rights" htmlFor="hd-rights">
          <Select id="hd-rights" value={d.userRights} onChange={(e) => setD({ ...d, userRights: e.target.value })}>
            <option value={ADMIN_RIGHTS}>{ADMIN_RIGHTS}</option>
            <option value={ALLOCATE_RIGHTS}>{ALLOCATE_RIGHTS}</option>
          </Select>
        </Field>
        <Field label="Remark" className="adm-span-2" htmlFor="hd-remark">
          <Textarea id="hd-remark" rows={2} maxLength={500} value={d.remark} onChange={(e) => setD({ ...d, remark: e.target.value })} placeholder="Optional note for other administrators" />
        </Field>
      </form>
    </Modal>
  );
}
