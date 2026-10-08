import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutTemplate, Trash2 } from 'lucide-react';
import { api, errorMessage, qs } from '../../lib/api';
import type { DesignData, Paged } from '../../lib/types';
import { Empty, IconButton, PageLoading, Pagination, Spinner } from '../../components/ui';
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

export function LibraryTab() {
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
    <div className="list-card">
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
    </div>
  );
}
