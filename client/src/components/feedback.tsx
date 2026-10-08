import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { Modal } from './overlay';
import { Button } from './ui';

type ToastKind = 'success' | 'error' | 'info' | 'warning';
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: ReactNode;
  duration: number;
}

interface ToastApi {
  success: (msg: ReactNode, duration?: number) => number;
  error: (msg: ReactNode, duration?: number) => number;
  info: (msg: ReactNode, duration?: number) => number;
  warning: (msg: ReactNode, duration?: number) => number;
  dismiss: (id: number) => void;
}

interface ConfirmOptions {
  title?: ReactNode;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

const ToastCtx = createContext<ToastApi | null>(null);
const ConfirmCtx = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

const ICONS: Record<ToastKind, ReactNode> = {
  success: <CheckCircle2 size={17} />,
  error: <XCircle size={17} />,
  info: <Info size={17} />,
  warning: <AlertTriangle size={17} />,
};

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (kind: ToastKind, message: ReactNode, duration = kind === 'error' ? 5000 : 3000) => {
      const id = ++seq.current;
      setToasts((t) => [...t.slice(-4), { id, kind, message, duration }]);
      if (duration > 0) window.setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
  );
  const api = useRef<ToastApi>({
    success: (m, d) => push('success', m, d),
    error: (m, d) => push('error', m, d),
    info: (m, d) => push('info', m, d),
    warning: (m, d) => push('warning', m, d),
    dismiss,
  });
  api.current.success = (m, d) => push('success', m, d);
  api.current.error = (m, d) => push('error', m, d);
  api.current.info = (m, d) => push('info', m, d);
  api.current.warning = (m, d) => push('warning', m, d);

  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirmState({ ...opts, resolve })), []);
  const closeConfirm = (v: boolean) => {
    confirmState?.resolve(v);
    setConfirmState(null);
  };

  return (
    <ToastCtx.Provider value={api.current}>
      <ConfirmCtx.Provider value={confirm}>
        {children}
        {createPortal(
          <div className="toasts" aria-live="polite">
            {toasts.map((t) => (
              <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
                <span className="toast-icon">{ICONS[t.kind]}</span>
                <div className="grow">{t.message}</div>
                <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                  <X size={14} />
                </button>
                {t.duration > 0 && <span className="toast-progress" style={{ animationDuration: `${t.duration}ms` }} />}
              </div>
            ))}
          </div>,
          document.body,
        )}
        <Modal
          open={!!confirmState}
          onClose={() => closeConfirm(false)}
          title={confirmState?.title ?? 'Are you sure?'}
          size="sm"
          footer={
            <>
              <Button variant="outline" onClick={() => closeConfirm(false)}>
                {confirmState?.cancelText ?? 'Cancel'}
              </Button>
              <Button variant={confirmState?.danger ? 'danger' : 'primary'} onClick={() => closeConfirm(true)} autoFocus>
                {confirmState?.confirmText ?? 'Confirm'}
              </Button>
            </>
          }
        >
          <div style={{ color: 'var(--text-2)' }}>{confirmState?.message}</div>
        </Modal>
      </ConfirmCtx.Provider>
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside FeedbackProvider');
  return ctx;
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error('useConfirm must be used inside FeedbackProvider');
  return ctx;
}
