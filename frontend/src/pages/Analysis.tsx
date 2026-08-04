import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useHistoryStore, type AnalysisRequest } from '@/store/history';
import { useAuthStore } from '@/store/auth';
import { ArrowLeft, Check, AlertTriangle, RefreshCw, FileText, XCircle, ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';
import { PageLoader } from '@/components/ui/PageLoader';
import { streamAnalysis, fetchResult } from '@/lib/api';
import { EXECUTION_PHASES } from '@/lib/types';
import type { AnalysisResult } from '@/lib/types';

const POLL_INTERVAL_MS = 3000;
// The backend's GET /analyze/{id} can only ever report "completed" or
// "running" (derived from whether final_report is set) -- there is no
// backend-side "failed" status for a run that's simply slow. Without a
// cap, revisiting a link for a run that's still going (tab closed and
// reopened, a bookmarked history link) polls every 3s forever with zero
// user-facing feedback and zero escape hatch, for as long as the backend
// process stays up. ~3 minutes covers a real degraded-provider run
// (measured up to ~80s end to end even in a fast-failing environment)
// with real headroom, while still guaranteeing this can't run forever.
const MAX_POLL_ATTEMPTS = 60;

function resultToUpdates(data: AnalysisResult): Partial<AnalysisRequest> {
  return {
    status: 'completed',
    score: data.novelty_score,
    recommendation: data.recommendation,
    strengths: data.strengths,
    weaknesses: data.weaknesses,
    reviewerComments: data.reviewer_comments,
    improvementSuggestions: data.improvement_suggestions,
    similarPapers: data.similar_papers,
    similarityBreakdown: data.similarity_breakdown,
    finalReport: data.final_report,
    errors: data.errors,
  };
}

/** Synthesizes a full, freshly-typed AnalysisRequest for the "not in
 * local history, but the backend has it" restore path -- kept separate
 * from resultToUpdates (a Partial, for updating an *existing* entry) so
 * spreading a Partial never has to satisfy AnalysisRequest's required
 * fields at the call site. */
function restoredRequestFromResult(id: string, data: AnalysisResult): AnalysisRequest {
  return {
    id,
    title: 'Restored analysis',
    abstract: '',
    domain: 'General',
    date: new Date().toISOString(),
    status: 'completed',
    score: data.novelty_score,
    recommendation: data.recommendation,
    strengths: data.strengths,
    weaknesses: data.weaknesses,
    reviewerComments: data.reviewer_comments,
    improvementSuggestions: data.improvement_suggestions,
    similarPapers: data.similar_papers,
    similarityBreakdown: data.similarity_breakdown,
    finalReport: data.final_report,
    errors: data.errors,
  };
}

type PhaseStatus = 'pending' | 'active' | 'done';

function getPhaseStatus(nodes: readonly string[], completedNodes: Set<string>): PhaseStatus {
  const completedCount = nodes.filter((n) => completedNodes.has(n)).length;
  if (completedCount === nodes.length) return 'done';
  if (completedCount > 0) return 'active';
  return 'pending';
}

export function Analysis() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isFresh = searchParams.get('fresh') === '1';
  const navigate = useNavigate();

  const user = useAuthStore((state) => state.user);
  const request = useHistoryStore((state) => state.history.find((r) => r.id === id && r.userEmail === user?.email));
  const addRequest = useHistoryStore((state) => state.addRequest);
  const updateRequest = useHistoryStore((state) => state.updateRequest);

  const [completedNodes, setCompletedNodes] = useState<Set<string>>(new Set());
  const [notFound, setNotFound] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ success: boolean; message: string; email: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    const abortController = new AbortController();
    let cancelled = false;

    async function pollUntilDone(attempt = 0) {
      try {
        const data = await fetchResult(id!, abortController.signal);
        if (cancelled) return;
        if (data.status === 'completed') {
          updateRequest(id!, resultToUpdates(data));
          return;
        }
        if (attempt >= MAX_POLL_ATTEMPTS) {
          updateRequest(id!, {
            status: 'failed',
            errorMessage:
              "This analysis is taking much longer than expected and may have stalled. " +
              "It's still running on the server, so it may finish on its own -- check back " +
              'from History in a few minutes, or start a new analysis.',
          });
          return;
        }
        // Still running elsewhere -- someone reconnected to a URL for a
        // run that hasn't finished (a history link, a refresh mid-run).
        // No live-stream reconnect exists yet, so this polls instead --
        // an honest "still working" state, not a broken empty report.
        setTimeout(() => {
          if (!cancelled) pollUntilDone(attempt + 1);
        }, POLL_INTERVAL_MS);
      } catch (err) {
        if (cancelled || (err instanceof Error && err.name === 'AbortError')) return;
        updateRequest(id!, {
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : 'Something went wrong.',
        });
      }
    }

    async function runFresh(current: AnalysisRequest) {
      try {
        for await (const event of streamAnalysis({
          title: current.title,
          abstract: current.abstract,
          workflow: current.methodology ?? '',
          request_id: id,
          user_email: user?.email,
          notify_on_completion: user?.preferences?.notifications ?? true,
        }, abortController.signal)) {
          if (cancelled) return;
          if (event.type === 'progress') {
            setCompletedNodes((prev) => new Set(prev).add(event.node));
          } else if (event.type === 'result') {
            updateRequest(id!, resultToUpdates(event));
          } else if (event.type === 'error') {
            updateRequest(id!, { status: 'failed', errorMessage: event.message });
          } else if (event.type === 'email_notification') {
            setEmailStatus({ success: event.success, message: event.message, email: event.email });
          }
        }
      } catch (err) {
        if (cancelled || (err instanceof Error && err.name === 'AbortError')) return;
        updateRequest(id!, {
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : 'Something went wrong.',
        });
      }
    }

    if (isFresh) {
      if (!request) {
        setNotFound(true);
        return;
      }
      if (request.status === 'running') {
        runFresh(request);
      }
    } else if (request) {
      if (request.status === 'running') {
        pollUntilDone();
      }
    } else {
      // Not in local history at all -- the backend is still the real
      // source of truth (a shared link, a different device, storage
      // that got cleared), so try it directly before giving up.
      fetchResult(id, abortController.signal)
        .then((data) => {
          if (cancelled) return;
          addRequest(restoredRequestFromResult(id, data));
        })
        .catch((err) => {
          if (!cancelled && err.name !== 'AbortError') setNotFound(true);
        });
    }

    return () => {
      cancelled = true;
      abortController.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isFresh]);

  if (notFound) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center">
          <h2 className="font-headline-md text-on-surface mb-2">Analysis not found</h2>
          <p className="font-body-md text-on-surface-variant mb-4">
            {isFresh
              ? 'Missing submission data for this review — try starting a new one.'
              : "This ID isn't on this device and the backend doesn't have a record of it either."}
          </p>
          <button onClick={() => navigate('/analyze')} className="btn-primary mt-4">
            Start New Analysis
          </button>
        </div>
      </div>
    );
  }

  if (!request) {
    return <PageLoader />;
  }

  return (
    <main className="flex-grow w-full max-w-max-width mx-auto px-margin-mobile md:px-margin-desktop py-8 md:py-12">
      <div className="mb-12 border-b border-surface-variant pb-6">
        <div className="flex items-center gap-2 text-on-surface-variant font-label-mono text-label-mono mb-2">
          <button onClick={() => navigate('/history')} className="hover:text-primary flex items-center gap-1">
            <ArrowLeft size={16} /> Back to History
          </button>
          <span>/</span>
          <span>{request.id.slice(0, 8).toUpperCase()}</span>
        </div>
        <h1 className="font-display-lg-mobile md:font-display-lg text-display-lg-mobile md:text-display-lg text-on-surface">
          Analysis: &quot;{request.title}&quot;
        </h1>
      </div>

      {request.status === 'running' && <RunningView completedNodes={completedNodes} isFresh={isFresh} />}
      {request.status === 'failed' && <FailedView message={request.errorMessage} onRetry={() => navigate('/analyze')} />}
      {request.status === 'completed' && <CompletedView request={request} emailStatus={emailStatus} />}
    </main>
  );
}

