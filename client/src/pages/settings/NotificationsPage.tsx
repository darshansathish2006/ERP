import { useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { Button, Field, Switch, Textarea } from '../../components/ui';
import { useToast } from '../../components/feedback';
import { useMasters } from '../../context/MastersContext';
import { ReadOnlyNote, SubPage, UnsavedNote, useDirty, usePerms } from './common';

const MAX = 500;

export function NotificationsPage() {
  const { masters, refresh } = useMasters();
  const toast = useToast();
  const canEdit = usePerms().settings;
  const banner = masters.banner;
  const [enabled, setEnabled] = useState(!!banner.enabled);
  const [message, setMessage] = useState(banner.message || '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dirty = enabled !== !!banner.enabled || message !== (banner.message || '');
  useDirty(dirty);

  async function save() {
    const msg = message.trim();
    if (enabled && !msg) {
      setError('Enter the message to show in the banner');
      return;
    }
    if (msg.length > MAX) {
      setError(`Keep the message under ${MAX} characters`);
      return;
    }
    setSaving(true);
    try {
      const saved = await api.put<{ enabled: boolean; message: string }>('/api/settings/banner', { enabled, message: msg });
      await refresh();
      setEnabled(saved.enabled);
      setMessage(saved.message);
      toast.success(saved.enabled ? 'Maintenance banner is now visible to all users' : 'Banner settings saved');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SubPage
      footer={
        canEdit && (
          <>
            <UnsavedNote count={dirty ? 1 : 0} />
            <Button
              variant="ghost"
              icon={<RotateCcw size={14} />}
              disabled={!dirty || saving}
              onClick={() => {
                setEnabled(!!banner.enabled);
                setMessage(banner.message || '');
                setError(null);
              }}
            >
              Reset
            </Button>
            <Button variant="primary" icon={<Save size={14} />} loading={saving} disabled={!dirty} onClick={() => void save()}>
              Save
            </Button>
          </>
        )
      }
    >
      {!canEdit && <ReadOnlyNote />}
      <div className="card card-pad adm-narrow col gap-16">
        <div>
          <div className="adm-section-title">Maintenance banner</div>
          <div className="adm-cell-sub">Show an announcement at the top of the app for every signed-in user, e.g. before scheduled maintenance.</div>
        </div>
        <Switch checked={enabled} onChange={setEnabled} label={<span className="fw-600">Show maintenance banner</span>} disabled={saving || !canEdit} />
        <Field label="Banner message" required={enabled} error={error} hint={`${message.length}/${MAX} characters`} htmlFor="nt-message">
          <Textarea
            id="nt-message"
            rows={3}
            value={message}
            maxLength={MAX}
            invalid={!!error}
            disabled={saving || !canEdit}
            placeholder="e.g. Titans ERP will be unavailable on Sunday 10 PM – 11 PM for scheduled maintenance."
            onChange={(e) => {
              setMessage(e.target.value);
              setError(null);
            }}
          />
        </Field>
        <div>
          <div className="field-label mb-8">Preview</div>
          <div className="adm-banner-preview" aria-hidden="true">
            {enabled && message.trim() ? <div className="banner">{message.trim()}</div> : <div className="adm-cell-sub" style={{ padding: '6px 12px' }}>The banner is hidden.</div>}
            <div className="adm-banner-preview-body" />
          </div>
        </div>
      </div>
    </SubPage>
  );
}
