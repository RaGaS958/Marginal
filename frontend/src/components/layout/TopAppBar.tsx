import { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { History, UserCircle, LogOut, Settings, ChevronDown, Menu, X } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import GooeyNav from '../GooeyNav';

function ProfileDropdown() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full hover:bg-surface-variant/50 transition-colors border border-transparent hover:border-outline-variant/30"
      >
        <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-sm">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <span className="text-sm font-medium text-on-surface max-w-[100px] truncate hidden sm:block">
          {user.name}
        </span>
        <ChevronDown size={14} className="text-on-surface-variant" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-lg py-2 z-50 origin-top-right transition-all">
          <div className="px-4 py-3 border-b border-outline-variant/50 mb-1">
            <p className="text-sm font-medium text-on-surface truncate">{user.name}</p>
            <p className="text-xs text-on-surface-variant truncate">{user.email}</p>
          </div>
          
          <button
            onClick={() => { setIsOpen(false); navigate('/profile'); }}
            className="w-full text-left px-4 py-2.5 text-sm text-on-surface hover:bg-surface-container-low transition-colors flex items-center gap-3"
          >
            <Settings size={16} className="text-on-surface-variant" />
            Profile Settings
          </button>
          
          <button
            onClick={() => { setIsOpen(false); logout(); navigate('/'); }}
            className="w-full text-left px-4 py-2.5 text-sm text-error hover:bg-error/10 transition-colors flex items-center gap-3"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

export function TopAppBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, logout } = useAuthStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = [
    { label: "Home", href: "/" },
    { label: "Analyze", href: "/analyze" },
    { label: "History", href: "/history" },
    { label: "About", href: "/about" },
  ];

  const getActiveIndex = () => {
    if (location.pathname === '/about') return 3;
    if (location.pathname === '/history') return 2;
    if (location.pathname === '/analyze') return 1;
    return 0; // Default to Home for '/'
  };

  return (
    <header className="bg-surface/60 backdrop-blur-xl flex justify-between items-center w-full px-margin-mobile md:px-margin-desktop h-20 border-b border-outline-variant/30 shadow-[0_4px_30px_rgba(0,0,0,0.1)] sticky top-0 z-50 transition-all">
      <div className="flex items-center gap-gutter w-full max-w-max-width mx-auto justify-between">
        <NavLink to="/" className="font-display-lg text-2xl md:text-3xl font-bold text-primary tracking-tight z-10">
          Marginal
        </NavLink>
        
        <div className="hidden md:flex justify-center absolute left-1/2 -translate-x-1/2">
          <GooeyNav
            items={navItems}
            particleCount={15}
            particleDistances={[90, 10]}
            particleR={100}
            initialActiveIndex={getActiveIndex()}
            animationTime={250}
            timeVariance={100}
            colors={['primary']}
          />
        </div>

        <div className="flex items-center gap-4 z-10">
          <NavLink to="/history" aria-label="history" className="text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center p-2 rounded-full hover:bg-surface-variant/50">
            <History strokeWidth={1.5} />
          </NavLink>
          {isAuthenticated ? (
            <ProfileDropdown />
          ) : (
            <NavLink to="/login" aria-label="account_circle" className="text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center p-2 rounded-full hover:bg-surface-variant/50" title="Sign In">
              <UserCircle strokeWidth={1.5} />
            </NavLink>
          )}
          <button 
            className="md:hidden text-on-surface-variant hover:text-primary transition-colors p-2 rounded-full hover:bg-surface-variant/50"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle mobile menu"
          >
            {isMobileMenuOpen ? <X strokeWidth={1.5} /> : <Menu strokeWidth={1.5} />}
          </button>
        </div>
      </div>
      
      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden absolute top-20 left-0 w-full bg-surface/95 backdrop-blur-xl border-b border-outline-variant/30 shadow-lg px-margin-mobile py-4 flex flex-col gap-2 z-40">
          {navItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className={({ isActive }) => 
                cn(
                  "px-4 py-3 rounded-xl text-base font-medium transition-colors",
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-on-surface-variant hover:bg-surface-variant/50 hover:text-on-surface"
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      )}
    </header>
  );
}