function FormattedText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={className}>
      {text.split('\n').map((line, i) => {
        // Parse **bold**
        const parts = line.split(/\*\*(.*?)\*\*/g);
        return (
          <span key={i} className="block min-h-[1em]">
            {parts.map((part, j) => {
              if (j % 2 === 1) {
                return <strong key={j} className="font-semibold">{part}</strong>;
              }
              // Parse _italic_
              const italicParts = part.split(/_(.*?)_/g);
              return italicParts.map((ip, k) => (k % 2 === 1 ? <em key={k}>{ip}</em> : ip));
            })}
          </span>
        );
      })}
    </div>
  );
}

function RunningView({ completedNodes, isFresh }: { completedNodes: Set<string>; isFresh: boolean }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
      <div className="lg:col-span-3">
        <h2 className="font-label-mono text-label-mono text-on-surface-variant uppercase tracking-widest mb-6">
          Execution Phase
        </h2>
        <div className="relative border-l border-surface-variant ml-3 space-y-8 pb-4">
          {EXECUTION_PHASES.map((phase, i) => {
            const status = getPhaseStatus(phase.nodes, completedNodes);
            return (
              <div key={phase.id} className={`relative pl-6 flex flex-col group ${status === 'pending' ? 'opacity-50' : ''}`}>
                <div
                  className={
                    status === 'done'
                      ? 'absolute -left-[9px] top-0 bg-primary rounded-full p-0.5 border-2 border-surface'
                      : status === 'active'
                        ? 'absolute -left-[7px] top-0.5 w-3.5 h-3.5 bg-primary-container rounded-full border-2 border-surface flex items-center justify-center'
                        : 'absolute -left-[7px] top-1 w-3.5 h-3.5 bg-surface rounded-full border-2 border-outline-variant'
                  }
                >
                  {status === 'done' && <Check size={12} className="text-on-primary" />}
                  {status === 'active' && (
                    <motion.div
                      className="w-1.5 h-1.5 bg-primary rounded-full"
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  )}
                </div>
                <span
                  className={`font-label-mono text-label-mono ${status === 'pending' ? 'text-on-surface-variant' : status === 'active' ? 'text-on-surface font-bold' : 'text-primary font-bold'}`}
                >
                  {i + 1}. {phase.label}
                </span>
                <span className="font-meta-data text-meta-data text-on-surface-variant mt-1">{phase.description}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="lg:col-span-9 flex flex-col gap-6">
        <div className="w-full aspect-video bg-inverse-surface rounded-lg relative overflow-hidden flex items-center justify-center shadow-inner">
          <motion.div
            className="absolute z-10 w-16 h-16 bg-surface rounded-full flex items-center justify-center shadow-md"
            animate={{
              boxShadow: [
                '0 0 0 0 rgba(144, 211, 195, 0.4)',
                '0 0 0 20px rgba(144, 211, 195, 0)',
                '0 0 0 0 rgba(144, 211, 195, 0)',
              ],
            }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <FileText size={32} className="text-primary" />
          </motion.div>
          <motion.div
            className="absolute w-64 h-64 border border-outline/20 rounded-full flex items-center justify-center"
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          >
            <motion.div
              className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-primary-fixed-dim rounded-full shadow-[0_0_10px_rgba(144,211,195,0.8)]"
              animate={{ rotate: -360 }}
              transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
            />
          </motion.div>
          <div className="absolute inset-0 opacity-[0.03]" 
            style={{ backgroundImage: 'radial-gradient(var(--color-on-surface) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
          ></div>
        </div>

        <div className="flex items-center gap-3 bg-surface-container-lowest p-4 border border-outline-variant rounded paper-card">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
            <RefreshCw className="text-primary" size={20} />
          </motion.div>
          <p className="font-label-mono text-label-mono text-on-surface">
            {isFresh
              ? `${completedNodes.size} of 15 steps complete…`
              : 'This review is running elsewhere — checking back automatically.'}
          </p>
        </div>
      </div>
    </div>
  );
}

function FailedView({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="max-w-xl mx-auto text-center py-16">
      <XCircle className="mx-auto text-error mb-4" size={48} strokeWidth={1.5} />
      <h2 className="font-headline-md text-headline-md text-on-surface mb-2">The review couldn&apos;t finish</h2>
      <p className="font-body-md text-body-md text-on-surface-variant mb-8">
        {message || 'Something went wrong while running this analysis.'}
      </p>
      <button onClick={onRetry} className="btn-primary">
        Start New Analysis
      </button>
    </div>
  );
}

function CompletedView({ request, emailStatus }: { request: AnalysisRequest, emailStatus?: { success: boolean; message: string; email: string } | null }) {
  const hasDegraded = (request.errors?.length ?? 0) > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="space-y-16"
    >
      <div className="text-center space-y-6">
        <div className="inline-flex items-center gap-2 bg-secondary-container text-on-secondary-container px-4 py-1.5 rounded-full font-label-mono text-label-mono">
          <Check size={18} />
          Analysis Complete
        </div>
        {emailStatus && (
          <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full font-label-mono text-label-mono ml-4 ${emailStatus.success ? 'bg-primary-container text-on-primary-container' : 'bg-error-container text-on-error-container'}`}>
            {emailStatus.success ? <Check size={18} /> : <XCircle size={18} />}
            {emailStatus.success ? `Report sent to ${emailStatus.email}` : `Failed to send email to ${emailStatus.email}`}
          </div>
        )}
        <div>
          <h2 className="font-label-mono text-label-mono text-on-surface-variant uppercase tracking-widest mb-2">
            Novelty Score
          </h2>
          <div className="font-display-lg-mobile md:font-display-lg text-primary">
            {request.score !== null && request.score !== undefined ? `${Math.round(request.score)} / 100` : 'Unavailable'}
          </div>
        </div>
        <div className="max-w-md mx-auto p-4 border border-outline-variant bg-surface-container-lowest shadow-sm">
          <span className="font-label-mono text-label-mono text-on-surface-variant block mb-1">Recommendation</span>
          <span className="font-headline-md text-headline-md text-on-surface block">
            {request.recommendation || 'Unavailable'}
          </span>
          {request.reviewerComments && (
            <FormattedText 
              text={request.reviewerComments} 
              className="font-body-md text-body-md text-on-surface-variant mt-2 text-sm" 
            />
          )}
        </div>
      </div>

      {hasDegraded && (
        <div className="max-w-2xl mx-auto flex items-start gap-3 border border-tertiary-container bg-tertiary-container/10 rounded p-4">
          <AlertTriangle className="text-tertiary shrink-0 mt-0.5" size={18} />
          <div className="font-body-md text-sm text-on-surface-variant">
            <p className="font-medium text-on-surface mb-1">Some analysis steps degraded during this run.</p>
            <ul className="space-y-1">
              {request.errors!.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto space-y-8 paper-card p-8 md:p-12">
        <section>
          <h3 className="font-headline-md text-headline-md text-on-surface mb-4 flex items-center gap-2">
            <Check className="text-primary" /> Strengths
          </h3>
          {request.strengths && request.strengths.length > 0 ? (
            <ul className="space-y-3 font-body-lg text-body-lg text-on-surface leading-relaxed">
              {request.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2.5 shrink-0"></span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-body-md text-on-surface-variant italic">None recorded.</p>
          )}
        </section>

        <div className="w-full h-px bg-surface-variant my-8"></div>

        <section>
          <h3 className="font-headline-md text-headline-md text-on-surface mb-4 flex items-center gap-2">
            <AlertTriangle className="text-tertiary" /> Weaknesses &amp; Overlaps
          </h3>
          {request.weaknesses && request.weaknesses.length > 0 ? (
            <ul className="space-y-3 font-body-lg text-body-lg text-on-surface leading-relaxed">
              {request.weaknesses.map((w, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-tertiary mt-2.5 shrink-0"></span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-body-md text-on-surface-variant italic">None recorded.</p>
          )}
        </section>

        {request.improvementSuggestions && (
          <>
            <div className="w-full h-px bg-surface-variant my-8"></div>
            <section>
              <h3 className="font-headline-md text-headline-md text-on-surface mb-4">Suggestions to widen the gap</h3>
              <FormattedText 
                text={request.improvementSuggestions} 
                className="font-body-lg text-body-lg text-on-surface leading-relaxed" 
              />
            </section>
          </>
        )}

        {request.similarPapers && request.similarPapers.length > 0 && (
          <>
            <div className="w-full h-px bg-surface-variant my-8"></div>
            <section>
              <h3 className="font-headline-md text-headline-md text-on-surface mb-4">Closest existing work</h3>
              <ul className="space-y-4">
                {request.similarPapers.slice(0, 8).map((paper, i) => (
                  <li key={i} className="border-b border-outline-variant/40 pb-3 last:border-b-0">
                    {paper.url ? (
                      <a
                        href={paper.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-body-md font-medium text-on-surface hover:text-primary transition-colors inline-flex items-start gap-1.5"
                      >
                        {paper.title}
                        <ExternalLink size={12} className="mt-1 shrink-0" />
                      </a>
                    ) : (
                      <p className="font-body-md font-medium text-on-surface">{paper.title}</p>
                    )}
                    <p className="font-meta-data text-meta-data text-on-surface-variant mt-1">
                      {paper.year ?? '—'} · {paper.source.replace('_', ' ')}
                      {paper.citation_count !== null ? ` · ${paper.citation_count} citations` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </motion.div>
  );
}
