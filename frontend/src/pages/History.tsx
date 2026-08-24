import { useState, useMemo } from 'react';
import { Search, Info, ArrowRight } from 'lucide-react';
import { useHistoryStore } from '@/store/history';
import { useAuthStore } from '@/store/auth';
import { HistoryStats } from '@/components/history/HistoryStats';
import { HistoryList } from '@/components/history/HistoryList';

export function History() {
  const allHistory = useHistoryStore(state => state.history);
  const removeRequest = useHistoryStore(state => state.removeRequest);
  const user = useAuthStore(state => state.user);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState('All Domains');
  const [timeFilter, setTimeFilter] = useState('All Time');

  // Protect Main Thread: Heavy filtering happens only when dependencies change
  const filteredHistory = useMemo(() => {
    let results = allHistory.filter(req => req.userEmail === user?.email);

    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      results = results.filter(req => 
        req.title.toLowerCase().includes(lowerQuery) || 
        (req.author && req.author.toLowerCase().includes(lowerQuery))
      );
    }

    if (domainFilter !== 'All Domains') {
      results = results.filter(req => req.domain === domainFilter);
    }

    if (timeFilter !== 'All Time') {
      const now = new Date();
      results = results.filter(req => {
        const reqDate = new Date(req.date);
        if (timeFilter === 'Last 30 Days') {
          return (now.getTime() - reqDate.getTime()) <= 30 * 24 * 60 * 60 * 1000;
        }
        if (timeFilter === 'Last 3 Months') {
          return (now.getTime() - reqDate.getTime()) <= 90 * 24 * 60 * 60 * 1000;
        }
        if (timeFilter === 'This Year') {
          return reqDate.getFullYear() === now.getFullYear();
        }
        return true;
      });
    }

    return results;
  }, [allHistory, user?.email, searchQuery, domainFilter, timeFilter]);

  return (
    <main className="flex-grow w-full max-w-max-width mx-auto px-margin-mobile md:px-margin-desktop py-8 md:py-12 flex flex-col gap-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-outline-variant pb-6">
        <div>
          <h1 className="font-display-lg-mobile md:font-display-lg text-display-lg-mobile md:text-display-lg text-on-background mb-2">Analysis History</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">Review your past manuscript analyses and novelty scores.</p>
        </div>
        <div className="bg-surface-container-low text-on-surface-variant font-meta-data text-meta-data px-3 py-2 rounded flex items-center gap-2 border border-outline-variant">
          <Info size={16} />
          History is stored locally in your browser. Authenticate to sync across devices.
        </div>
      </div>

      {/* Analytics Summary */}
      <HistoryStats history={filteredHistory} />

      {/* Controls - Browser & Device Responsive wrapper */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between w-full overflow-x-auto pb-2">
        <div className="relative w-full sm:w-96 flex-shrink-0">
          <input 
            type="text" 
            placeholder="Search title or authors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface-container-lowest border border-outline-variant rounded pl-10 pr-4 py-2 font-body-md text-body-md focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary shadow-sm"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={20} />
        </div>
        <div className="flex gap-2 w-full sm:w-auto flex-shrink-0">
          <select 
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
            className="bg-surface-container-lowest border border-outline-variant rounded px-4 py-2 font-label-mono text-label-mono focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary shadow-sm flex-grow sm:flex-grow-0"
          >
            <option>All Domains</option>
            <option>Computer Science</option>
            <option>Biology</option>
            <option>Physics</option>
          </select>
          <select 
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value)}
            className="bg-surface-container-lowest border border-outline-variant rounded px-4 py-2 font-label-mono text-label-mono focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary shadow-sm flex-grow sm:flex-grow-0"
          >
            <option>All Time</option>
            <option>Last 30 Days</option>
            <option>Last 3 Months</option>
            <option>This Year</option>
          </select>
        </div>
      </div>

      {/* History List */}
      <HistoryList history={filteredHistory} onDelete={removeRequest} />

      {filteredHistory.length > 0 && (
        <div className="flex justify-center items-center gap-2 mt-8">
          <button disabled className="w-8 h-8 flex items-center justify-center border border-outline-variant rounded bg-surface-container-lowest text-on-surface-variant hover:text-primary hover:border-primary disabled:opacity-50">
            <ArrowRight size={18} className="rotate-180" />
          </button>
          <button className="w-8 h-8 flex items-center justify-center border border-primary bg-primary text-on-primary rounded font-label-mono text-label-mono">1</button>
          <button className="w-8 h-8 flex items-center justify-center border border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:text-primary hover:border-primary rounded font-label-mono text-label-mono">2</button>
          <button className="w-8 h-8 flex items-center justify-center border border-outline-variant rounded bg-surface-container-lowest text-on-surface-variant hover:text-primary hover:border-primary">
            <ArrowRight size={18} />
          </button>
        </div>
      )}
    </main>
  );
}
