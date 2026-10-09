import { useCallback, useEffect, useState } from 'react';
import { Edit3, MessageSquare, Phone, Trash2, Users, MapPin, Mail } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { Opportunity, Touchpoint } from '../../lib/types';
import { dateTimeFmt, relativeTime } from '../../lib/format';
import { useMasters } from '../../context/MastersContext';
import { useConfirm, useToast } from '../../components/feedback';
import { Button, Empty, Field, IconButton, Input, Select, Spinner, Textarea } from '../../components/ui';
import { Drawer } from '../../components/overlay';

function iconFor(kind: string) {
  const k = kind.toLowerCase();
  if (k.includes('call')) return <Phone size={14} />;
  if (k.includes('whatsapp') || k.includes('message')) return <MessageSquare size={14} />;
  if (k.includes('visit')) return <MapPin size={14} />;
  if (k.includes('mail')) return <Mail size={14} />;
  return <Users size={14} />;
}

function nowLocal() {
  return toLocalInput(new Date().toISOString());
}

/** ISO time → value for a datetime-local input. */
function toLocalInput(iso: string) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/** Customer interactions (calls, visits, meetings) logged against an opportunity. */
export function TouchpointsDrawer({ opportunity, onClose, onChanged }: { opportunity: Pick<Opportunity, 'id' | 'projectName' | 'contactName' | 'phoneCode' | 'phone'> | null; onClose: () => void; onChanged: () => void }) {
  const { masters } = useMasters();
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<Touchpoint[] | null>(null);
  const [kind, setKind] = useState('');
  const [note, setNote] = useState('');
  const [at, setAt] = useState(nowLocal());
  const [saving, setSaving] = useState(false);
  /** The touchpoint being edited in the form (null = logging a new one). */
  const [editing, setEditing] = useState<Touchpoint | null>(null);

  const load = useCallback(async () => {
    if (!opportunity) return;
    try {
      setList(await api.get<Touchpoint[]>(`/api/opportunities/${opportunity.id}/touchpoints`));
    } catch (e) {
      toast.error(errorMessage(e));
      setList([]);
    }
  }, [opportunity, toast]);

  useEffect(() => {
    if (!opportunity) return;
    setList(null);
    setKind(masters.touchpointTypes[0] || 'Call');
    setNote('');
    setAt(nowLocal());
    setEditing(null);
    void load();
  }, [opportunity, load, masters.touchpointTypes]);

  const startEdit = (t: Touchpoint) => {
    setEditing(t);
    setKind(t.kind);
    setNote(t.note);
    setAt(toLocalInput(t.contactedAt));
  };
  const cancelEdit = () => {
    setEditing(null);
    setKind(masters.touchpointTypes[0] || 'Call');
    setNote('');
    setAt(nowLocal());
  };

  const add = async () => {
    if (!opportunity) return;
    if (!kind) return toast.error('Choose a touchpoint type');
    const when = new Date(at);
    if (Number.isNaN(when.getTime())) return toast.error('Enter a valid date and time');
    if (when.getTime() > Date.now() + 60_000) return toast.error('Contacted time cannot be in the future');
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/api/touchpoints/${editing.id}`, { kind, note: note.trim(), contactedAt: when.toISOString() });
        toast.success('Touchpoint updated');
        cancelEdit();
      } else {
        await api.post(`/api/opportunities/${opportunity.id}/touchpoints`, { kind, note: note.trim(), contactedAt: when.toISOString() });
        toast.success('Touchpoint logged');
        setNote('');
        setAt(nowLocal());
      }
      await load();
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: Touchpoint) => {
    if (!(await confirm({ title: 'Delete touchpoint', message: `Delete this ${t.kind.toLowerCase()} from ${dateTimeFmt(t.contactedAt)}?`, confirmText: 'Delete', danger: true }))) return;
    try {
      await api.del(`/api/touchpoints/${t.id}`);
      if (editing?.id === t.id) cancelEdit();
      toast.success('Touchpoint deleted');
      await load();
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Drawer open={!!opportunity} onClose={onClose} title={`Touchpoints · ${opportunity?.projectName || ''}`} width="wide">
      {opportunity && (
        <div className="col gap-16">
          <div className="muted fs-12">
            {opportunity.contactName} · {opportunity.phoneCode} {opportunity.phone}
          </div>
          <div className={`card card-pad col gap-12 ${editing ? 'touch-editing' : ''}`} data-tour="touchpoint-form">
            <div className="fw-600">{editing ? `Edit touchpoint · ${editing.kind}` : 'Log a touchpoint'}</div>
            <div className="row gap-12">
              <Field label="Type" className="grow">
                <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                  {(masters.touchpointTypes.includes(kind) || !kind ? masters.touchpointTypes : [kind, ...masters.touchpointTypes]).map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Contacted on" className="grow">
                <Input type="datetime-local" value={at} max={nowLocal()} onChange={(e) => setAt(e.target.value)} />
              </Field>
            </div>
            <Field label="Note">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="What was discussed?" />
            </Field>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              {editing && (
                <Button onClick={cancelEdit} disabled={saving}>
                  Cancel
                </Button>
              )}
              <Button variant="primary" loading={saving} onClick={add} data-tour={editing ? 'touchpoint-save' : undefined}>
                {editing ? 'Save changes' : 'Log touchpoint'}
              </Button>
            </div>
          </div>
          {!list ? (
            <div className="page-loading" style={{ minHeight: 120 }}>
              <Spinner />
            </div>
          ) : list.length === 0 ? (
            <Empty title="No touchpoints yet">
              <span className="muted">Log calls, site visits and meetings above to keep a history with this customer.</span>
            </Empty>
          ) : (
            <div className="touch-timeline">
              {list.map((t) => (
                <div key={t.id} className={`touch-item ${editing?.id === t.id ? 'editing' : ''}`}>
                  <span className="touch-icon">{iconFor(t.kind)}</span>
                  <div className="grow">
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="fw-600">{t.kind}</span>
                      <span className="muted fs-11" title={dateTimeFmt(t.contactedAt)}>
                        {relativeTime(t.contactedAt)}
                      </span>
                    </div>
                    {t.note && <div className="fs-12">{t.note}</div>}
                    <div className="muted fs-11">
                      {dateTimeFmt(t.contactedAt)}
                      {t.user ? ` · ${t.user}` : ''}
                    </div>
                  </div>
                  <IconButton size="sm" tip="Edit" tipPos="left" onClick={() => startEdit(t)} data-tour="touchpoint-edit">
                    <Edit3 size={13} />
                  </IconButton>
                  <IconButton size="sm" tip="Delete" tipPos="left" onClick={() => void remove(t)}>
                    <Trash2 size={13} />
                  </IconButton>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
