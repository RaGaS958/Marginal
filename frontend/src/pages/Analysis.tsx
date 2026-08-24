import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useHistoryStore, type AnalysisRequest } from '@/store/history';
import { useAuthStore } from '@/store/auth';
import { ArrowLeft, Check, AlertTriangle, RefreshCw, FileText, XCircle, ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
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
          conclusion: current.conclusion ?? '',
          request_id: id,
          user_email: user?.email,
        }, abortController.signal)) {
          if (cancelled) return;
          if (event.type === 'progress') {
            setCompletedNodes((prev) => new Set(prev).add(event.node));
          } else if (event.type === 'result') {
            updateRequest(id!, resultToUpdates(event));
          } else if (event.type === 'error') {
            updateRequest(id!, { status: 'failed', errorMessage: event.message });
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
      {request.status === 'completed' && <CompletedView request={request} />}
    </main>
  );
}

/* ── Markdown Renderer ─────────────────────────────────────────── */

function parseInline(text: string) {
  // Parse **bold**, *italic*, `code`, and [links](url)
  const tokens: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) tokens.push(<strong key={key++} className="font-semibold text-on-surface">{match[2]}</strong>);
    else if (match[3]) tokens.push(<em key={key++} className="italic">{match[3]}</em>);
    else if (match[4]) tokens.push(<code key={key++} className="px-1.5 py-0.5 rounded bg-surface-container text-primary font-label-mono text-[13px]">{match[4]}</code>);
    else if (match[5] && match[6]) tokens.push(<a key={key++} href={match[6]} target="_blank" rel="noopener noreferrer" className="text-secondary underline underline-offset-2 hover:text-secondary-container transition-colors">{match[5]}</a>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) tokens.push(text.slice(lastIndex));
  return tokens.length > 0 ? tokens : [text];
}

function MarkdownRenderer({ text, className = '' }: { text: string; className?: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Empty line → spacer
    if (!trimmed) { i++; continue; }

    // Headers
    if (trimmed.startsWith('### ')) {
      elements.push(<h4 key={i} className="font-headline-md text-[18px] font-semibold text-on-surface mt-5 mb-2">{parseInline(trimmed.slice(4))}</h4>);
      i++; continue;
    }
    if (trimmed.startsWith('## ')) {
      elements.push(<h3 key={i} className="font-headline-md text-headline-md font-semibold text-on-surface mt-6 mb-3">{parseInline(trimmed.slice(3))}</h3>);
      i++; continue;
    }
    if (trimmed.startsWith('# ')) {
      elements.push(<h2 key={i} className="font-headline-md text-[28px] font-bold text-on-surface mt-6 mb-3">{parseInline(trimmed.slice(2))}</h2>);
      i++; continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(trimmed)) {
      elements.push(<hr key={i} className="border-outline-variant/40 my-6" />);
      i++; continue;
    }

    // Bullet list
    if (/^[-*+]\s/.test(trimmed)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i].trim())) {
        items.push(
          <li key={i} className="flex items-start gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary mt-2.5 shrink-0" />
            <span>{parseInline(lines[i].trim().replace(/^[-*+]\s/, ''))}</span>
          </li>
        );
        i++;
      }
      elements.push(<ul key={`ul-${i}`} className="space-y-2 my-3">{items}</ul>);
      continue;
    }

    // Numbered list
    if (/^\d+[.)]\s/.test(trimmed)) {
      const items: React.ReactNode[] = [];
      let n = 1;
      while (i < lines.length && /^\d+[.)]\s/.test(lines[i].trim())) {
        items.push(
          <li key={i} className="flex items-start gap-3">
            <span className="font-label-mono text-label-mono text-secondary mt-0.5 shrink-0 w-5 text-right">{n}.</span>
            <span>{parseInline(lines[i].trim().replace(/^\d+[.)]\s/, ''))}</span>
          </li>
        );
        n++; i++;
      }
      elements.push(<ol key={`ol-${i}`} className="space-y-2 my-3">{items}</ol>);
      continue;
    }

    // Regular paragraph
    elements.push(<p key={i} className="my-2 leading-relaxed">{parseInline(trimmed)}</p>);
    i++;
  }

  return <div className={className}>{elements}</div>;
}

/* ── Score Ring ─────────────────────────────────────────────────── */

