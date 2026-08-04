import { AnalysisRequest } from '@/store/history';
import { motion } from 'motion/react';

interface HistoryStatsProps {
  history: AnalysisRequest[];
}

export function HistoryStats({ history }: HistoryStatsProps) {
  if (history.length === 0) return null;

  const scored = history.filter((r) => r.score != null);
  const avgScore = scored.length ? Math.round(scored.reduce((acc, r) => acc + (r.score ?? 0), 0) / scored.length) : '--';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2"
    >
      <div className="bg-surface-container-lowest border border-outline-variant rounded p-4 flex flex-col hover:border-primary/50 transition-colors">
        <span className="font-label-mono text-meta-data text-on-surface-variant uppercase tracking-wider mb-1">Total Submissions</span>
        <span className="font-display-md text-on-surface">{history.length}</span>
      </div>
      <div className="bg-surface-container-lowest border border-outline-variant rounded p-4 flex flex-col hover:border-primary/50 transition-colors">
        <span className="font-label-mono text-meta-data text-on-surface-variant uppercase tracking-wider mb-1">Avg. Novelty Score</span>
        <span className="font-display-md text-primary">
          {avgScore}
        </span>
      </div>
      <div className="bg-surface-container-lowest border border-outline-variant rounded p-4 flex flex-col hover:border-primary/50 transition-colors">
        <span className="font-label-mono text-meta-data text-on-surface-variant uppercase tracking-wider mb-1">Most Frequent Domain</span>
        <span className="font-display-md text-on-surface">General</span>
      </div>
    </motion.div>
  );
}
