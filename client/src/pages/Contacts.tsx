import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Contact } from 'lucide-react';
import { api, errorMessage, qs } from '../lib/api';
import type { Paged } from '../lib/types';
import { dateTimeFmt, initials, relativeTime } from '../lib/format';
import { Badge, Empty, PageLoading, Pagination, Spinner } from '../components/ui';
import { useToast } from '../components/feedback';
import { SearchBox, useDebounced } from './masters/shared';

interface ContactRow {
  name: string;
  phone: string;
  email: string;
  city: string | null;
  state: string | null;
  opportunities: number;
  won: number;
  lastActivity: string | null;
  lastOpportunityId: number;
  search: string;
}

const PAGE_SIZES = [10, 25, 50, 100];

export default function ContactsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState<Paged<ContactRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const filterKey = `${q}|${pageSize}`;
  const [prevKey, setPrevKey] = useState(filterKey);
  if (prevKey !== filterKey) {
    setPrevKey(filterKey);
    setPage(1);
  }

  useEffect(() => {
    const id = ++seq.current;
    setLoading(true);
    void (async () => {
      try {
        const res = await api.get<Paged<ContactRow>>(`/api/contacts${qs({ q, page, pageSize })}`);
        if (id === seq.current) setData(res);
      } catch (e) {
        if (id === seq.current) toast.error(errorMessage(e));
      } finally {
        if (id === seq.current) setLoading(false);
      }
    })();
  }, [q, page, pageSize, toast]);

  const open = (r: ContactRow) => navigate(`/opportunity/${r.lastOpportunityId}/edit`);

  return (
    <div className="page-flush adm-flush">
      <div className="page-head">
        <div>
          <div className="page-title">Contacts</div>
          <div className="adm-sub">Customers collected from your opportunities. Open a contact to see their latest opportunity.</div>
        </div>
      </div>
      <div className="list-card">
        <div className="toolbar adm-toolbar">
          <SearchBox value={search} onChange={setSearch} placeholder="Search name, phone, email, city" width={300} />
          <div className="adm-toolbar-spacer" />
          {loading && data && <Spinner />}
        </div>
        <div className="table-wrap">
          {!data ? (
            <PageLoading />
          ) : (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>City</th>
                    <th className="num">Opportunities</th>
                    <th className="num">Won</th>
                    <th>Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, i) => (
                    <tr
                      key={`${r.search}|${r.name}|${i}`}
                      className="clickable"
                      tabIndex={0}
                      onClick={() => open(r)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') open(r);
                      }}
                    >
                      <td>
                        <div className="adm-name-cell">
                          <span className="avatar avatar-teal">{initials(r.name)}</span>
                          <span className="adm-cell-main">{r.name || '—'}</span>
                        </div>
                      </td>
                      <td className="nowrap">{r.phone.trim() || '—'}</td>
                      <td>{r.email ? <span className="ellipsis">{r.email}</span> : <span className="muted">—</span>}</td>
                      <td>
                        {r.city || '—'}
                        {r.state && <div className="adm-cell-sub">{r.state}</div>}
                      </td>
                      <td className="num">{r.opportunities}</td>
                      <td className="num">{r.won > 0 ? <Badge tone="success">{r.won}</Badge> : <span className="muted">0</span>}</td>
                      <td className="nowrap" title={dateTimeFmt(r.lastActivity)}>
                        {relativeTime(r.lastActivity) || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.rows.length === 0 && (
                <Empty title={q ? 'No contacts match your search' : 'No contacts yet'} icon={<Contact size={30} strokeWidth={1.4} />}>
                  <span className="muted">{q ? 'Try a different name, phone number or city.' : 'Contacts appear here once you create opportunities.'}</span>
                </Empty>
              )}
              {loading && <div className="loading-overlay" />}
            </>
          )}
        </div>
        {data && data.total > 0 && <Pagination total={data.total} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} sizes={PAGE_SIZES} />}
      </div>
    </div>
  );
}
