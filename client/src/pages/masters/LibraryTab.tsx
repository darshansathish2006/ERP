import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Edit3, LayoutTemplate, Trash2 } from 'lucide-react';
import { api, errorMessage, qs } from '../../lib/api';
import type { DesignData, Paged } from '../../lib/types';
import { Button, Empty, Field, IconButton, Input, PageLoading, Pagination, Select, Spinner } from '../../components/ui';
import { Modal } from '../../components/overlay';
import { useConfirm, useToast } from '../../components/feedback';
import { useMasters } from '../../context/MastersContext';
import { DesignSvg } from '../../configurator/DesignSvg';
import { SearchBox, useDebounced } from './shared';

interface LibraryDesign {
  id: number;
  name: string;
  systemId: string;
  systemName: string | null;
  colorId: string;
  glassId: string;
  data: DesignData;
  createdAt: string;
}

const PAGE_SIZE = 24;

function isDrawable(d: unknown): d is DesignData {
  if (!d || typeof d !== 'object') return false;
  const x = d as Partial<DesignData>;
  return Number(x.width) > 0 && Number(x.height) > 0 && !!x.root && typeof x.root === 'object';
}

export function LibraryTab({ readOnly = false }: { readOnly?: boolean }) {
  const { masters } = useMasters();
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<LibraryDesign> | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<LibraryDesign | null>(null);
  const seq = useRef(0);

  const [prevQ, setPrevQ] = useState(q);
  if (prevQ !== q) {
    setPrevQ(q);
    setPage(1);
  }

  const colorsById = useMemo(() => new Map(masters.colors.map((c) => [c.id, c])), [masters.colors]);

  useEffect(() => {
    const id = ++seq.current;
    setLoading(true);
    void (async () => {
      try {
        const res = await api.get<Paged<LibraryDesign>>(`/api/library${qs({ q, page, pageSize: PAGE_SIZE })}`);
        if (id !== seq.current) return;
        // The last item on a page was removed – step back to the previous page.
        if (!res.rows.length && res.total > 0 && page > 1) {
          setPage(Math.max(1, Math.ceil(res.total / PAGE_SIZE)));
          return;
        }
        setData(res);
      } catch (e) {
        if (id === seq.current) toast.error(errorMessage(e));
      } finally {
        if (id === seq.current) setLoading(false);
      }
    })();
  }, [q, page, reloadKey, toast]);

  const remove = useCallback(
    async (d: LibraryDesign) => {
      const ok = await confirm({
        title: 'Delete library design?',
        message: (
          <>
            <b>{d.name}</b> will be removed from the design library. Designs already added to quotes are not affected.
          </>
        ),
        confirmText: 'Delete',
        danger: true,
      });
      if (!ok) return;
      setDeleting(d.id);
      try {
        await api.del(`/api/library/${d.id}`);
        toast.success('Library design deleted');
        setReloadKey((k) => k + 1);
      } catch (e) {
        toast.error(errorMessage(e));
      } finally {
        setDeleting(null);
      }
    },
    [confirm, toast],
  );

  return (
    <div className="list-card" data-tour="masters-library">
      <div className="toolbar adm-toolbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Search design or system name" />
        {data && <span className="adm-toolbar-note">{data.total} designs</span>}
        <div className="adm-toolbar-spacer" />
        {loading && data && <Spinner />}
      </div>
      <div className="adm-scroll" style={{ position: 'relative' }}>
        {!data ? (
          <PageLoading />
        ) : data.rows.length ? (
          <div className="adm-lib-grid">
            {data.rows.map((d) => {
              const color = colorsById.get(d.colorId);
              return (
                <div key={d.id} className="adm-lib-card">
                  <div className="adm-lib-thumb">
                    {isDrawable(d.data) ? (
                      <DesignSvg data={d.data} frameColor={color?.hex_in || '#f4f4f2'} showDims={false} showLabels={false} showNumbers={false} />
                    ) : (
                      <span className="muted fs-12">Preview unavailable</span>
                    )}
                  </div>
                  <div className="adm-lib-body">
                    <div className="adm-lib-name ellipsis" title={d.name}>
                      {d.name}
                    </div>
                    <div className="adm-cell-sub ellipsis" title={d.systemName || d.systemId}>
                      {d.systemName || d.systemId}
                    </div>
                    <div className="adm-cell-sub">
                      {isDrawable(d.data) ? `${d.data.width} × ${d.data.height} mm` : '—'}
                      {color ? ` · ${color.name}` : ''}
                    </div>
                  </div>
                  {!readOnly && (
                    <IconButton className="adm-lib-edit" size="sm" tip="Edit" tipPos="left" onClick={() => setEditing(d)} data-tour="masters-library-edit">
                      <Edit3 size={14} />
                    </IconButton>
                  )}
                  <IconButton className="adm-lib-delete" size="sm" tip="Delete" tipPos="left" onClick={() => void remove(d)} disabled={deleting === d.id}>
                    {deleting === d.id ? <Spinner /> : <Trash2 size={14} />}
                  </IconButton>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty title={q ? 'No library designs match your search' : 'The design library is empty'} icon={<LayoutTemplate size={30} strokeWidth={1.4} />}>
            {!q && <span className="muted">Save a design to the library from the configurator to reuse it in other quotes.</span>}
          </Empty>
        )}
        {loading && data && <div className="loading-overlay" />}
      </div>
      {data && data.total > PAGE_SIZE && <Pagination total={data.total} page={page} pageSize={PAGE_SIZE} onPage={setPage} />}
      {editing && <EditLibraryModal design={editing} onClose={() => setEditing(null)} onSaved={() => setReloadKey((k) => k + 1)} />}
    </div>
  );
}

/** Rename a library design, change its system / colour / glass, or resize it (panels scale proportionally). */
function EditLibraryModal({ design, onClose, onSaved }: { design: LibraryDesign; onClose: () => void; onSaved: () => void }) {
  const { masters } = useMasters();
  const toast = useToast();
  const [f, setF] = useState({
    name: design.name,
    systemId: design.systemId,
    colorId: design.colorId,
    glassId: design.glassId,
    width: String(design.data?.width ?? ''),
    height: String(design.data?.height ?? ''),
  });
  const [errors, setErrors] = useState<Partial<Record<'name' | 'width' | 'height', string>>>({});
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    if (k in errors) setErrors((p) => ({ ...p, [k]: undefined }));
  };
  const system = masters.systems.find((s) => s.id === f.systemId);

  async function submit(ev?: FormEvent) {
    ev?.preventDefault();
    const e: typeof errors = {};
    if (!f.name.trim()) e.name = 'Design name is required';
    const w = Math.round(Number(f.width));
    const h = Math.round(Number(f.height));
    if (!(w >= 100 && w <= 12000)) e.width = 'Width must be 100–12000 mm';
    if (!(h >= 100 && h <= 12000)) e.height = 'Height must be 100–12000 mm';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      await api.put(`/api/library/${design.id}`, { name: f.name.trim(), systemId: f.systemId, colorId: f.colorId, glassId: f.glassId, width: w, height: h });
      onSaved();
      toast.success(`${f.name.trim().toUpperCase()} updated`);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
      setSaving(false);
    }
  }

  const lim = system?.limits;
  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit library design · ${design.name}`}
      closeOnBackdrop={false}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="adm-lib-form" loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <form id="adm-lib-form" className="adm-form-grid" onSubmit={(e) => void submit(e)} noValidate>
        <Field label="Design name" required error={errors.name} className="adm-span-2" htmlFor="lb-name">
          <Input id="lb-name" value={f.name} maxLength={80} autoFocus invalid={!!errors.name} style={{ textTransform: 'uppercase' }} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Width (mm)" required error={errors.width} htmlFor="lb-w" hint={lim ? `${system?.name}: ${lim.minWidth}–${lim.maxWidth}` : undefined}>
          <Input id="lb-w" type="number" min={100} max={12000} step={10} value={f.width} invalid={!!errors.width} onChange={(e) => set('width', e.target.value)} />
        </Field>
        <Field label="Height (mm)" required error={errors.height} htmlFor="lb-h" hint={lim ? `${lim.minHeight}–${lim.maxHeight}` : undefined}>
          <Input id="lb-h" type="number" min={100} max={12000} step={10} value={f.height} invalid={!!errors.height} onChange={(e) => set('height', e.target.value)} />
        </Field>
        <Field label="Profile system" required className="adm-span-2" htmlFor="lb-sys">
          <Select id="lb-sys" value={f.systemId} onChange={(e) => set('systemId', e.target.value)}>
            {masters.systems.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Colour" htmlFor="lb-col">
          <Select id="lb-col" value={f.colorId} onChange={(e) => set('colorId', e.target.value)}>
            {masters.colors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Glass" htmlFor="lb-gl">
          <Select id="lb-gl" value={f.glassId} onChange={(e) => set('glassId', e.target.value)}>
            {masters.glasses
              .filter((g) => g.kind === 'glass' || g.id === f.glassId)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
          </Select>
        </Field>
        <div className="muted fs-12 adm-span-2">Resizing scales every panel proportionally. Designs already added to quotes are not changed.</div>
      </form>
    </Modal>
  );
}
