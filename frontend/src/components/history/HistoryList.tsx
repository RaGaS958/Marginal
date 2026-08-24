import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { CheckCircle2, AlertCircle, ArrowRight, FileText, Plus, Trash2 } from 'lucide-react';
import { AnalysisRequest } from '@/store/history';
import { motion, AnimatePresence } from 'motion/react';

interface HistoryListProps {
  history: AnalysisRequest[];
  onDelete?: (id: string) => void;
}

export function HistoryList({ history, onDelete }: HistoryListProps) {
  const navigate = useNavigate();

  if (history.length === 0) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-panel rounded-lg p-12 flex-col items-center justify-center text-center shadow-md my-12 border-dashed border-2 border-outline-variant flex"
      >
        <FileText className="text-outline-variant mb-4" size={48} strokeWidth={1} />
        <h2 className="font-headline-md text-headline-md text-on-background mb-2">No Analysis History Yet</h2>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-md mb-8">
          Your local history is currently empty or no results match your filters.
        </p>
        <button 
          onClick={() => navigate('/analyze')}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} />
          Start New Review
        </button>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <AnimatePresence mode="popLayout">
        {history.map((req, index) => (
          <motion.div 
            key={req.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => navigate(`/analysis/${req.id}`)}
            className={`bg-surface-container-lowest border border-outline-variant rounded p-6 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group cursor-pointer ${req.status === 'failed' ? 'opacity-75' : ''}`}
          >
            <div className={`absolute left-0 top-0 bottom-0 w-1 transition-all group-hover:w-2 ${
              req.status === 'failed' ? 'bg-error' : 
              req.status === 'completed' ? 'bg-secondary' : 
              'bg-primary'
            }`}></div>
            
            <div className="flex flex-col gap-1 flex-grow pl-2">
              <div className="flex items-center gap-3 mb-1">
                <span className="font-meta-data text-meta-data text-on-surface-variant">{format(new Date(req.date), 'MMM d, yyyy')}</span>
                <span className="w-1 h-1 rounded-full bg-outline-variant"></span>
                <span className="font-meta-data text-meta-data text-on-surface-variant uppercase tracking-wider">{req.domain}</span>
              </div>
              <h3 className="font-headline-md text-headline-md text-on-background line-clamp-1">{req.title}</h3>
              <p className="font-body-md text-body-md text-on-surface-variant line-clamp-1">{req.author || 'Unknown Author'}</p>
            </div>
            
            <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 border-outline-variant pt-4 md:pt-0 mt-2 md:mt-0">
              <div className="flex flex-col items-center justify-center px-4 border-r border-outline-variant">
                <span className="font-meta-data text-meta-data text-on-surface-variant mb-1 uppercase tracking-wider">Novelty Score</span>
                <span className={`font-label-mono text-label-mono font-bold ${
                  req.status === 'failed' ? 'text-on-surface-variant' : 
                  req.score == null ? 'text-on-surface-variant' :
                  req.score >= 70 ? 'text-secondary' : 
                  req.score >= 40 ? 'text-[#D97706]' : 
                  'text-error'
                }`}>
                  {req.score != null ? `${req.score} / 100` : '-- / 100'}
                </span>
              </div>
              
              {req.status === 'failed' ? (
                <div className="flex items-center gap-2 px-3 py-1 bg-error-container/20 text-on-error-container rounded border border-error/50">
                  <AlertCircle size={16} className="fill-current text-error" />
                  <span className="font-label-mono text-label-mono">Failed</span>
                </div>
              ) : req.status === 'completed' ? (
                <div className="flex items-center gap-2 px-3 py-1 bg-secondary/10 border-secondary/30 text-secondary rounded border">
                  <CheckCircle2 size={16} className="text-secondary fill-current" />
                  <span className="font-label-mono text-label-mono">Completed</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1 bg-surface-container-low rounded border border-outline-variant text-on-surface">
                  <CheckCircle2 size={16} className="text-primary fill-current opacity-50 animate-pulse" />
                  <span className="font-label-mono text-label-mono">In Progress</span>
                </div>
              )}
              
              <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                {onDelete && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(req.id);
                    }}
                    className="text-on-surface-variant hover:bg-error-container hover:text-error transition-colors p-2 rounded-full"
                    title="Delete from history"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
                <button className="text-on-surface-variant hover:text-primary transition-colors p-2 hidden sm:block transform group-hover:translate-x-1 duration-300">
                  <ArrowRight size={20} />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
