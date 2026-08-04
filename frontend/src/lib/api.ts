import type { AnalysisResult, AnalyzeRequestPayload, StreamEvent } from "./types";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

/**
 * Submits a new analysis and returns an async generator of stream events.
 * Mirrors the backend's SSE contract exactly (type: "progress" | "result" | "error"),
 * so a dropped connection here just means the generator ends early -- the
 * companion fetchResult() below can pick the result back up by request_id.
 */
export async function* streamAnalysis(payload: AnalyzeRequestPayload, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
  const response = await fetch(`${API_BASE_URL}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Could not start the analysis (${response.status}). ${detail}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const dataLine = line.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue;
      const raw = dataLine.slice("data: ".length);
      if (raw === "[DONE]") return;
      try {
        yield JSON.parse(raw) as StreamEvent;
      } catch {
        // malformed chunk -- skip rather than take the whole stream down
      }
    }
  }
}

export async function fetchResult(requestId: string, signal?: AbortSignal): Promise<AnalysisResult> {
  const response = await fetch(`${API_BASE_URL}/analyze/${requestId}`, { signal });
  if (!response.ok) {
    throw new Error(response.status === 404 ? "No analysis found for this ID." : `Request failed (${response.status}).`);
  }
  return response.json();
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
