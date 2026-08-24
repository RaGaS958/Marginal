import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SimilarityBreakdown, SimilarPaper } from '@/lib/types';
import { useAuthStore } from './auth';

export interface AnalysisRequest {
  id: string;
  title: string;
  abstract: string;
  methodology?: string;
  conclusion?: string;
  domain: string;
  score?: number | null;
  status: 'running' | 'completed' | 'failed';
  date: string;
  author?: string;
  userEmail?: string;
  // --- populated once a real result comes back from the backend ---
  recommendation?: string | null;
  strengths?: string[];
  weaknesses?: string[];
  reviewerComments?: string | null;
  improvementSuggestions?: string | null;
  similarPapers?: SimilarPaper[];
  similarityBreakdown?: SimilarityBreakdown;
  finalReport?: string | null;
  errors?: string[];
  completedNodes?: string[];
  errorMessage?: string;
}

interface HistoryState {
  history: AnalysisRequest[];
  addRequest: (request: AnalysisRequest) => void;
  updateRequest: (id: string, updates: Partial<AnalysisRequest>) => void;
  getRequest: (id: string) => AnalysisRequest | undefined;
  removeRequest: (id: string) => void;
}

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set, get) => ({
      history: [],
      addRequest: (request) => set((state) => {
        const userEmail = useAuthStore.getState().user?.email;
        return { history: [{ ...request, userEmail }, ...state.history] };
      }),
      updateRequest: (id, updates) => set((state) => ({
        history: state.history.map((req) => req.id === id ? { ...req, ...updates } : req)
      })),
      getRequest: (id) => get().history.find((req) => req.id === id),
      removeRequest: (id) => set((state) => ({
        history: state.history.filter((req) => req.id !== id)
      })),
    }),
    {
      name: 'marginal-history-storage',
    }
  )
);
