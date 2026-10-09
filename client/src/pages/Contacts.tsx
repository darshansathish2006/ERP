import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Contact, Edit3, ExternalLink, MoreVertical, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage, qs } from '../lib/api';
import type { ContactRow, Paged } from '../lib/types';
import { dateTimeFmt, initials, relativeTime } from '../lib/format';
import { Badge, BoxTabs, Button, Empty, IconButton, PageLoading, Pagination, Spinner } from '../components/ui';
import { useConfirm, useToast } from '../components/feedback';
import { Menu } from '../components/overlay';
import { SearchBox, useDebounced } from './masters/shared';
import { ContactDialog } from './contacts/ContactDialog';

type Source = 'all' | 'contact' | 'opportunity';


const PAGE_SIZES = [10, 25, 50, 100];

export default function ContactsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState<(Paged<ContactRow> & { counts?: Record<Source, number> }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<Source>('all');
  const [dialog, setDialog] = useState<{ contact: ContactRow | null } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const confirm = useConfirm();
  const seq = useRef(0);

  const filterKey = `${q}|${pageSize}|${source}`;
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
        const res = await api.get<Paged<ContactRow> & { counts?: Record<Source, number> }>(`/api/contacts${qs({ q, page, pageSize, source: source === 'all' ? undefined : source })}`);
        if (id === seq.current) setData(res);
      } catch (e) {
        if (id === seq.current) toast.error(errorMessage(e));
      } finally {
        if (id === seq.current) setLoading(false);
      }
    })();
  }, [q, page, pageSize, source, reloadKey, toast]);

  const reload = () => setReloadKey((k) => k + 1);
  const open = (r: ContactRow) => setDialog({ contact: r });
  const openOpportunity = (r: ContactRow) => r.lastOpportunityId && navigate(`/opportunity/${r.lastOpportunityId}/edit`);

  const remove = async (r: ContactRow) => {
    if (!r.id) return;
    const ok = await confirm({
      title: 'Delete contact',
      message: (
        <>
          Delete <b>{r.name}</b> from your contacts?
          {r.opportunities > 0 && <div className="mt-8">The {r.opportunities} opportunit{r.opportunities === 1 ? 'y' : 'ies'} with this phone number keep their customer details.</div>}
        </>
      ),
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/api/contacts/${r.id}`);
      toast.success(`${r.name} deleted`);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const addButton = (
    <Button variant="primary" icon={<Plus size={15} />} onClick={() => setDialog({ contact: null })} data-tour="contacts-add">
      Add contact
    </Button>
  );

  return (
    <div className="page-flush adm-flush">
      <div className="page-head">
        <div>
          <div className="page-title">Contacts</div>
          <div className="adm-sub">Contacts you add here and the customers on your opportunities. Click a contact to edit it.</div>
        </div>
        {addButton}
      </div>
      <div className="list-card">
        <div className="toolbar adm-toolbar" data-tour="contacts-toolbar">
          <SearchBox value={search} onChange={setSearch} placeholder="Search name, phone, email, city, company" width={300} />
          <BoxTabs
            value={source}
            onChange={setSource}
            tabs={[
              { value: 'all', label: `All${data?.counts ? ` (${data.counts.all})` : ''}` },
              { value: 'contact', label: `Contacts${data?.counts ? ` (${data.counts.contact})` : ''}` },
              { value: 'opportunity', label: `From opportunities${data?.counts ? ` (${data.counts.opportunity})` : ''}` },
            ]}
          />
          <div className="adm-toolbar-spacer" />
          {loading && data && <Spinner />}
        </div>
        <div className="table-wrap" data-tour="contacts-table">
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
                    <th>Source</th>
                    <th className="num">Opportunities</th>
                    <th className="num">Won</th>
                    <th>Last activity</th>
                    <th className="kebab-cell" />
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, i) => (
                    <tr
                      key={`${r.key}|${i}`}
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
                          <span>
                            <span className="adm-cell-main">{r.name || '—'}</span>
                            {(r.company || r.designation) && <div className="adm-cell-sub">{[r.designation, r.company].filter(Boolean).join(' · ')}</div>}
                          </span>
                        </div>
                      </td>
                      <td className="nowrap">{r.phone.trim() ? `${r.phoneCode} ${r.phone}` : '—'}</td>
                      <td>{r.email ? <span className="ellipsis">{r.email}</span> : <span className="muted">—</span>}</td>
                      <td>
                        {r.city || '—'}
                        {r.state && <div className="adm-cell-sub">{r.state}</div>}
                      </td>
                      <td>{r.source === 'contact' ? <Badge tone="primary">Contact</Badge> : <Badge>Opportunity</Badge>}</td>
                      <td className="num">{r.opportunities}</td>
                      <td className="num">{r.won > 0 ? <Badge tone="success">{r.won}</Badge> : <span className="muted">0</span>}</td>
                      <td className="nowrap" title={dateTimeFmt(r.lastActivity)}>
                        {relativeTime(r.lastActivity) || '—'}
                      </td>
                      <td className="kebab-cell" onClick={(e) => e.stopPropagation()}>
                        <Menu
                          trigger={({ ref, onClick }) => (
                            <IconButton ref={ref} size="sm" onClick={onClick} aria-label={`Actions for ${r.name}`} data-tour="contacts-actions">
                              <MoreVertical size={15} />
                            </IconButton>
                          )}
                          items={[
                            { label: 'Edit contact', icon: <Edit3 size={15} />, onClick: () => open(r), dataTour: 'contacts-edit' },
                            { label: 'Open latest opportunity', icon: <ExternalLink size={15} />, disabled: !r.lastOpportunityId, onClick: () => openOpportunity(r) },
                            ...(r.source === 'contact' ? [{ separator: true }, { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onClick: () => void remove(r) }] : []),
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.rows.length === 0 && (
                <Empty title={q ? 'No contacts match your search' : 'No contacts yet'} icon={<Contact size={30} strokeWidth={1.4} />}>
                  <span className="muted">{q ? 'Try a different name, phone number or city.' : 'Add a contact, or create an opportunity – its customer appears here too.'}</span>
                  {!q && <div className="mt-8">{addButton}</div>}
                </Empty>
              )}
              {loading && <div className="loading-overlay" />}
            </>
          )}
        </div>
        {data && data.total > 0 && <Pagination total={data.total} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} sizes={PAGE_SIZES} />}
      </div>
      {dialog && <ContactDialog contact={dialog.contact} onClose={() => setDialog(null)} onSaved={reload} />}
    </div>
  );
}
