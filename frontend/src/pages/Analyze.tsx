import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Shield, CheckCircle2, UploadCloud, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useHistoryStore } from '@/store/history';
import { FeatureSteps } from '@/components/FeatureSteps';
import { extractFromFile } from '@/lib/api';

const schema = z.object({
  // Must match backend/analyzer/main.py's AnalyzeRequest._title_length
  // validator exactly (len(v.strip()) > 3) -- these two used to disagree
  // (this only required 1 char), so a 1-3 character title would pass the
  // form, navigate to the Analysis page, and only then fail with a raw
  // 422 from the API. Catching it here means the person sees the problem
  // on the form itself, before submitting.
  title: z.string().trim().min(4, 'Title must be at least 4 characters.'),
  abstract: z.string().min(40, 'Minimum 40 characters required for robust analysis.').max(4000, 'Maximum 4000 characters allowed.'),
  methodology: z.string().optional(),
  conclusion: z.string().max(4000, 'Maximum 4000 characters allowed.').optional(),
});

type FormData = z.infer<typeof schema>;

/**
 * The Analyze page provides the main submission form for the user.
 * Users can either manually enter their manuscript details or upload a PDF/DOCX
 * to automatically extract and pre-fill the form fields.
 */
export function Analyze() {
  const navigate = useNavigate();
  const addRequest = useHistoryStore(state => state.addRequest);
  const [isExtracting, setIsExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { register, handleSubmit, watch, setValue, formState: { errors, isValid } } = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: 'onChange'
  });

  const abstractValue = watch('abstract', '');
  const conclusionValue = watch('conclusion', '');

  /**
   * Handles the file selection event for auto-extraction.
   * Uploads the file to the backend, parses the response, and populates the react-hook-form.
   */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsExtracting(true);
    try {
      const data = await extractFromFile(file);
      setValue('title', data.title, { shouldValidate: true, shouldDirty: true });
      setValue('abstract', data.abstract, { shouldValidate: true, shouldDirty: true });
      setValue('methodology', data.methodology, { shouldValidate: true, shouldDirty: true });
      setValue('conclusion', data.conclusion, { shouldValidate: true, shouldDirty: true });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Extraction failed');
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onSubmit = async (data: FormData) => {
    const id = crypto.randomUUID();

    // The actual backend call happens on the Analysis page, not here --
    // this keeps the SSE connection alive across the route transition
    // instead of trying to hold it open during navigate(). This page's
    // job is just to stash the submission so Analysis.tsx (mounting with
    // ?fresh=1) has what it needs to start the real run.
    addRequest({
      id,
      title: data.title,
      abstract: data.abstract,
      methodology: data.methodology,
      conclusion: data.conclusion,
      domain: 'General',
      status: 'running',
      date: new Date().toISOString()
    });

    navigate(`/analysis/${id}?fresh=1`);
  };

  return (
    <main className="flex-grow w-full max-w-max-width mx-auto px-margin-mobile md:px-margin-desktop py-8 md:py-12 flex flex-col lg:flex-row gap-gutter">
      {/* Left Column: Form */}
      <div className="flex-grow flex flex-col gap-unit">
        <div className="mb-6 flex flex-col gap-2">
          <nav aria-label="Breadcrumb" className="flex items-center text-on-surface-variant font-label-mono text-meta-data space-x-2">
            <span className="hover:text-primary transition-colors cursor-pointer" onClick={() => navigate('/')}>Home</span>
            <span>/</span>
            <span className="text-on-surface font-medium">Analyze</span>
          </nav>
          <h1 className="font-display-lg-mobile md:font-display-lg text-on-surface">Submission Form</h1>
          <p className="font-body-md text-on-surface-variant max-w-2xl mt-2">
            Provide the details of your manuscript for novelty and structural review. The more detailed the abstract and methodology, the more accurate the analysis.
          </p>
        </div>

        <div className="paper-card flex flex-col gap-8 relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
          
          <div className="relative z-10 flex flex-col gap-4 bg-surface-container-low/30 backdrop-blur-sm border border-outline-variant/50 rounded-lg p-6 border-dashed">
            <div className="flex flex-col items-center justify-center gap-2 text-center">
              <div className="w-12 h-12 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container mb-2">
                {isExtracting ? <Loader2 className="animate-spin" size={24} /> : <UploadCloud size={24} />}
              </div>
              <h3 className="font-medium text-on-surface">Auto-fill from Paper</h3>
              <p className="text-xs text-on-surface-variant max-w-sm">
                Upload a PDF or DOCX file. We will use AI to extract the title, abstract, methodology, and conclusion for you to verify.
              </p>
              
              <input 
                type="file" 
                accept=".pdf,.docx" 
                className="hidden" 
                ref={fileInputRef}
                onChange={handleFileUpload}
                disabled={isExtracting}
              />
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isExtracting}
                className="mt-2 btn-secondary text-xs px-4 py-2"
              >
                {isExtracting ? 'Extracting...' : 'Select File'}
              </button>
            </div>
          </div>
          
          <div className="relative z-10 flex items-center gap-4">
            <div className="flex-1 h-px bg-outline-variant/50"></div>
            <span className="font-label-mono text-label-mono text-on-surface-variant uppercase tracking-widest text-[10px]">Or enter manually</span>
            <div className="flex-1 h-px bg-outline-variant/50"></div>
          </div>
          
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6 relative z-10">
            {/* Title */}
            <div className="flex flex-col gap-2 group">
              <label htmlFor="title" className="field-label flex items-center justify-between">
                <span>Manuscript Title</span>
                <span className={`text-[10px] transition-opacity ${errors.title ? 'text-error' : 'text-error opacity-0 group-focus-within:opacity-100'}`}>
                  * Required
                </span>
              </label>
              <input 
                {...register('title')}
                id="title"
                type="text" 
                placeholder="Enter the full title of your research..."
                className="w-full bg-surface-container-low/30 backdrop-blur-sm border border-outline-variant/50 rounded-lg px-4 py-3 font-body-lg text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all outline-none shadow-inner"
              />
            </div>

            {/* Abstract */}
            <div className="flex flex-col gap-2 group mt-4">
              <div className="flex justify-between items-end mb-1">
                <label htmlFor="abstract" className="field-label">
                  Abstract <span className="text-error">*</span>
                </label>
                <div className={`font-meta-data text-meta-data flex items-center gap-1 ${abstractValue.length > 4000 ? 'text-error' : abstractValue.length >= 40 ? 'text-primary-container' : 'text-on-surface-variant'}`}>
                  <span className="font-medium">{abstractValue.length}</span> / 4,000
                </div>
              </div>
              <div className="relative">
                <textarea 
                  {...register('abstract')}
                  id="abstract"
                  rows={8}
                  placeholder="Paste your abstract here. Minimum 40 characters required for robust analysis. Include core arguments, context, and findings..."
                  className="w-full bg-surface-container-low/30 backdrop-blur-sm border border-outline-variant/50 rounded-lg p-4 font-body-md text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all resize-y min-h-[200px] outline-none shadow-inner"
                />
                <div className="absolute inset-0 pointer-events-none rounded-lg border border-outline-variant/10 opacity-20 bg-[linear-gradient(transparent_23px,var(--color-outline-variant)_24px)] bg-[length:100%_24px] z-[-1]"></div>
              </div>
              <p className="font-meta-data text-meta-data text-on-surface-variant mt-1">This forms the primary basis for the novelty check against the Marginal database.</p>
            </div>

            {/* Methodology */}
            <div className="flex flex-col gap-2 group mt-4">
              <label htmlFor="methodology" className="field-label flex items-center gap-2">
                Methodology & Workflow <span className="text-on-surface-variant/60 lowercase tracking-normal">(Optional)</span>
              </label>
              <textarea 
                {...register('methodology')}
                id="methodology"
                rows={4}
                placeholder="Briefly describe your approach, tools, or analytical framework to refine the peer comparison..."
                className="w-full bg-surface-container-low/30 backdrop-blur-sm border border-outline-variant/50 rounded-lg p-4 font-body-md text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all resize-y outline-none shadow-inner"
              />
            </div>

            {/* Conclusion */}
            <div className="flex flex-col gap-2 group mt-4">
              <div className="flex justify-between items-end mb-1">
                <label htmlFor="conclusion" className="field-label flex items-center gap-2">
                  Conclusion & Key Findings <span className="text-on-surface-variant/60 lowercase tracking-normal">(Optional)</span>
                </label>
                <div className={`font-meta-data text-meta-data flex items-center gap-1 ${conclusionValue.length > 4000 ? 'text-error' : 'text-on-surface-variant'}`}>
                  <span className="font-medium">{conclusionValue.length}</span> / 4,000
                </div>
              </div>
              <textarea 
                {...register('conclusion')}
                id="conclusion"
                rows={4}
                placeholder="Summarize key findings, contributions, and conclusions to enable deeper novelty comparison..."
                className="w-full bg-surface-container-low/30 backdrop-blur-sm border border-outline-variant/50 rounded-lg p-4 font-body-md text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all resize-y outline-none shadow-inner"
              />
            </div>

            {/* Action */}
            <div className="pt-6 mt-4 border-t border-outline-variant/50 flex justify-end">
              <button 
                type="submit"
                disabled={!isValid}
                className="btn-primary disabled:bg-outline-variant disabled:text-on-surface-variant/70 disabled:opacity-70 disabled:cursor-not-allowed disabled:shadow-none font-label-mono text-label-mono tracking-wider uppercase px-8"
              >
                <Play size={18} />
                RUN THE REVIEW
              </button>
            </div>
          </form>
        </div>

        {/* How to interpret results */}
        <div className="mt-8 border-t border-outline-variant/30 pt-8 -mx-4 md:mx-0">
          <FeatureSteps 
            features={[
              {
                step: 'Score',
                title: 'Novelty Score (0-100)',
                content: 'A composite metric indicating structural and semantic uniqueness. Scores above 80 suggest high novelty. Scores below 50 may require substantial differentiation before submission.',
                image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=600'
              },
              {
                step: 'Visual',
                title: 'Similarity Constellation',
                content: 'Visualizes the conceptual distance between your manuscript and existing literature. Closer nodes indicate higher semantic overlap.',
                image: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=600'
              },
              {
                step: 'Feedback',
                title: 'Reviewer Prose',
                content: 'Automated qualitative feedback focusing on structural strengths, potential methodological gaps, and specific areas for optimization. This feedback is designed to simulate early peer-review concerns.',
                image: 'https://images.unsplash.com/photo-1456324504439-367cee3b3c32?auto=format&fit=crop&q=80&w=600'
              }
            ]}
            title="How to Interpret Your Results"
            autoPlayInterval={4000}
            imageAspectRatio="aspect-video md:aspect-square"
            className="px-4 md:px-0"
          />
        </div>
      </div>

      {/* Right Column: Context/Side Panel */}
      <aside className="w-full lg:w-80 flex flex-col gap-6 flex-shrink-0 mt-8 lg:mt-0">
        {/* Privacy Note */}
        <div className="paper-card border-l-4 border-l-tertiary-container relative overflow-hidden">
          <div className="absolute -right-4 -top-4 text-tertiary-container opacity-5">
            <Shield size={120} />
          </div>
          <div className="flex items-center gap-2 mb-4 relative z-10">
            <Shield className="text-tertiary-container" size={24} />
            <h3 className="font-label-mono text-label-mono uppercase tracking-wider text-on-surface">Data Privacy</h3>
          </div>
          <div className="space-y-4 relative z-10 font-body-md text-sm text-on-surface-variant">
            <p>Your intellectual property remains exclusively yours. Marginal operates on a strict ephemeral analysis protocol.</p>
            <ul className="space-y-2 border-t border-outline-variant/30 pt-4 mt-2">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="text-primary-container mt-1 shrink-0" size={16} />
                <span><strong>No Training Data:</strong> Submissions are never used to train generalized language models.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="text-primary-container mt-1 shrink-0" size={16} />
                <span><strong>30-Day Auto-Delete:</strong> All manuscript data is irrevocably purged from our servers 30 days after submission.</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Guidelines */}
        <div className="glass-panel p-5">
          <h4 className="font-label-mono text-meta-data text-on-surface-variant uppercase tracking-widest mb-3 border-b border-outline-variant/30 pb-2">Submission Guidelines</h4>
          <ul className="font-body-md text-sm text-on-surface-variant space-y-3">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-outline-variant"></span>
              Minimum 40 words for accurate semantic matching.
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-outline-variant"></span>
              Remove author names to ensure blind comparative analysis.
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-outline-variant"></span>
              Include clear methodology for better classification.
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-outline-variant"></span>
              Include conclusions for comprehensive novelty assessment.
            </li>
          </ul>
        </div>
      </aside>
    </main>
  );
}
