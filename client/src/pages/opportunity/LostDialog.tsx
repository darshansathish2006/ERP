import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import type { Opportunity } from '../../lib/types';
import { useMasters } from '../../context/MastersContext';
import { useToast } from '../../components/feedback';
import { Button, Field, Input, Select } from '../../components/ui';
import { Modal } from '../../components/overlay';

export function LostDialog({ opportunity, onClose, onDone }: { opportunity: Pick<Opportunity, 'id' | 'projectName'> | null; onClose: () => void; onDone: () => void }) {
  const { masters } = useMasters();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (opportunity) {
      setReason('');
      setOther('');
      setError(null);
    }
  }, [opportunity]);

  const submit = async () => {
    const final = reason === 'Other' ? other.trim() : reason;
    if (!final) {
      setError('Please select a reason');
      return;
    }
    if (!opportunity) return;
    setSaving(true);
    try {
      await api.post(`/api/opportunities/${opportunity.id}/status`, { status: 'lost', reason: final });
      toast.success(`${opportunity.projectName} marked as lost`);
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!opportunity}
      onClose={onClose}
      title="Mark opportunity as lost"
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={saving} onClick={submit}>
            Mark as lost
          </Button>
        </>
      }
    >
      <div className="col gap-12">
        <p className="muted">
          Why was <b>{opportunity?.projectName}</b> lost? This is shown in the dashboard's lost opportunity reasons.
        </p>
        <Field label="Reason" required error={reason ? null : error}>
          <Select value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Select a reason" invalid={!!error && !reason}>
            {masters.lostReasons.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>
        {reason === 'Other' && (
          <Field label="Describe the reason" required error={other.trim() ? null : error}>
            <Input value={other} onChange={(e) => setOther(e.target.value)} autoFocus />
          </Field>
        )}
      </div>
    </Modal>
  );
}
