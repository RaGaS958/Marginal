import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  name: string;
  email: string;
  preferences?: {
    notifications: boolean;
  };
}

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      user: null,
      login: (user) => set({ isAuthenticated: true, user }),
      logout: () => set({ isAuthenticated: false, user: null }),
      updateUser: (updates) => set((state) => ({
        user: state.user ? { ...state.user, ...updates } : null
      })),
    }),
    {
      name: 'marginal-auth-storage',
    }
  )
);
