import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Filter,
  LayoutGrid,
  List,
  ListOrdered,
  Paintbrush,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { Design, FullQuote } from '../../lib/types';
import { inr } from '../../lib/format';
import { useMasters } from '../../context/MastersContext';
import { useConfirm, useToast } from '../../components/feedback';
import { Button, Empty, Field, Input, Pagination, Select } from '../../components/ui';
import { Drawer, Menu, Modal, Popover } from '../../components/overlay';
import { DesignCard, DesignRow, type DesignActions } from './DesignCard';
import { DesignDetailsDrawer, DesignOrderDialog, GlobalEditDialog, ProjectDefaultsDialog, type GlobalField } from './designDialogs';
import { LibraryTab } from './LibraryTab';

interface Props {
  data: FullQuote;
  reload: () => Promise<FullQuote | null>;
  onOpenConfigurator: (designId: number | 'new') => void;
}

export function DesignTab({ data, reload, onOpenConfigurator }: Props) {
  const { masters } = useMasters();
  const toast = useToast();
  const confirm = useConfirm();
  const [libOpen, setLibOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [filters, setFilters] = useState({ systemId: '', colorId: '', location: '' });
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLButtonElement | null>(null);
  const [globalField, setGlobalField] = useState<GlobalField | null>(null);
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [libName, setLibName] = useState<{ design: Design; name: string } | null>(null);

  useEffect(() => {
    setSelected((s) => s.filter((id) => data.designs.some((d) => d.id === id)));
  }, [data.designs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.designs.filter((d) => {
      if (q && ![d.ref, d.name, d.location, d.systemName, d.colorName].some((x) => (x || '').toLowerCase().includes(q))) return false;
      if (filters.systemId && d.systemId !== filters.systemId) return false;
      if (filters.colorId && d.colorId !== filters.colorId) return false;
      if (filters.location && !(d.location || '').toLowerCase().includes(filters.location.toLowerCase())) return false;
      return true;
    });
  }, [data.designs, search, filters]);
  useEffect(() => setPage(1), [search, filters, pageSize]);
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const filterCount = Object.values(filters).filter(Boolean).length;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await api.post(`/api/quotes/${data.quote.id}/update-pricing`);
      await reload();
      toast.success('Designs refreshed');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRefreshing(false);
    }
  };

  const actions: DesignActions = {
    onEdit: (d) => onOpenConfigurator(d.id),
    onView: (d) => setDetailsId(d.id),
    onDuplicate: async (d) => {
      try {
        const r = await api.post<{ design: Design }>(`/api/designs/${d.id}/duplicate`);
        toast.success(`${d.ref} duplicated as ${r.design.ref}`);
        await reload();
      } catch (e) {
        toast.error(errorMessage(e));
      }
    },
    onSaveToLibrary: (d) => setLibName({ design: d, name: d.name || d.ref }),
    onDelete: async (d) => {
      if (!(await confirm({ title: 'Delete design', message: `Delete design ${d.ref}${d.name ? ` (${d.name})` : ''}? This cannot be undone.`, confirmText: 'Delete', danger: true }))) return;
      try {
        await api.del(`/api/designs/${d.id}`);
        toast.success(`${d.ref} deleted`);
        await reload();
      } catch (e) {
        toast.error(errorMessage(e));
      }
    },
  };

  const bulkDelete = async () => {
    if (!(await confirm({ title: 'Delete designs', message: `Delete ${selected.length} selected design${selected.length > 1 ? 's' : ''}? This cannot be undone.`, confirmText: 'Delete', danger: true }))) return;
    try {
      await api.post(`/api/quotes/${data.quote.id}/designs/bulk-delete`, { ids: selected });
      toast.success('Designs deleted');
      setSelected([]);
      await reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const saveToLibrary = async () => {
    if (!libName) return;
    if (!libName.name.trim()) {
      toast.error('Enter a name for the library design');
      return;
    }
    try {
      await api.post(`/api/designs/${libName.design.id}/save-to-library`, { name: libName.name.trim() });
      toast.success(`${libName.name.trim().toUpperCase()} saved to library designs`);
      setLibName(null);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const toggle = (id: number, v: boolean) => setSelected((s) => (v ? [...new Set([...s, id])] : s.filter((x) => x !== id)));
  const allOnPage = pageRows.length > 0 && pageRows.every((d) => selected.includes(d.id));

  return (
    <div className="quote-pane design-pane">
      <div className="design-head">
        <h2 className="design-title">Project</h2>
        <div className="grow" />
        <Menu
          trigger={({ ref, onClick }) => (
            <Button ref={ref} size="sm" icon={<Paintbrush size={13} />} onClick={onClick} disabled={!data.designs.length}>
              Global edits
              <ChevronDown size={13} />
            </Button>
          )}
          items={[
            { label: 'Change profile colour', onClick: () => setGlobalField('colorId') },
            { label: 'Change glass', onClick: () => setGlobalField('glassId') },
            { label: 'Change profile system', onClick: () => setGlobalField('systemId') },
            { label: 'Change quantity', onClick: () => setGlobalField('qty') },
            { label: 'Change location', onClick: () => setGlobalField('location') },
          ]}
        />
        <Button size="sm" icon={<Settings2 size={13} />} onClick={() => setDefaultsOpen(true)}>
          Project defaults
        </Button>
      </div>

      {data.designs.length === 0 ? (
        <div className="design-empty">
          <div className="design-empty-block">
            <h3>Select a design from templates</h3>
            <p className="muted fs-12">Select from a list of wide variety of predefined designs</p>
            <Button variant="primary" size="sm" onClick={() => setLibOpen(true)}>
              Choose from library designs
            </Button>
          </div>
          <div className="design-empty-block shaded">
            <h3>Create new design</h3>
            <p className="muted fs-12">Create a new Design new typologies depending on customer preference for systems, colors and other technical specifications</p>
            <Button variant="primary" size="sm" onClick={() => onOpenConfigurator('new')}>
              Create design
            </Button>
          </div>
        </div>
      ) : (
        <div className="list-card" style={{ flex: 1, minHeight: 0 }}>
          <div className="toolbar">
            <Button variant="primary" size="sm" onClick={() => onOpenConfigurator('new')}>
              Create design
            </Button>
            <Button variant="dark" size="sm" onClick={() => setLibOpen(true)}>
              Choose from library designs
            </Button>
            {selected.length > 0 && (
              <div className="row bulk-bar">
                <span className="fs-12">{selected.length} selected</span>
                <Button size="xs" icon={<Paintbrush size={12} />} onClick={() => setGlobalField('colorId')}>
                  Edit selected
                </Button>
                <Button size="xs" variant="danger" icon={<Trash2 size={12} />} onClick={bulkDelete}>
                  Delete
                </Button>
                <button className="icon-btn icon-btn-sm" onClick={() => setSelected([])} aria-label="Clear selection">
                  <X size={13} />
                </button>
              </div>
            )}
            <div className="grow" />
            <div className="toolbar-search">
              <Search size={14} />
              <input className="input" placeholder="Search designs" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button size="sm" variant="dark" icon={<RefreshCw size={13} />} loading={refreshing} onClick={refresh}>
              Refresh designs
            </Button>
            <Button size="sm" variant="ghost" icon={<ListOrdered size={13} />} onClick={() => setOrderOpen(true)}>
              Design orders
            </Button>
            <Button ref={filterRef} size="sm" variant="ghost" icon={<Filter size={13} />} onClick={() => setFilterOpen((o) => !o)}>
              Filter{filterCount ? ` (${filterCount})` : ''}
            </Button>
            <Popover open={filterOpen} onClose={() => setFilterOpen(false)} anchor={filterRef} placement="bottom-end">
              <div className="col gap-12" style={{ padding: 14, width: 280 }}>
                <Field label="Profile system">
                  <Select sm value={filters.systemId} onChange={(e) => setFilters((f) => ({ ...f, systemId: e.target.value }))}>
                    <option value="">All</option>
                    {masters.systems.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Colour">
                  <Select sm value={filters.colorId} onChange={(e) => setFilters((f) => ({ ...f, colorId: e.target.value }))}>
                    <option value="">All</option>
                    {masters.colors.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Location contains">
                  <Input sm value={filters.location} onChange={(e) => setFilters((f) => ({ ...f, location: e.target.value }))} />
                </Field>
                <Button size="sm" onClick={() => setFilters({ systemId: '', colorId: '', location: '' })}>
                  Clear filters
                </Button>
              </div>
            </Popover>
            <div className="seg">
              <button className={layoutMode === 'list' ? 'active' : ''} onClick={() => setLayoutMode('list')} aria-label="List view" title="List view">
                <List size={14} />
              </button>
              <button className={layoutMode === 'grid' ? 'active' : ''} onClick={() => setLayoutMode('grid')} aria-label="Grid view" title="Grid view">
                <LayoutGrid size={14} />
              </button>
            </div>
          </div>
          {filtered.length === 0 ? (
            <Empty title="No designs match your search" />
          ) : layoutMode === 'grid' ? (
            <div className="design-grid">
              {pageRows.map((d) => (
                <DesignCard key={d.id} design={d} selected={selected.includes(d.id)} onToggle={(v) => toggle(d.id, v)} actions={actions} />
              ))}
            </div>
          ) : (
            <div className="table-wrap" style={{ flex: 1 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={allOnPage}
                        onChange={(e) => setSelected((s) => (e.target.checked ? [...new Set([...s, ...pageRows.map((d) => d.id)])] : s.filter((x) => !pageRows.some((d) => d.id === x))))}
                        style={{ accentColor: 'var(--primary)' }}
                        aria-label="Select all"
                      />
                    </th>
                    <th />
                    <th>Ref</th>
                    <th>Name</th>
                    <th>Location</th>
                    <th>Size (mm)</th>
                    <th className="num">Area (sqft)</th>
                    <th>System</th>
                    <th>Colour</th>
                    <th className="num">Qty</th>
                    <th className="num">Unit price</th>
                    <th className="num">Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((d) => (
                    <DesignRow key={d.id} design={d} selected={selected.includes(d.id)} onToggle={(v) => toggle(d.id, v)} actions={actions} />
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={9} className="text-right fw-600">
                      Total
                    </td>
                    <td className="num fw-600">{data.summary.qty}</td>
                    <td />
                    <td className="num fw-600">{inr(data.summary.grand)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <Pagination total={filtered.length} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} />
        </div>
      )}

      {globalField && (
        <GlobalEditDialog
          open
          field={globalField}
          quoteId={data.quote.id}
          selectedIds={selected}
          onClose={() => setGlobalField(null)}
          onDone={() => {
            setGlobalField(null);
            void reload();
          }}
        />
      )}
      <ProjectDefaultsDialog
        open={defaultsOpen}
        quote={data.quote}
        onClose={() => setDefaultsOpen(false)}
        onDone={() => {
          setDefaultsOpen(false);
          void reload();
        }}
      />
      <DesignOrderDialog
        open={orderOpen}
        quoteId={data.quote.id}
        designs={data.designs}
        onClose={() => setOrderOpen(false)}
        onDone={() => {
          setOrderOpen(false);
          void reload();
        }}
      />
      <Drawer open={libOpen} onClose={() => setLibOpen(false)} title="Library designs" width="xwide">
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <LibraryTab
            quoteId={data.quote.id}
            onSelected={async (id) => {
              await reload();
              setLibOpen(false);
              onOpenConfigurator(id);
            }}
          />
        </div>
      </Drawer>
      <DesignDetailsDrawer
        designId={detailsId}
        onClose={() => setDetailsId(null)}
        onEdit={(id) => {
          setDetailsId(null);
          onOpenConfigurator(id);
        }}
      />
      <Modal
        open={!!libName}
        onClose={() => setLibName(null)}
        title="Save to library designs"
        size="sm"
        footer={
          <>
            <Button onClick={() => setLibName(null)}>Cancel</Button>
            <Button variant="primary" onClick={saveToLibrary}>
              Save
            </Button>
          </>
        }
      >
        <Field label="Library design name" required>
          <Input value={libName?.name || ''} onChange={(e) => setLibName((l) => (l ? { ...l, name: e.target.value } : l))} autoFocus onKeyDown={(e) => e.key === 'Enter' && void saveToLibrary()} />
        </Field>
      </Modal>
    </div>
  );
}