function ScoreRing({ score, size = 120, label }: { score: number | null | undefined; size?: number; label?: string }) {
  const value = score != null ? Math.round(score) : null;
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = value != null ? ((value) / 100) * circumference : 0;
  const color = value == null ? 'var(--color-outline-variant)' : value >= 70 ? '#208A74' : value >= 40 ? '#D97706' : '#DC2626';

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-outline-variant)" strokeWidth="6" opacity="0.3" />
        {value != null && (
          <motion.circle
            cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={circumference} initial={{ strokeDashoffset: circumference }} animate={{ strokeDashoffset: circumference - progress }}
            transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
          />
        )}
        <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central" className="rotate-90 origin-center"
          fill="var(--color-on-surface)" fontSize={size * 0.28} fontWeight="700" fontFamily="var(--font-display-lg)">
          {value != null ? value : '—'}
        </text>
      </svg>
      {label && <span className="font-label-mono text-label-mono text-on-surface-variant uppercase tracking-widest">{label}</span>}
    </div>
  );
}

/* ── Dimension Bar ──────────────────────────────────────────────── */

function DimensionBar({ label, score, rationale }: { key?: React.Key; label: string; score: number | null | undefined; rationale?: string | null }) {
  const value = score != null ? Math.round(Math.max(0, 100 - score)) : null;
  const color = value == null ? 'bg-outline-variant' : value >= 70 ? 'bg-[#208A74]' : value >= 40 ? 'bg-[#D97706]' : 'bg-[#DC2626]';

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-baseline">
        <span className="font-label-mono text-label-mono text-on-surface-variant uppercase tracking-widest">{label}</span>
        <span className="font-label-mono text-label-mono text-on-surface font-bold">{value != null ? `${value}%` : '—'}</span>
      </div>
      <div className="h-2 rounded-full bg-surface-container-high overflow-hidden">
        {value != null && (
          <motion.div className={`h-full rounded-full ${color}`}
            initial={{ width: 0 }} animate={{ width: `${value}%` }}
            transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
          />
        )}
      </div>
      {rationale && <p className="font-meta-data text-meta-data text-on-surface-variant mt-1 line-clamp-2">{rationale}</p>}
    </div>
  );
}

/* ── Bento Card wrapper ────────────────────────────────────────── */

function BentoCard({ children, className = '', span = 1 }: { children: React.ReactNode; className?: string; span?: 1 | 2 | 3 }) {
  const spanClass = span === 3 ? 'md:col-span-3' : span === 2 ? 'md:col-span-2' : 'md:col-span-1';
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={`paper-card p-6 md:p-8 ${spanClass} ${className}`}
    >
      {children}
    </motion.div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="font-label-mono text-label-mono text-on-surface-variant uppercase tracking-widest mb-4">{children}</h3>;
}

/* ── CompletedView — Bento Layout ─────────────────────────────── */

