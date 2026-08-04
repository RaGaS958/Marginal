/**
 * Shared types for the API layer. These mirror analyzer/main.py's
 * `_build_analysis_payload` shape by hand -- if that function's return
 * shape changes, update this file in the same change.
 */

export interface AnalyzeRequestPayload {
  title: string;
  abstract: string;
  /** Backend field name is `workflow` (see analyzer/state.py); this app's
   * form calls the same concept `methodology` -- mapped at the call site
   * in src/lib/api.ts, not renamed throughout the UI. */
  workflow: string;
  /** Optional client-generated ID. If supplied, the backend adopts it as
   * the canonical request/thread ID, so a later GET for this same ID
   * (a revisited URL, a stored history entry) resolves correctly. */
  request_id?: string;
  user_email?: string;
  notify_on_completion?: boolean;
}

export interface SimilarPaper {
  title: string;
  authors: string[];
  year: number | null;
  source: "semantic_scholar" | "openalex" | "arxiv" | "crossref";
  citation_count: number | null;
  url: string | null;
}

export interface SimilarityDimension {
  score: number | null;
  rationale: string | null;
}

export interface SimilarityBreakdown {
  abstract: SimilarityDimension;
  methodology: SimilarityDimension;
  workflow: SimilarityDimension;
  keyword: SimilarityDimension;
}

/** The shape shared by the SSE `result` event and the GET response. */
export interface AnalysisResult {
  request_id: string;
  status: "completed" | "running";
  final_report: string | null;
  novelty_score: number | null;
  recommendation: string | null;
  strengths: string[];
  weaknesses: string[];
  reviewer_comments: string | null;
  improvement_suggestions: string | null;
  similar_papers: SimilarPaper[];
  similarity_breakdown: SimilarityBreakdown;
  errors: string[];
}

export type StreamEvent =
  | { type: "progress"; node: string }
  | ({ type: "result" } & AnalysisResult)
  | { type: "email_notification"; success: boolean; message: string; email: string }
  | { type: "error"; message: string };

/**
 * Maps the 15 raw SSE node names to the three execution phases already
 * built into Analysis.tsx's UI ("Reading", "Scoring", "Assembling
 * Report") -- a phase shows complete only once every node in its group
 * has reported in. See analyzer/graph.py for the full 7-stage topology
 * this collapses into 3 for this simpler progress view.
 */
export const EXECUTION_PHASES = [
  {
    id: "reading",
    label: "Reading",
    description: "Parsing submission data and retrieving related literature.",
    nodes: [
      "detect_research_domain",
      "extract_problem_statement",
      "extract_methodology",
      "extract_workflow",
      "extract_keywords",
      "generate_search_queries",
      "literature_search",
    ],
  },
  {
    id: "scoring",
    label: "Scoring",
    description: "Computing semantic similarity across four dimensions.",
    nodes: [
      "abstract_similarity",
      "methodology_similarity",
      "workflow_similarity",
      "keyword_similarity",
      "novelty_score",
    ],
  },
  {
    id: "assembling",
    label: "Assembling Report",
    description: "Writing the reviewer's strengths, weaknesses, and suggestions.",
    nodes: ["reviewer_agent", "improvement_agent", "formatter"],
  },
] as const;

export const TOTAL_NODE_COUNT = EXECUTION_PHASES.reduce((sum, phase) => sum + phase.nodes.length, 0);
