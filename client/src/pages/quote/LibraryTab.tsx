import { useCallback, useEffect, useState } from 'react';
import { Filter, RefreshCw, Search, Trash2 } from 'lucide-react';
import { api, errorMessage, qs } from '../../lib/api';
import type { DesignData, Paged } from '../../lib/types';
import { useMasters } from '../../context/MastersContext';
import { useConfirm, useToast } from '../../components/feedback';
import { Button, Empty, IconButton, Pagination, Select, Spinner } from '../../components/ui';
import { DesignSvg } from '../../configurator/DesignSvg';

interface LibraryDesign {
  id: number;
  name: string;
  systemId: string;
  systemName: string;
  colorId: string;
  glassId: string;
  data: DesignData;
}

export function LibraryTab({ quoteId, onSelected }: { quoteId: number; onSelected: (designId: number) => void }) {
  const { masters } = useMasters();
  const toast = useToast();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [system, setSystem] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [data, setData] = useState<Paged<LibraryDesign> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(1), [debounced, system, pageSize]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get<Paged<LibraryDesign>>(`/api/library${qs({ q: debounced, systemId: system, page, pageSize })}`));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [debounced, system, page, pageSize, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const select = async (lib: LibraryDesign) => {
    setBusyId(lib.id);
    try {
      const r = await api.post<{ design: { id: number; ref: string } }>(`/api/quotes/${quoteId}/designs/from-library`, { libraryId: lib.id });
      toast.success(`${lib.name} added as ${r.design.ref}`);
      onSelected(r.design.id);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (lib: LibraryDesign) => {
    if (!(await confirm({ title: 'Remove library design', message: `Remove "${lib.name}" from the design library?`, confirmText: 'Remove', danger: true }))) return;
    try {
      await api.del(`/api/library/${lib.id}`);
      toast.success('Library design removed');
      void load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const colorHex = (id: string) => masters.colors.find((c) => c.id === id)?.hex_in || '#f4f4f2';
  const rows = data?.rows || [];

  return (
    <div className="list-card" style={{ flex: 1, minHeight: 0 }}>
      <div className="toolbar">
        <span className="fw-600">Library designs</span>
        <div className="grow" />
        <div className="toolbar-search">
          <Search size={14} />
          <input className="input" placeholder="Search library designs" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="row gap-4">
          <Filter size={13} color="var(--muted)" />
          <Select sm value={system} onChange={(e) => setSystem(e.target.value)} style={{ width: 260 }} aria-label="Filter by system">
            <option value="">All systems</option>
            {masters.systems.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </span>
        <IconButton tip="Refresh" onClick={() => void load()}>
          <RefreshCw size={14} />
        </IconButton>
      </div>
      <div className="design-grid" style={{ position: 'relative' }}>
        {rows.map((lib) => (
          <div key={lib.id} className="design-card lib-card">
            <div className="design-card-top">
              <span className="design-ref">{lib.name}</span>
              <div className="grow" />
              <IconButton size="sm" tip="Remove from library" onClick={() => void remove(lib)}>
                <Trash2 size={13} />
              </IconButton>
            </div>
            <div className="design-thumb" onClick={() => void select(lib)}>
              <DesignSvg data={lib.data} frameColor={colorHex(lib.colorId)} showLabels={false} showNumbers={false} fontScale={1.25} style={{ width: '100%', height: '100%' }} />
            </div>
            <div className="design-info">
              <div className="fw-600">{lib.name}</div>
              <div className="fs-12 muted">{lib.systemName}</div>
              <div className="fs-12 muted">
                {lib.data.width} × {lib.data.height} mm
              </div>
            </div>
            <div className="design-card-foot" style={{ justifyContent: 'center' }}>
              <Button variant="link" size="sm" loading={busyId === lib.id} onClick={() => void select(lib)}>
                Select design
              </Button>
            </div>
          </div>
        ))}
        {!loading && rows.length === 0 && (
          <div style={{ gridColumn: '1 / -1' }}>
            <Empty title="No library designs found" />
          </div>
        )}
        {loading && (
          <div className="loading-overlay">
            <Spinner size="lg" />
          </div>
        )}
      </div>
      {data && <Pagination total={data.total} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} sizes={[12, 24, 48, 96]} />}
    </div>
  );
}
