import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConfirm } from '../components/feedback';
import { RateMasterView } from './masters/RateMasterView';

/** /masters – the same view as Settings → Raw Material Settings. */
export default function MastersPage() {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const toSettings = async () => {
    if (dirty) {
      const ok = await confirm({
        title: 'Discard unsaved rates?',
        message: 'You have rate changes that have not been saved. Leave and discard them?',
        confirmText: 'Discard changes',
        danger: true,
      });
      if (!ok) return;
    }
    navigate('/settings?section=rm-settings');
  };

  return (
    <div className="page-flush adm-flush">
      <div className="page-head">
        <div>
          <nav className="adm-crumb" aria-label="Breadcrumb">
            <button type="button" onClick={() => void toSettings()}>
              Settings
            </button>
            <span aria-hidden="true">/</span>
            <span>Raw Material Settings</span>
          </nav>
          <h1 className="page-title">Rate Master</h1>
          <div className="adm-sub">Raw material rates, glass, colours and profile systems used to price every design. Price levels are managed in Settings → Raw Material Pricing.</div>
        </div>
      </div>
      <RateMasterView onDirtyChange={setDirty} />
    </div>
  );
}
