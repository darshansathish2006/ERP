import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { City } from '../../lib/types';
import { Button, Empty, Field, IconButton, Input, Pagination, Select, Spinner } from '../../components/ui';
import { Modal } from '../../components/overlay';
import { useConfirm, useToast } from '../../components/feedback';
import { useMasters } from '../../context/MastersContext';
import { SearchBox } from '../masters/shared';
import { ReadOnlyNote, SkeletonRows, SubPage, usePerms } from './common';

interface CityRow extends City {
  opportunities: number;
}

export function CitiesPage() {
  const { refresh } = useMasters();
  const toast = useToast();
  const confirm = useConfirm();
  const canEdit = usePerms().settings;
  const [rows, setRows] = useState<CityRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [state, setState] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [editing, setEditing] = useState<CityRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api.get<CityRow[]>('/api/cities'));
      setLoadError(null);
    } catch (e) {
      setLoadError(errorMessage(e));
      toast.error(errorMessage(e));
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const states = useMemo(() => [...new Set((rows ?? []).map((r) => r.state).filter(Boolean))].sort(), [rows]);
  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () => (rows ?? []).filter((r) => (!state || r.state === state) && (!q || r.name.toLowerCase().includes(q) || r.state.toLowerCase().includes(q))),
    [rows, q, state],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize);

  async function remove(c: CityRow) {
    const ok = await confirm({
      title: 'Delete city?',
      message: (
        <>
          <b>{c.name}</b>, {c.state} will be removed from the city list.
        </>
      ),
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setDeleting(c.id);
    try {
      await api.del(`/api/cities/${c.id}`);
      await load();
      await refresh();
      toast.success(`${c.name} deleted`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDeleting(null);
    }
  }

  const cols = canEdit ? 5 : 4;

  return (
    <SubPage
      fill
      actions={
        canEdit && (
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing('new')} disabled={!rows}>
            Add city
          </Button>
        )
      }
    >
      {!canEdit && <ReadOnlyNote />}
      <div className="list-card">
        <div className="toolbar adm-toolbar">
          <SearchBox
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search city or state"
          />
          <Select
            sm
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              setPage(1);
            }}
            style={{ width: 190 }}
            aria-label="State"
          >
            <option value="">All states</option>
            {states.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          {rows && <span className="adm-toolbar-note">{filtered.length === rows.length ? `${rows.length} cities` : `${filtered.length} of ${rows.length} cities`}</span>}
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>City</th>
                <th>State</th>
                <th>Country</th>
                <th className="num">Opportunities</th>
                {canEdit && (
                  <th className="text-right" style={{ width: 110 }}>
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {!rows && !loadError && <SkeletonRows cols={cols} />}
              {visible.map((c) => (
                <tr key={c.id}>
                  <td className="adm-cell-main">{c.name}</td>
                  <td>{c.state || <span className="muted">—</span>}</td>
                  <td>{c.country || <span className="muted">—</span>}</td>
                  <td className="num">{c.opportunities}</td>
                  {canEdit && (
                    <td className="text-right nowrap">
                      <IconButton size="sm" tip="Edit" onClick={() => setEditing(c)}>
                        <Pencil size={14} />
                      </IconButton>
                      <IconButton
                        size="sm"
                        tip={c.opportunities ? 'Used by opportunities – cannot be deleted' : 'Delete'}
                        tipPos="left"
                        className="adm-icon-danger"
                        disabled={!!c.opportunities || deleting === c.id}
                        onClick={() => void remove(c)}
                      >
                        {deleting === c.id ? <Spinner /> : <Trash2 size={14} />}
                      </IconButton>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {loadError && !rows && (
            <Empty title="Could not load cities">
              <Button size="sm" onClick={() => void load()}>
                Retry
              </Button>
            </Empty>
          )}
          {rows && !filtered.length && <Empty title={rows.length ? 'No cities match your search' : 'No cities added yet'} icon={<MapPin size={30} strokeWidth={1.4} />} />}
        </div>
        {rows && filtered.length > 0 && (
          <Pagination
            total={filtered.length}
            page={current}
            pageSize={pageSize}
            onPage={setPage}
            onPageSize={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        )}
      </div>
      {editing && rows && (
        <CityModal
          city={editing === 'new' ? null : editing}
          existing={rows}
          states={states}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => {
            setEditing(null);
            await load();
            await refresh();
            toast.success(msg);
          }}
        />
      )}
    </SubPage>
  );
}

function CityModal({
  city,
  existing,
  states,
  onClose,
  onSaved,
}: {
  city: CityRow | null;
  existing: CityRow[];
  states: string[];
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const toast = useToast();
  const [name, setName] = useState(city?.name ?? '');
  const [state, setState] = useState(city?.state ?? 'TAMILNADU');
  const [country, setCountry] = useState(city?.country ?? 'INDIA');
  const [errors, setErrors] = useState<{ name?: string; state?: string }>({});
  const [saving, setSaving] = useState(false);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const n = name.trim().toUpperCase();
    const e: typeof errors = {};
    if (!n) e.name = 'City name is required';
    else if (existing.some((c) => c.id !== city?.id && c.name.toUpperCase() === n)) e.name = 'This city already exists';
    if (!state.trim()) e.state = 'State is required';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const body = { name: n, state: state.trim().toUpperCase(), country: country.trim().toUpperCase() || 'INDIA' };
      if (city) await api.put(`/api/cities/${city.id}`, body);
      else await api.post('/api/masters/cities', body);
      await onSaved(city ? `${n} updated` : `${n} added`);
    } catch (err) {
      toast.error(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={city ? `Edit ${city.name}` : 'Add city'}
      closeOnBackdrop={false}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="adm-city-form" loading={saving}>
            {city ? 'Save' : 'Add city'}
          </Button>
        </>
      }
    >
      <form id="adm-city-form" className="col gap-12" onSubmit={(e) => void submit(e)} noValidate>
        {city && city.opportunities > 0 && <div className="alert alert-info">Renaming also updates the {city.opportunities} opportunities in this city.</div>}
        <Field label="City" required error={errors.name} htmlFor="ct-name">
          <Input
            id="ct-name"
            value={name}
            autoFocus
            maxLength={80}
            invalid={!!errors.name}
            style={{ textTransform: 'uppercase' }}
            onChange={(e) => {
              setName(e.target.value);
              setErrors((p) => ({ ...p, name: undefined }));
            }}
          />
        </Field>
        <Field label="State" required error={errors.state} htmlFor="ct-state">
          <Input
            id="ct-state"
            value={state}
            list="adm-state-list"
            maxLength={80}
            invalid={!!errors.state}
            style={{ textTransform: 'uppercase' }}
            onChange={(e) => {
              setState(e.target.value);
              setErrors((p) => ({ ...p, state: undefined }));
            }}
          />
          <datalist id="adm-state-list">
            {states.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="Country" htmlFor="ct-country">
          <Input id="ct-country" value={country} maxLength={80} style={{ textTransform: 'uppercase' }} onChange={(e) => setCountry(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
