import { NavLink } from 'react-router-dom';
import { useMemo } from 'react';

export default function TopNav() {
  const navItems = useMemo(
    () => [
      { to: '/dashboard', label: 'Dashboard' },
      { to: '/meal', label: 'Meal' },
      { to: '/voice', label: 'Voice' },
      { to: '/workout', label: 'Workout' },
      { to: '/trainer', label: 'Trainer' },
      { to: '/body-twin', label: 'Body Twin' },
      { to: '/grocery', label: 'Grocery' },
      { to: '/progress', label: 'Progress' },
      { to: '/settings', label: 'Settings' }
    ],
    []
  );

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-black/72 backdrop-blur-xl supports-[backdrop-filter]:bg-black/55">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
        <NavLink
          to="/dashboard"
          className="text-sm font-semibold tracking-tight text-white transition-opacity hover:opacity-80"
        >
          Pulse<span className="text-fit-lime"> Twin</span>
        </NavLink>

        <nav className="flex max-w-full flex-wrap gap-1 sm:gap-1.5" aria-label="Main">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-full px-2.5 py-1.5 text-xs font-semibold transition-colors sm:px-3.5 ${
                  isActive
                    ? 'bg-white/12 text-fit-lime ring-1 ring-fit-lime/60'
                    : 'text-fit-muted hover:bg-white/5 hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