function CompletedView({ request }: { request: AnalysisRequest }) {
  const hasDegraded = (request.errors?.length ?? 0) > 0;
  const bd = request.similarityBreakdown;

  // Compute dimension data for charts
  const dimDefs = [
    { name: 'Abstract', key: 'abstract' as const },
    { name: 'Methodology', key: 'methodology' as const },
    { name: 'Workflow', key: 'workflow' as const },
    { name: 'Keywords', key: 'keyword' as const },
    { name: 'Conclusion', key: 'conclusion' as const },
  ];
  const chartData = bd ? dimDefs.map(d => {
    const dim = bd[d.key];
    const sim = dim?.score;
    return { dimension: d.name, novelty: sim != null ? Math.max(0, 100 - sim) : 0, score: sim ?? 0, available: sim != null };
  }).filter(d => d.available) : [];

  const strongest = chartData.length > 0 ? [...chartData].sort((a, b) => b.novelty - a.novelty)[0] : null;
  const weakest = chartData.length > 0 ? [...chartData].sort((a, b) => a.novelty - b.novelty)[0] : null;
  const avgNovelty = chartData.length > 0 ? Math.round(chartData.reduce((s, d) => s + d.novelty, 0) / chartData.length) : null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, staggerChildren: 0.08 }}
      className="space-y-6"
    >
      {/* ── Row 0: Status badges ─────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-2 bg-secondary-container text-on-secondary-container px-4 py-1.5 rounded-full font-label-mono text-label-mono">
          <Check size={16} /> Analysis Complete
        </div>
      </div>

      {/* ── Row 1: Hero — Score + Recommendation + Dimension bars (3 col bento) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Score ring — 1 col */}
        <BentoCard className="flex flex-col items-center justify-center gap-4">
          <ScoreRing score={request.score} size={140} />
          <div className="text-center">
            <span className="font-label-mono text-label-mono text-on-surface-variant uppercase tracking-widest block">Novelty Score</span>
            <span className="font-headline-md text-headline-md text-on-surface block mt-1">
              {request.score != null ? `${Math.round(request.score)} / 100` : 'Unavailable'}
            </span>
          </div>
        </BentoCard>

        {/* Recommendation + reviewer comments — 2 col */}
        <BentoCard span={2} className="flex flex-col justify-between">
          <div>
            <SectionLabel>Recommendation</SectionLabel>
            <span className="font-headline-md text-headline-md text-on-surface block mb-4">
              {request.recommendation || 'Unavailable'}
            </span>
          </div>
          {request.reviewerComments && (
            <div className="border-t border-outline-variant/40 pt-4 mt-auto">
              <span className="font-label-mono text-meta-data text-on-surface-variant uppercase tracking-widest block mb-2">Reviewer Comments</span>
              <MarkdownRenderer text={request.reviewerComments} className="font-body-md text-on-surface-variant text-sm max-h-40 overflow-y-auto" />
            </div>
          )}
        </BentoCard>
      </div>

      {/* ── Row 2: Dimension breakdown bars — full width */}
      {bd && (
        <BentoCard span={3} className="w-full">
          <SectionLabel>Similarity Breakdown</SectionLabel>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mt-2">
            {dimDefs.map(d => {
              const dim = bd[d.key];
              return <DimensionBar key={d.key} label={d.name} score={dim?.score} rationale={dim?.rationale} />;
            })}
          </div>
        </BentoCard>
      )}

      {/* ── Row 3: Stats cards + Charts (3 col bento) */}
      {chartData.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left: 3 stat mini-cards stacked in 1 col */}
          <div className="flex flex-col gap-4">
            <BentoCard className="!p-5">
              <span className="font-meta-data text-meta-data text-on-surface-variant uppercase tracking-widest block mb-1">Strongest</span>
              <span className="font-headline-md text-headline-md text-secondary">{strongest?.dimension}</span>
              <span className="block text-sm text-on-surface-variant">{strongest ? `${Math.round(strongest.novelty)}% novelty` : ''}</span>
            </BentoCard>
            <BentoCard className="!p-5">
              <span className="font-meta-data text-meta-data text-on-surface-variant uppercase tracking-widest block mb-1">Weakest</span>
              <span className="font-headline-md text-headline-md text-error">{weakest?.dimension}</span>
              <span className="block text-sm text-on-surface-variant">{weakest ? `${Math.round(weakest.novelty)}% novelty` : ''}</span>
            </BentoCard>
            <BentoCard className="!p-5">
              <span className="font-meta-data text-meta-data text-on-surface-variant uppercase tracking-widest block mb-1">Avg Novelty</span>
              <span className="font-headline-md text-headline-md text-on-surface">{avgNovelty != null ? `${avgNovelty}%` : '—'}</span>
              <span className="block text-sm text-on-surface-variant">{chartData.length} dimensions</span>
            </BentoCard>
          </div>

          {/* Radar chart — 1 col */}
          <BentoCard className="h-80 flex flex-col">
            <SectionLabel>Novelty Radar</SectionLabel>
            <div className="flex-grow min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
                  <PolarGrid stroke="var(--color-outline-variant)" />
                  <PolarAngleAxis dataKey="dimension" tick={{ fill: 'var(--color-on-surface-variant)', fontSize: 11, fontFamily: 'var(--font-label-mono)' }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name="Novelty" dataKey="novelty" stroke="#208A74" fill="#208A74" fillOpacity={0.35} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </BentoCard>

          {/* Bar chart — 1 col */}
          <BentoCard className="h-80 flex flex-col">
            <SectionLabel>Dimension Breakdown</SectionLabel>
            <div className="flex-grow min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-outline-variant)" opacity={0.4} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: 'var(--color-on-surface-variant)', fontSize: 11 }} />
                  <YAxis dataKey="dimension" type="category" tick={{ fill: 'var(--color-on-surface)', fontSize: 11 }} width={75} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--color-surface-container)', borderColor: 'var(--color-outline-variant)', borderRadius: '12px', fontSize: '13px' }}
                    itemStyle={{ color: 'var(--color-on-surface)' }}
                  />
                  <Bar dataKey="novelty" radius={[0, 6, 6, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.novelty > 70 ? '#208A74' : entry.novelty >= 40 ? '#D97706' : '#DC2626'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </BentoCard>
        </div>
      )}

      {/* ── Row 4: Degradation warning */}
      {hasDegraded && (
        <div className="flex items-start gap-3 border border-tertiary-container bg-tertiary-container/10 rounded-2xl p-5">
          <AlertTriangle className="text-tertiary shrink-0 mt-0.5" size={18} />
          <div className="font-body-md text-sm text-on-surface-variant">
            <p className="font-medium text-on-surface mb-1">Some analysis steps degraded during this run.</p>
            <ul className="space-y-1 list-disc list-inside">
              {request.errors!.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          </div>
        </div>
      )}

      {/* ── Row 5: Strengths + Weaknesses side-by-side (2 col bento) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <BentoCard className="border-l-4 border-l-secondary">
          <SectionLabel>
            <span className="flex items-center gap-2"><Check size={16} className="text-secondary" /> Strengths</span>
          </SectionLabel>
          {request.strengths && request.strengths.length > 0 ? (
            <ul className="space-y-3 font-body-md text-on-surface">
              {request.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary mt-2 shrink-0" />
                  <MarkdownRenderer text={s} className="[&_p]:my-0" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-body-md text-on-surface-variant italic">None recorded.</p>
          )}
        </BentoCard>

        <BentoCard className="border-l-4 border-l-error">
          <SectionLabel>
            <span className="flex items-center gap-2"><AlertTriangle size={16} className="text-error" /> Weaknesses & Overlaps</span>
          </SectionLabel>
          {request.weaknesses && request.weaknesses.length > 0 ? (
            <ul className="space-y-3 font-body-md text-on-surface">
              {request.weaknesses.map((w, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-error mt-2 shrink-0" />
                  <MarkdownRenderer text={w} className="[&_p]:my-0" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-body-md text-on-surface-variant italic">None recorded.</p>
          )}
        </BentoCard>
      </div>

      {/* ── Row 6: Improvement suggestions — full width */}
      {request.improvementSuggestions && (
        <BentoCard span={3} className="w-full">
          <SectionLabel>Suggestions to Widen the Gap</SectionLabel>
          {(() => {
            let parsedSuggestions = null;
            const text = request.improvementSuggestions.trim();
            if (text.startsWith('[') && text.endsWith(']')) {
              try {
                parsedSuggestions = JSON.parse(text);
              } catch (e) {
                // Fallback for python stringified dicts like [{'Priority': 'Major', ...}]
                try {
                  // Replace single quotes with double quotes for keys and string values
                  // This is a naive replacement but works for simple cases
                  const jsonStr = text
                    .replace(/'Priority':/g, '"Priority":')
                    .replace(/'Issue':/g, '"Issue":')
                    .replace(/'Action':/g, '"Action":')
                    .replace(/'Impact':/g, '"Impact":')
                    .replace(/:\s*'([^']*)'/g, ': "$1"');
                  parsedSuggestions = JSON.parse(jsonStr);
                } catch (e2) {
                  // If all parsing fails, it will render as markdown
                }
              }
            }

            if (Array.isArray(parsedSuggestions) && parsedSuggestions.length > 0 && parsedSuggestions[0].Priority) {
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
                  {parsedSuggestions.map((s, i) => (
                    <div key={i} className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-5 flex flex-col gap-3 relative overflow-hidden">
                      <div className={`absolute top-0 left-0 w-1.5 h-full ${
                        s.Priority?.toLowerCase() === 'critical' ? 'bg-error' :
                        s.Priority?.toLowerCase() === 'major' ? 'bg-[#D97706]' :
                        'bg-secondary'
                      }`} />
                      <div className="flex items-center justify-between pl-2">
                        <span className={`font-label-mono text-label-mono uppercase tracking-widest px-2 py-1 rounded-md ${
                          s.Priority?.toLowerCase() === 'critical' ? 'bg-error/10 text-error' :
                          s.Priority?.toLowerCase() === 'major' ? 'bg-[#D97706]/10 text-[#D97706]' :
                          'bg-secondary/10 text-secondary'
                        }`}>
                          {s.Priority} Priority
                        </span>
                      </div>
                      <div className="pl-2 space-y-3 font-body-md text-on-surface">
                        <div>
                          <strong className="block text-sm text-on-surface-variant font-label-mono uppercase tracking-widest mb-1">Issue</strong>
                          <p>{s.Issue}</p>
                        </div>
                        <div>
                          <strong className="block text-sm text-on-surface-variant font-label-mono uppercase tracking-widest mb-1">Action</strong>
                          <p>{s.Action}</p>
                        </div>
                        <div className="pt-2 border-t border-outline-variant/30">
                          <strong className="block text-sm text-on-surface-variant font-label-mono uppercase tracking-widest mb-1">Expected Impact</strong>
                          <p className="text-secondary font-medium">{s.Impact}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            }

            return <MarkdownRenderer text={request.improvementSuggestions} className="font-body-md text-on-surface leading-relaxed" />;
          })()}
        </BentoCard>
      )}

      {/* ── Row 7: Similar papers grid + Comparison table (2 col bento) */}
      {request.similarPapers && request.similarPapers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Paper list */}
          <BentoCard>
            <SectionLabel>Closest Existing Work</SectionLabel>
            <ul className="space-y-3">
              {request.similarPapers.slice(0, 8).map((paper, i) => (
                <li key={i} className="border-b border-outline-variant/30 pb-3 last:border-b-0 last:pb-0">
                  {paper.url ? (
                    <a href={paper.url} target="_blank" rel="noopener noreferrer"
                      className="font-body-md font-medium text-on-surface hover:text-secondary transition-colors inline-flex items-start gap-1.5 group">
                      <span className="group-hover:underline underline-offset-2">{paper.title}</span>
                      <ExternalLink size={12} className="mt-1 shrink-0 opacity-50 group-hover:opacity-100" />
                    </a>
                  ) : (
                    <p className="font-body-md font-medium text-on-surface">{paper.title}</p>
                  )}
                  <p className="font-meta-data text-meta-data text-on-surface-variant mt-1">
                    {paper.year ?? '—'} · {paper.source?.replace('_', ' ')}
                    {paper.citation_count !== null ? ` · ${paper.citation_count} citations` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </BentoCard>

          {/* Comparison table */}
          {bd && (
            <BentoCard>
              <SectionLabel>Comparison with Closest Paper</SectionLabel>
              <div className="mb-4">
                <h4 className="font-body-md font-medium text-on-surface">{request.similarPapers[0].title}</h4>
                <p className="font-meta-data text-meta-data text-on-surface-variant mt-0.5">
                  {request.similarPapers[0].year ?? '—'} · {request.similarPapers[0].source?.replace('_', ' ')}
                  {request.similarPapers[0].citation_count !== null ? ` · ${request.similarPapers[0].citation_count} citations` : ''}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-outline-variant/50">
                      <th className="py-2 pr-4 font-label-mono text-meta-data text-on-surface-variant uppercase tracking-widest">Dimension</th>
                      <th className="py-2 px-2 font-label-mono text-meta-data text-on-surface-variant uppercase tracking-widest text-right">Novelty</th>
                      <th className="py-2 pl-2 font-label-mono text-meta-data text-on-surface-variant uppercase tracking-widest text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dimDefs.map((d, i) => {
                      const sim = bd[d.key]?.score;
                      if (sim == null) return null;
                      const novelty = Math.round(Math.max(0, 100 - sim));
                      return (
                        <tr key={i} className="border-b border-outline-variant/30 last:border-0">
                          <td className="py-2.5 pr-4 font-body-md text-on-surface text-sm">{d.name}</td>
                          <td className="py-2.5 px-2 font-label-mono text-on-surface text-sm text-right font-bold">{novelty}%</td>
                          <td className="py-2.5 pl-2 text-center">
                            {novelty >= 70 ? (
                              <span className="inline-flex items-center gap-1 text-secondary font-label-mono text-meta-data"><span>▲</span> High</span>
                            ) : novelty >= 40 ? (
                              <span className="inline-flex items-center gap-1 text-primary-container font-label-mono text-meta-data"><span>≈</span> Mid</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-error font-label-mono text-meta-data"><span>▼</span> Low</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </BentoCard>
          )}
        </div>
      )}
    </motion.div>
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
