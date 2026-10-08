import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, errorMessage } from '../lib/api';
import type { Masters } from '../lib/types';
import { Button, PageLoading } from '../components/ui';

interface MastersState {
  masters: Masters;
  refresh: () => Promise<void>;
}

const MastersCtx = createContext<MastersState | null>(null);

export function MastersProvider({ children }: { children: ReactNode }) {
  const [masters, setMasters] = useState<Masters | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const m = await api.get<Masters>('/api/masters');
      setMasters(m);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(() => (masters ? { masters, refresh } : null), [masters, refresh]);

  if (error && !masters) {
    return (
      <div className="page-loading col" style={{ height: '100vh' }}>
        <div className="alert alert-error">{error}</div>
        <Button variant="primary" onClick={() => void refresh()}>
          Retry
        </Button>
      </div>
    );
  }
  if (!value) return <div style={{ height: '100vh' }}><PageLoading /></div>;
  return <MastersCtx.Provider value={value}>{children}</MastersCtx.Provider>;
}

export function useMasters() {
  const ctx = useContext(MastersCtx);
  if (!ctx) throw new Error('useMasters must be used inside MastersProvider');
  return ctx;
}
