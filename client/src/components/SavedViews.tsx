import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import type { SavedView } from '../lib/types';
import { useConfirm, useToast } from './feedback';
import { Button, Field, Input } from './ui';
import { Menu, Modal } from './overlay';

export interface BuiltInView {
  value: string;
  label: string;
}

/**
 * "Default View ▾" selector with built-in views plus the user's saved custom views,
 * and a "+ Create custom view" button that stores the current filters/columns/sort.
 */
export function SavedViews<C extends object>({
  page,
  builtIns,
  value,
  onSelectBuiltIn,
  onApplyCustom,
  currentConfig,
}: {
  page: string;
  builtIns: BuiltInView[];
  value: string;
  onSelectBuiltIn: (v: string) => void;
  onApplyCustom: (config: C, view: SavedView<C>) => void;
  currentConfig: () => C;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [views, setViews] = useState<SavedView<C>[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setViews(await api.get<SavedView<C>[]>(`/api/views?page=${page}`));
    } catch {
      setViews([]);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  const label = value.startsWith('custom:') ? views.find((v) => `custom:${v.id}` === value)?.name || 'Custom view' : builtIns.find((b) => b.value === value)?.label || builtIns[0]?.label;

  const save = async () => {
    if (!name.trim()) {
      setError('View name is required');
      return;
    }
    setSaving(true);
    try {
      const v = await api.post<SavedView<C>>('/api/views', { page, name: name.trim(), config: currentConfig() });
      toast.success(`View "${v.name}" created`);
      setCreateOpen(false);
      setName('');
      await load();
      onApplyCustom(v.config, v);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (v: SavedView<C>) => {
    if (!(await confirm({ title: 'Delete view', message: `Delete the custom view "${v.name}"?`, confirmText: 'Delete', danger: true }))) return;
    try {
      await api.del(`/api/views/${v.id}`);
      toast.success('View deleted');
      if (value === `custom:${v.id}`) onSelectBuiltIn(builtIns[0].value);
      await load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <Menu
        placement="bottom-start"
        trigger={({ ref, onClick }) => (
          <Button ref={ref} size="sm" variant="outline-primary" onClick={onClick}>
            {label}
            <ChevronDown size={13} />
          </Button>
        )}
        items={[
          ...builtIns.map((b) => ({ label: b.label, icon: b.value === value ? <Check size={14} /> : <span style={{ width: 14 }} />, onClick: () => onSelectBuiltIn(b.value) })),
          ...(views.length ? [{ separator: true }, { heading: 'My views' }] : []),
          ...views.map((v) => ({
            label: (
              <span className="row" style={{ width: 200, justifyContent: 'space-between' }}>
                <span className="ellipsis">{v.name}</span>
                <span
                  role="button"
                  aria-label={`Delete ${v.name}`}
                  className="row"
                  style={{ color: 'var(--muted)' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    void remove(v);
                  }}
                >
                  <Trash2 size={13} />
                </span>
              </span>
            ),
            icon: `custom:${v.id}` === value ? <Check size={14} /> : <span style={{ width: 14 }} />,
            onClick: () => onApplyCustom(v.config, v),
          })),
        ]}
      />
      <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={() => setCreateOpen(true)}>
        Create custom view
      </Button>
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create custom view"
        size="sm"
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={save}>
              Save view
            </Button>
          </>
        }
      >
        <div className="col gap-12">
          <p className="muted fs-12">Saves the current tab, search, date range, filters, sort and visible columns as a view you can return to.</p>
          <Field label="View name" required error={error}>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              autoFocus
              maxLength={60}
              onKeyDown={(e) => e.key === 'Enter' && void save()}
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}
