import { useEffect } from 'react';
import { StoreProvider, useStore } from './state/store';
import { UIProvider, useUI } from './state/ui';
import { BottomNav } from './components/BottomNav';
import { RecordFormSheet } from './components/RecordForm';
import { NightDetailSheet, ScoreSheet } from './components/NightViews';
import { ConfirmDialog, Toasts } from './components/Overlays';
import { AlarmController } from './components/AlarmController';
import { Onboarding } from './components/Onboarding';
import { HomePage } from './pages/Home';
import { HistoryPage } from './pages/History';
import { AnalyticsPage } from './pages/Analytics';
import { JournalPage } from './pages/Journal';
import { ProfilePage } from './pages/Profile';
import { Logo } from './components/Illustrations';

function Shell() {
  const { ready, settings } = useStore();
  const { route } = useUI();

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', settings.theme === 'light' ? '#f4f3fb' : '#070a17');
  }, [settings.theme]);

  if (!ready) return <div className="boot" aria-busy="true" />;
  if (!settings.onboarded) return <Onboarding />;

  return (
    <div className="app">
      <div className="sky" aria-hidden />
      <div className="topbar">
        <Logo />
      </div>
      <main className="main" key={route}>
        {route === 'home' && <HomePage />}
        {route === 'history' && <HistoryPage />}
        {route === 'analytics' && <AnalyticsPage />}
        {route === 'journal' && <JournalPage />}
        {route === 'profile' && <ProfilePage />}
      </main>
      <BottomNav />
      <RecordFormSheet />
      <NightDetailSheet />
      <ScoreSheet />
      <ConfirmDialog />
      <Toasts />
      <AlarmController />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <UIProvider>
        <Shell />
      </UIProvider>
    </StoreProvider>
  );
}
