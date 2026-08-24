import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkHealth, extractFromFile } from '../api';

describe('api.ts', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('checkHealth returns true when response is ok', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);
    const result = await checkHealth();
    expect(result).toBe(true);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/health'));
  });

  it('checkHealth returns false when response is not ok', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));
    const result = await checkHealth();
    expect(result).toBe(false);
  });

  it('extractFromFile calls /extract with formData', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ title: 'Mocked Title' })
    } as Response);

    const dummyFile = new File(['dummy'], 'dummy.pdf');
    const result = await extractFromFile(dummyFile);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/extract'),
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData)
      })
    );
    expect(result.title).toBe('Mocked Title');
  });
});
