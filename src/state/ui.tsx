import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { SleepRecord } from '../data/types';

export type Route = 'home' | 'history' | 'analytics' | 'journal' | 'profile';
export const ROUTES: Route[] = ['home', 'history', 'analytics', 'journal', 'profile'];

export interface RecordFormState {
  record?: SleepRecord;
  /** Prefill for a new record, e.g. from a stopped session. */
  prefill?: Partial<SleepRecord>;
  fromSession?: boolean;
  /** Wake-up date (YYYY-MM-DD) to preselect for a new record. */
  date?: string;
}

interface ToastItem {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ConfirmState {
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

interface UIValue {
  route: Route;
  navigate: (r: Route) => void;
  recordForm: RecordFormState | null;
  openRecordForm: (s?: RecordFormState) => void;
  closeRecordForm: () => void;
  nightId: string | null;
  openNight: (id: string | null) => void;
  journalDate: string | null;
  openJournal: (date: string | null) => void;
  scoreNightId: string | null;
  openScore: (id: string | null) => void;
  toasts: ToastItem[];
  toast: (message: string, action?: { label: string; onAction: () => void }) => void;
  dismissToast: (id: number) => void;
  confirm: (opts: Omit<ConfirmState, 'resolve'>) => Promise<boolean>;
  confirmState: ConfirmState | null;
}

const UIContext = createContext<UIValue | null>(null);

function routeFromHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, '') as Route;
  return ROUTES.includes(h) ? h : 'home';
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [recordForm, setRecordForm] = useState<RecordFormState | null>(null);
  const [nightId, setNightId] = useState<string | null>(null);
  const [journalDate, setJournalDate] = useState<string | null>(null);
  const [scoreNightId, setScoreNightId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((r: Route) => {
    if (window.location.hash !== `#/${r}`) window.location.hash = `/${r}`;
    setRoute(r);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback<UIValue['toast']>(
    (message, action) => {
      const id = ++seq.current;
      setToasts((t) => [...t.slice(-2), { id, message, actionLabel: action?.label, onAction: action?.onAction }]);
      setTimeout(() => dismissToast(id), action ? 6000 : 3200);
    },
    [dismissToast],
  );

  const confirm = useCallback<UIValue['confirm']>(
    (opts) => new Promise<boolean>((resolve) => setConfirmState({ ...opts, resolve: (ok) => { setConfirmState(null); resolve(ok); } })),
    [],
  );

  return (
    <UIContext.Provider
      value={{
        route,
        navigate,
        recordForm,
        openRecordForm: (s = {}) => setRecordForm(s),
        closeRecordForm: () => setRecordForm(null),
        nightId,
        openNight: setNightId,
        journalDate,
        openJournal: setJournalDate,
        scoreNightId,
        openScore: setScoreNightId,
        toasts,
        toast,
        dismissToast,
        confirm,
        confirmState,
      }}
    >
      {children}
    </UIContext.Provider>
  );
}

export function useUI(): UIValue {
  const v = useContext(UIContext);
  if (!v) throw new Error('useUI must be used inside <UIProvider>');
  return v;
}
