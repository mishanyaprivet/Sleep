import { BarChart3, BookOpen, CalendarDays, Home, UserRound } from 'lucide-react';
import { useUI, type Route } from '../state/ui';
import { cx } from './ui';

const ITEMS: { route: Route; label: string; icon: typeof Home }[] = [
  { route: 'home', label: 'Home', icon: Home },
  { route: 'history', label: 'History', icon: CalendarDays },
  { route: 'analytics', label: 'Analytics', icon: BarChart3 },
  { route: 'journal', label: 'Journal', icon: BookOpen },
  { route: 'profile', label: 'Profile', icon: UserRound },
];

export function BottomNav() {
  const { route, navigate } = useUI();
  return (
    <nav className="bottom-nav" aria-label="Main">
      <div className="bottom-nav__inner">
        {ITEMS.map(({ route: r, label, icon: Icon }) => (
          <a
            key={r}
            href={`#/${r}`}
            className={cx('bottom-nav__item', route === r && 'is-active')}
            aria-current={route === r ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault();
              navigate(r);
            }}
          >
            <Icon size={21} strokeWidth={route === r ? 2.2 : 1.8} />
            <span>{label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}
