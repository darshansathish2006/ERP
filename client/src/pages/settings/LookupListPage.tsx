import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Check, GripVertical, ListChecks, Lock, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { inr } from '../../lib/format';
import { Badge, Button, Empty, IconButton, Input, Spinner } from '../../components/ui';
import { useConfirm, useToast } from '../../components/feedback';
import { useMasters } from '../../context/MastersContext';
import { SearchBox, parseNum } from '../masters/shared';
import { ReadOnlyNote, SkeletonRows, SubPage, useDirty, usePerms } from './common';
import type { LookupConfig, LookupEntry } from './registry';

interface RowDraft {
  value: string;
  rate: string;
}

const NO_LOCKED: string[] = [];

const rateOf = (e: LookupEntry): number | null => {
  const r = Number(e.meta?.rate);
  return e.meta?.rate === undefined || e.meta?.rate === null || e.meta?.rate === '' || !Number.isFinite(r) ? null : r;
};

export function LookupListPage({ type, noun, withRate, locked = NO_LOCKED }: LookupConfig) {
  const { refresh } = useMasters();
  const toast = useToast();
  const confirm = useConfirm();
  const canEdit = usePerms().settings;
  const [items, setItems] = useState<LookupEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState<RowDraft | null>(null);
  const [editing, setEditing] = useState<(RowDraft & { orig: string }) | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<Record<string, LookupEntry[]>>('/api/lookups');
      setItems((res[type] ?? []).filter((e) => !locked.some((l) => l.toLowerCase() === e.value.toLowerCase())));
      setLoadError(null);
    } catch (e) {
      setLoadError(errorMessage(e));
      toast.error(errorMessage(e));
    }
  }, [type, locked, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const editingEntry = editing ? items?.find((i) => i.value === editing.orig) : undefined;
  const dirty =
    (!!adding && (adding.value.trim() !== '' || adding.rate.trim() !== '')) ||
    (!!editing && !!editingEntry && (editing.value.trim() !== editingEntry.value || (withRate && parseNum(editing.rate) !== rateOf(editingEntry))));
  useDirty(!!dirty);

  const q = search.trim().toLowerCase();
  const visible = useMemo(() => (items ?? []).filter((i) => !q || i.value.toLowerCase().includes(q)), [items, q]);
  const lockedVisible = locked.filter((l) => !q || l.toLowerCase().includes(q));
  const canReorder = canEdit && !q && !editing && !adding && busy === null;

  function validate(value: string, rate: string, except?: string): string | null {
    const v = value.trim();
    if (!v) return 'Name is required';
    if (v.length > 120) return 'Keep the name under 120 characters';
    if (locked.some((l) => l.toLowerCase() === v.toLowerCase())) return `${v} is a built-in ${noun}`;
    if ((items ?? []).some((i) => i.value !== except && i.value.toLowerCase() === v.toLowerCase())) return `“${v}” already exists`;
    if (withRate && rate.trim()) {
      const r = parseNum(rate);
      if (r === null || r < 0) return 'Enter a rate of 0 or more';
    }
    return null;
  }

  const afterChange = async () => {
    await load();
    await refresh();
  };

  async function submitAdd(ev?: FormEvent) {
    ev?.preventDefault();
    if (!adding) return;
    const err = validate(adding.value, adding.rate);
    if (err) {
      toast.error(err);
      return;
    }
    const value = adding.value.trim();
    setBusy('__add__');
    try {
      await api.post(`/api/lookups/${type}`, { value, ...(withRate ? { meta: { rate: parseNum(adding.rate) ?? 0 } } : {}) });
      setAdding(null);
      await afterChange();
      toast.success(`“${value}” added`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function submitEdit(ev?: FormEvent) {
    ev?.preventDefault();
    if (!editing || !editingEntry) return;
    const err = validate(editing.value, editing.rate, editing.orig);
    if (err) {
      toast.error(err);
      return;
    }
    if (!dirty) {
      setEditing(null);
      return;
    }
    const value = editing.value.trim();
    setBusy(editing.orig);
    try {
      await api.put(`/api/lookups/${type}/${encodeURIComponent(editing.orig)}`, {
        value,
        meta: withRate ? { ...editingEntry.meta, rate: parseNum(editing.rate) ?? 0 } : editingEntry.meta,
      });
      setEditing(null);
      await afterChange();
      toast.success(value !== editing.orig ? `Renamed to “${value}”` : `“${value}” updated`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove(entry: LookupEntry) {
    const ok = await confirm({
      title: `Delete ${noun}?`,
      message: (
        <>
          <b>{entry.value}</b> will no longer be offered in dropdowns. Records that already use it keep their value.
        </>
      ),
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setBusy(entry.value);
    try {
      await api.del(`/api/lookups/${type}/${encodeURIComponent(entry.value)}`);
      await afterChange();
      toast.success(`“${entry.value}” deleted`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function reorder(from: number, to: number) {
    if (!items || from === to || to < 0 || to >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next);
    setBusy('__order__');
    try {
      await api.put(`/api/lookups/${type}`, { values: next.map((i) => i.value) });
      await refresh();
    } catch (e) {
      toast.error(errorMessage(e));
      await load();
    } finally {
      setBusy(null);
    }
  }

  const colCount = 3 + (withRate ? 1 : 0) + (canEdit ? 1 : 0);
  const startAdd = () => {
    setEditing(null);
    setSearch('');
    setAdding({ value: '', rate: '' });
  };

  const draftInputs = (d: RowDraft, set: (d: RowDraft) => void, onSubmit: () => void, onCancel: () => void, label: string) => (
    <>
      <td>
        <Input
          sm
          autoFocus
          value={d.value}
          maxLength={120}
          placeholder={`Enter ${noun} name`}
          aria-label={label}
          onChange={(e) => set({ ...d, value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onSubmit();
            } else if (e.key === 'Escape') {
              e.stopPropagation();
              onCancel();
            }
          }}
        />
      </td>
      {withRate && (
        <td className="num">
          <div className="input-rupee adm-rate">
            <input
              className="input input-sm"
              type="number"
              min={0}
              step="1"
              inputMode="decimal"
              value={d.rate}
              placeholder="0"
              aria-label="Rate per trip"
              onChange={(e) => set({ ...d, rate: e.target.value })}
              onWheel={(e) => e.currentTarget.blur()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onSubmit();
                }
              }}
            />
          </div>
        </td>
      )}
    </>
  );

  return (
    <SubPage
      fill
      actions={
        canEdit && (
          <Button variant="primary" icon={<Plus size={15} />} onClick={startAdd} disabled={!items || !!adding}>
            Add {noun}
          </Button>
        )
      }
    >
      {!canEdit && <ReadOnlyNote />}
      <div className="list-card">
        <div className="toolbar adm-toolbar">
          <SearchBox value={search} onChange={setSearch} placeholder={`Search ${noun}`} />
          {items && <span className="adm-toolbar-note">{q ? `${visible.length} of ${items.length}` : items.length} {items.length + locked.length === 1 ? 'item' : 'items'}{locked.length ? ` + ${locked.length} built-in` : ''}</span>}
          <div className="adm-toolbar-spacer" />
          {busy === '__order__' && <Spinner />}
          {canEdit && items && items.length > 1 && <span className="adm-toolbar-note">{q ? 'Clear the search to reorder' : 'Drag rows or use the arrows to change the order shown in dropdowns'}</span>}
        </div>
        <div className="table-wrap">
          <table className="table adm-lk-table">
            <thead>
              <tr>
                <th style={{ width: 34 }} aria-label="Reorder" />
                <th style={{ width: 54 }}>Sl No.</th>
                <th>Name</th>
                {withRate && (
                  <th className="num" style={{ width: 180 }}>
                    Rate (₹ per trip)
                  </th>
                )}
                {canEdit && (
                  <th className="text-right" style={{ width: 150 }}>
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {!items && !loadError && <SkeletonRows rows={6} cols={colCount} />}
              {adding && (
                <tr className="adm-lk-edit">
                  <td />
                  <td className="muted">New</td>
                  {draftInputs(adding, setAdding, () => void submitAdd(), () => setAdding(null), `New ${noun} name`)}
                  <td className="text-right nowrap">
                    <IconButton size="sm" tip="Save" onClick={() => void submitAdd()} disabled={busy === '__add__'}>
                      {busy === '__add__' ? <Spinner /> : <Check size={15} />}
                    </IconButton>
                    <IconButton size="sm" tip="Cancel" tipPos="left" onClick={() => setAdding(null)} disabled={busy === '__add__'}>
                      <X size={15} />
                    </IconButton>
                  </td>
                </tr>
              )}
              {visible.map((entry) => {
                const index = (items ?? []).indexOf(entry);
                const isEditing = editing?.orig === entry.value;
                const rowBusy = busy === entry.value;
                return (
                  <tr
                    key={entry.value}
                    className={[isEditing ? 'adm-lk-edit' : '', dragOver === index && dragFrom !== null && dragFrom !== index ? 'adm-drag-over' : '', dragFrom === index ? 'adm-dragging' : ''].join(' ')}
                    draggable={canReorder}
                    onDragStart={(e) => {
                      setDragFrom(index);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', entry.value);
                    }}
                    onDragOver={(e) => {
                      if (dragFrom === null) return;
                      e.preventDefault();
                      if (dragOver !== index) setDragOver(index);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = dragFrom;
                      setDragFrom(null);
                      setDragOver(null);
                      if (from !== null) void reorder(from, index);
                    }}
                    onDragEnd={() => {
                      setDragFrom(null);
                      setDragOver(null);
                    }}
                  >
                    <td className="adm-lk-grip">{canReorder && <GripVertical size={14} aria-hidden="true" />}</td>
                    <td className="muted">{index + 1}</td>
                    {isEditing && editing ? (
                      draftInputs(editing, (d) => setEditing({ ...editing, ...d }), () => void submitEdit(), () => setEditing(null), `Rename ${entry.value}`)
                    ) : (
                      <>
                        <td className="adm-cell-main">{entry.value}</td>
                        {withRate && <td className="num">{rateOf(entry) === null ? <span className="muted">—</span> : inr(rateOf(entry), 0)}</td>}
                      </>
                    )}
                    {canEdit && (
                      <td className="text-right nowrap">
                        {isEditing ? (
                          <>
                            <IconButton size="sm" tip="Save" onClick={() => void submitEdit()} disabled={rowBusy}>
                              {rowBusy ? <Spinner /> : <Check size={15} />}
                            </IconButton>
                            <IconButton size="sm" tip="Cancel" tipPos="left" onClick={() => setEditing(null)} disabled={rowBusy}>
                              <X size={15} />
                            </IconButton>
                          </>
                        ) : (
                          <>
                            <IconButton size="sm" tip="Move up" onClick={() => void reorder(index, index - 1)} disabled={!canReorder || index === 0}>
                              <ArrowUp size={14} />
                            </IconButton>
                            <IconButton size="sm" tip="Move down" onClick={() => void reorder(index, index + 1)} disabled={!canReorder || index === (items?.length ?? 0) - 1}>
                              <ArrowDown size={14} />
                            </IconButton>
                            <IconButton
                              size="sm"
                              tip="Edit"
                              disabled={busy !== null}
                              onClick={() => {
                                setAdding(null);
                                setEditing({ orig: entry.value, value: entry.value, rate: rateOf(entry) === null ? '' : String(rateOf(entry)) });
                              }}
                            >
                              <Pencil size={14} />
                            </IconButton>
                            <IconButton size="sm" tip="Delete" tipPos="left" className="adm-icon-danger" disabled={busy !== null} onClick={() => void remove(entry)}>
                              {rowBusy ? <Spinner /> : <Trash2 size={14} />}
                            </IconButton>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {items &&
                lockedVisible.map((l, i) => (
                  <tr key={`locked-${l}`} className="adm-lk-locked">
                    <td className="adm-lk-grip">
                      <Lock size={13} aria-hidden="true" />
                    </td>
                    <td className="muted">{items.length + i + 1}</td>
                    <td>
                      <span className="adm-cell-main">{l}</span>
                      <span style={{ marginLeft: 8 }}>
                        <Badge tone="grey">Built-in</Badge>
                      </span>
                    </td>
                    {withRate && <td />}
                    {canEdit && <td className="text-right adm-cell-sub">Cannot be changed</td>}
                  </tr>
                ))}
            </tbody>
          </table>
          {loadError && !items && (
            <Empty title="Could not load the list">
              <Button size="sm" onClick={() => void load()}>
                Retry
              </Button>
            </Empty>
          )}
          {items && !adding && visible.length === 0 && lockedVisible.length === 0 && (
            <Empty title={q ? `No ${noun} matches your search` : `No ${noun} added yet`} icon={<ListChecks size={30} strokeWidth={1.4} />}>
              {!q && canEdit && (
                <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={startAdd}>
                  Add {noun}
                </Button>
              )}
            </Empty>
          )}
        </div>
      </div>
    </SubPage>
  );
}
