import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Analyze } from '../Analyze';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as api from '@/lib/api';

vi.mock('@/lib/api', () => ({
  extractFromFile: vi.fn()
}));

describe('Analyze Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <Analyze />
      </MemoryRouter>
    );
  };

  it('renders the submission form', () => {
    renderComponent();
    expect(screen.getByText('Submission Form')).toBeInTheDocument();
    expect(screen.getByLabelText(/Manuscript Title/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /RUN THE REVIEW/i })).toBeInTheDocument();
  });

  it('calls extractFromFile when a file is uploaded and populates fields', async () => {
    // Mock the API to return some dummy data
    const mockData = {
      title: 'Extracted Title',
      abstract: 'Extracted abstract that is long enough to pass validation.',
      methodology: 'Extracted Methodology',
      conclusion: 'Extracted Conclusion'
    };
    vi.mocked(api.extractFromFile).mockResolvedValueOnce(mockData);

    renderComponent();

    // Find the hidden file input
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();

    // Simulate file upload
    const dummyFile = new File(['dummy'], 'dummy.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [dummyFile] } });

    // Wait for the extraction API to be called
    await waitFor(() => {
      expect(api.extractFromFile).toHaveBeenCalledWith(dummyFile);
    });

    // The fields should now be populated with the mocked data
    const titleInput = screen.getByLabelText(/Manuscript Title/i) as HTMLInputElement;
    expect(titleInput.value).toBe('Extracted Title');
  });
});
