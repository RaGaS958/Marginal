import { ArrowRight, FileText, Database, Activity, BookOpen, ShieldCheck, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import LineWaves from '../components/LineWaves';
import MagicBento from '../components/MagicBento';
import CardSwap, { Card } from '../components/CardSwap';
import AnimatedTabs from '../components/AnimatedTabs';
import LogoLoop from '../components/LogoLoop';
import DotField from '../components/DotField';

import GoldenWaveBackground from '../components/GoldenWaveBackground';

const MetricItem = ({ value, label }: { value: string, label: string }) => (
  <div className="flex flex-col items-center text-center px-8 md:px-12">
    <span className="font-display-lg text-4xl md:text-6xl text-on-surface mb-2 font-serif">{value}</span>
    <span className="font-label-mono text-on-surface-variant uppercase tracking-[0.2em] text-[10px] md:text-xs">{label}</span>
  </div>
);

const platformMetrics = [
  { node: <MetricItem value="5M+" label="INDEXED PAPERS" /> },
  { node: <MetricItem value="<2m" label="AVG. ANALYSIS TIME" /> },
  { node: <MetricItem value="99%" label="UPTIME" /> },
  { node: <MetricItem value="Zero" label="DATA RETAINED" /> },
  { node: <MetricItem value="100+" label="INSTITUTIONS" /> },
  { node: <MetricItem value="24/7" label="EXPERT SUPPORT" /> },
];

export function Home() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col flex-grow bg-background text-on-surface">
      {/* Premium Hero Section */}
      <section className="relative w-full min-h-[800px] flex items-center justify-center overflow-hidden pt-24 pb-32">
        <GoldenWaveBackground />

        {/* Main Content Container */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          
          {/* Left Column: Text & CTA */}
          <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
            {/* Trust Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8 border border-primary/20 shadow-sm animate-float-delay-3">
              <span>✨</span> AI-powered Academic Integrity
            </div>

            {/* Heading */}
            <h1 className="text-[48px] sm:text-[64px] lg:text-[76px] font-bold leading-[0.95] tracking-[-0.03em] text-on-surface mb-6 drop-shadow-sm max-w-2xl font-display-lg">
              Verify Manuscript<br />Novelty Instantly
            </h1>

            {/* Subtitle */}
            <p className="text-xl lg:text-[22px] text-on-surface-variant font-normal leading-relaxed max-w-[650px] mb-10">
              Structural and semantic originality analysis<br className="hidden md:block"/> built specifically for academic publishing.
            </p>

            {/* Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
              <button 
                onClick={() => navigate('/analyze')}
                className="btn-primary w-full sm:w-auto"
              >
                Start Free Analysis
              </button>
              <button 
                onClick={() => navigate('/about')}
                className="glass-panel text-on-surface px-8 py-4 rounded-xl font-medium text-lg hover:bg-surface-container transition-all hover:scale-[1.04] w-full sm:w-auto flex items-center justify-center gap-2 group shadow-sm"
              >
                Watch Demo 
                <span className="text-primary group-hover:translate-x-1 transition-transform">▶</span>
              </button>
            </div>
          </div>

          {/* Right Column: Floating Glass Cards Visualization */}
          <div className="relative h-[500px] w-full hidden lg:block perspective-1000">
            {/* Central Orb */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full glass-panel shadow-glow flex items-center justify-center animate-float z-20 hover:scale-105 transition-transform duration-500">
              <div className="absolute inset-0 rounded-full border border-primary/20 m-2"></div>
              <div className="absolute inset-0 rounded-full border border-primary/10 m-4"></div>
              <div className="text-5xl font-display-lg font-bold text-primary tracking-tighter drop-shadow-sm">AI</div>
            </div>

            {/* Connecting Lines (Simulated with absolute divs) */}
            <div className="absolute top-[35%] left-[30%] w-[20%] h-[1px] bg-gradient-to-r from-transparent to-gray-300 rotate-45 z-10"></div>
            <div className="absolute bottom-[35%] right-[25%] w-[25%] h-[1px] bg-gradient-to-r from-gray-300 to-transparent rotate-45 z-10"></div>
            <div className="absolute top-[30%] right-[30%] w-[15%] h-[1px] bg-gradient-to-r from-gray-300 to-transparent -rotate-12 z-10"></div>

            {/* Card 1: PDF Upload Sim */}
            <div className="absolute top-[10%] left-[50%] -translate-x-1/2 w-40 p-4 rounded-2xl glass-panel animate-float-delay-1 z-30 hover:rotate-1 hover:scale-105 transition-all duration-300">
               <div className="flex flex-col items-center justify-center text-center">
                  <div className="w-10 h-10 bg-red-100 text-red-600 rounded-lg flex items-center justify-center mb-2">
                    <FileText size={20} />
                  </div>
                  <div className="text-[10px] font-medium text-gray-500">Research Paper.pdf</div>
               </div>
            </div>

            {/* Card 2: Semantic Match */}
            <div className="absolute top-[30%] right-[0%] w-48 p-5 rounded-2xl glass-panel animate-float-delay-2 z-30 hover:-rotate-2 hover:scale-105 transition-all duration-300">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="text-primary" size={18} />
                <div className="text-xs text-on-surface-variant font-medium uppercase tracking-wider">Semantic Check</div>
              </div>
              <div className="text-4xl font-display-lg font-bold text-secondary mb-1">96%</div>
              <div className="text-xs font-medium text-secondary">High Originality</div>
            </div>

            {/* Card 3: Structural Analysis */}
            <div className="absolute bottom-[20%] left-[5%] w-56 p-5 rounded-2xl glass-panel animate-float-delay-3 z-30 hover:rotate-2 hover:scale-105 transition-all duration-300">
              <div className="text-xs text-on-surface-variant font-medium uppercase tracking-wider mb-3">Structural Analysis</div>
              <div className="flex items-center gap-3">
                 <div className="w-2.5 h-2.5 rounded-full bg-secondary animate-pulse"></div>
                 <div className="text-sm font-semibold text-secondary">Complete</div>
              </div>
            </div>

            {/* Card 4: Sources Scanned */}
            <div className="absolute bottom-[10%] right-[15%] w-44 p-4 rounded-2xl glass-panel animate-float z-30 hover:-rotate-1 hover:scale-105 transition-all duration-300">
               <div className="flex items-center gap-2 mb-2 text-on-surface-variant">
                 <Database size={16} />
                 <div className="text-[10px] font-medium uppercase tracking-wider">Sources Scanned</div>
               </div>
               <div className="text-2xl font-display-lg font-bold text-on-surface">1.2B+</div>
               <div className="text-[10px] text-on-surface-variant/70 mt-1">Academic Papers</div>
            </div>
          </div>

        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-60">
          <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold">Scroll to Explore</span>
          <div className="w-[2px] h-10 bg-gradient-to-b from-outline-variant to-transparent rounded-full overflow-hidden relative">
             <div className="w-full h-1/3 bg-primary absolute top-0 animate-[float_2s_ease-in-out_infinite]"></div>
          </div>
        </div>
      </section>

      <main className="max-w-max-width mx-auto w-full px-margin-mobile md:px-margin-desktop py-4 md:py-8 flex flex-col gap-16 md:gap-32 flex-grow">
        {/* Scope Note Glass Card */}
        <section className="w-full flex justify-center -mt-24 mb-8 z-40 relative">
          <div className="glass-panel border-l-[6px] border-l-primary p-6 md:p-8 max-w-3xl w-full flex flex-col md:flex-row gap-6 items-start md:items-center transform transition-transform hover:-translate-y-1 duration-300">
            <div className="bg-primary/10 text-primary p-4 rounded-full flex-shrink-0 shadow-inner">
              <Info size={28} />
            </div>
            <div>
              <h3 className="font-headline-md text-xl font-semibold text-on-surface mb-2 flex items-center gap-2">Scope Note</h3>
              <p className="text-[15px] text-on-surface-variant leading-relaxed">
                <strong className="text-on-surface font-semibold">This is a pre-check, not a peer review.</strong> Marginal performs pre-submission structural and semantic novelty assessment to help researchers identify unintentional overlaps and strengthen the originality of their work.
              </p>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="mt-12 md:mt-24 mb-24 max-w-6xl mx-auto w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="flex flex-col text-left pl-0 md:pl-8">
              <h2 className="font-display-lg-mobile md:font-display-lg text-display-lg-mobile md:text-display-lg text-on-surface mb-4">How It Works</h2>
              <p className="font-body-lg text-body-lg text-on-surface-variant max-w-md">
                A systematic approach to manuscript novelty verification, built on academic rigor. Our process is designed to be seamless, precise, and highly insightful.
              </p>
            </div>
            
            <div className="relative w-full h-[500px]" style={{ overflow: 'visible' }}>
              <CardSwap
                width={550}
                height={320}
                cardDistance={30}
                verticalDistance={30}
                delay={3500}
                pauseOnHover={false}
              >
                <Card>
                  <div className="flex justify-between items-start mb-4">
                    <FileText className="text-primary-container" size={32} />
                    <span className="text-5xl font-display-lg text-outline-variant opacity-30 select-none">1</span>
                  </div>
                  <h3 className="font-headline-md text-headline-md text-on-surface mb-3 text-xl">Upload Manuscript</h3>
                  <p className="font-body-md text-body-md text-on-surface-variant text-base mt-auto">
                    Submit your document in standard academic formats. Our secure parser extracts and structures the core arguments and methodology for analysis.
                  </p>
                </Card>
                <Card>
                  <div className="flex justify-between items-start mb-4">
                    <Activity className="text-primary-container" size={32} />
                    <span className="text-5xl font-display-lg text-outline-variant opacity-30 select-none">2</span>
                  </div>
                  <h3 className="font-headline-md text-headline-md text-on-surface mb-3 text-xl">Automated AI Review</h3>
                  <p className="font-body-md text-body-md text-on-surface-variant text-base mt-auto">
                    Our engine compares your work against extensive academic databases using semantic vector search to assess structural novelty and identify overlaps.
                  </p>
                </Card>
                <Card>
                  <div className="flex justify-between items-start mb-4">
                    <BookOpen className="text-primary-container" size={32} />
                    <span className="text-5xl font-display-lg text-outline-variant opacity-30 select-none">3</span>
                  </div>
                  <h3 className="font-headline-md text-headline-md text-on-surface mb-3 text-xl">Detailed Annotation Export</h3>
                  <p className="font-body-md text-body-md text-on-surface-variant text-base mt-auto">
                    Receive a comprehensive similarity constellation and reviewer prose. Export the annotated findings to optimize your manuscript for formal submission.
                  </p>
                </Card>
              </CardSwap>
            </div>
          </div>
        </section>

        {/* Features Section with MagicBento */}
        <section className="mb-16 md:mb-24 mt-24">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="font-display-lg-mobile md:font-display-lg text-display-lg-mobile md:text-display-lg text-on-surface mb-4">Why Marginal?</h2>
            <p className="font-body-md text-body-md text-on-surface-variant">Built for researchers, editors, and institutions to accelerate the peer-review process.</p>
          </div>
          <MagicBento 
            cards={[
              {
                title: 'Deep Vector Search',
                description: 'Move beyond keyword matching. Our AI-driven engine finds structural and semantic overlaps globally across millions of indexed academic papers. By utilizing state-of-the-art sentence embeddings and a proprietary indexing mechanism, Marginal evaluates the semantic meaning of your paragraphs, not just lexical similarities. This allows us to detect subtle conceptual overlaps and identify the underlying structural novelty of your manuscript with unprecedented accuracy.',
                label: 'Retrieval'
              },
              {
                title: 'Secure & Private',
                description: 'Your intellectual property remains yours with ephemeral processing and zero data retention.',
                label: 'Privacy'
              },
              {
                title: 'Actionable Insights',
                description: 'Get a clear novelty score, similarity constellations, and targeted feedback.',
                label: 'Analysis'
              },
              {
                title: 'Reviewer Prose',
                description: 'Automated qualitative feedback focusing on structural strengths and methodological gaps.',
                label: 'Feedback'
              },
              {
                title: 'Institutional Grade',
                description: 'Maintain academic integrity across your department with standard verification tools and secure data enclaves.',
                label: 'Scale'
              }
            ]}
            textAutoHide={false}
            enableStars={true}
            enableSpotlight={true}
            enableBorderGlow={true}
            enableTilt={true}
            enableMagnetism={true}
            clickEffect={true}
            spotlightRadius={400}
            particleCount={15}
            glowColor="16, 185, 129"
          />
        </section>

        {/* Who is Marginal For? */}
        <section className="mb-16 md:mb-32">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="font-display-lg-mobile md:font-display-lg text-display-lg-mobile md:text-display-lg text-on-surface mb-4">Who is Marginal For?</h2>
            <p className="font-body-md text-body-md text-on-surface-variant">Tailored tools for every participant in the academic publishing ecosystem.</p>
          </div>
          
          <AnimatedTabs
            className="max-w-4xl mx-auto"
            tabs={[
              {
                id: 'researchers',
                label: 'Researchers',
                content: (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full h-full items-center p-2">
                    <div className="flex flex-col gap-y-4">
                      <h3 className="font-headline-lg text-primary-container text-2xl mb-2">Pre-flight your manuscript</h3>
                      <p className="font-body-md text-on-surface-variant leading-relaxed text-lg">
                        Identify potential overlaps with existing literature, strengthen your claims of novelty, and receive constructive feedback on your methodology to avoid early desk rejections before submission.
                      </p>
                    </div>
                    <img referrerPolicy="no-referrer" loading="lazy" decoding="async"
                      src="https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?q=80&w=2673&auto=format&fit=crop"
                      alt="Researchers"
                      className="rounded-xl w-full h-64 object-cover shadow-sm border border-outline-variant"
                    />
                  </div>
                )
              },
              {
                id: 'editors',
                label: 'Journal Editors',
                content: (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full h-full items-center p-2">
                    <div className="flex flex-col gap-y-4">
                      <h3 className="font-headline-lg text-primary-container text-2xl mb-2">Accelerate triage</h3>
                      <p className="font-body-md text-on-surface-variant leading-relaxed text-lg">
                        Instantly flag submissions that lack sufficient novelty or exhibit high structural similarity to published work, allowing you to focus your peer-review resources on the most promising research.
                      </p>
                    </div>
                    <img referrerPolicy="no-referrer" loading="lazy" decoding="async"
                      src="https://images.unsplash.com/photo-1555066931-4365d14bab8c?q=80&w=2670&auto=format&fit=crop"
                      alt="Journal Editors"
                      className="rounded-xl w-full h-64 object-cover shadow-sm border border-outline-variant"
                    />
                  </div>
                )
              },
              {
                id: 'institutions',
                label: 'Institutions',
                content: (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full h-full items-center p-2">
                    <div className="flex flex-col gap-y-4">
                      <h3 className="font-headline-lg text-primary-container text-2xl mb-2">Maintain academic integrity</h3>
                      <p className="font-body-md text-on-surface-variant leading-relaxed text-lg">
                        Provide your graduate students and faculty with a standardized tool to verify the originality of their output before it represents your institution publicly, maintaining standards across your department.
                      </p>
                    </div>
                    <img referrerPolicy="no-referrer" loading="lazy" decoding="async"
                      src="https://images.unsplash.com/photo-1541339907198-e08756dedf3f?q=80&w=2670&auto=format&fit=crop"
                      alt="Institutions"
                      className="rounded-xl w-full h-64 object-cover shadow-sm border border-outline-variant"
                    />
                  </div>
                )
              }
            ]}
          />
        </section>

        {/* Platform Metrics */}
        <section className="mb-8 md:mb-16">
           <div className="border-y border-outline-variant py-4 md:py-6 overflow-hidden">
              <LogoLoop
                logos={platformMetrics}
                speed={40}
                direction="left"
                logoHeight={80}
                gap={20}
                hoverSpeed={10}
                fadeOut={true}
                fadeOutColor="#FCFBF9"
                ariaLabel="Platform Metrics"
              />
           </div>
        </section>

        {/* CTA Section */}
        <section className="mb-16 md:mb-24 relative rounded-3xl overflow-hidden glass-panel">
          <div className="absolute inset-0">
            <DotField
              dotRadius={1.5}
              dotSpacing={16}
              bulgeStrength={80}
              glowRadius={180}
              sparkle
              waveAmplitude={0}
              cursorRadius={150}
              cursorForce={0.1}
              bulgeOnly
              gradientFrom="#10B981"
              gradientTo="#0F766E"
              glowColor="rgba(16, 185, 129, 0.1)"
            />
          </div>
          <div className="relative z-10 flex flex-col items-center text-center p-12 md:p-20 bg-surface-container-low/40 backdrop-blur-[2px]">
            <h2 className="font-display-lg-mobile md:font-display-lg text-on-surface mb-4">Ready to Verify Your Novelty?</h2>
            <p className="font-body-lg text-on-surface-variant max-w-2xl mb-8">
              Join thousands of researchers using Marginal to ensure their submissions meet the highest standards of academic originality.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
              <button 
                onClick={() => navigate('/analyze')}
                className="btn-primary w-full sm:w-auto"
              >
                Analyze Manuscript Now
              </button>
              <button 
                onClick={() => navigate('/about')}
                className="glass-panel text-on-surface px-8 py-4 rounded-xl font-medium text-lg hover:bg-surface-container transition-all shadow-sm w-full sm:w-auto"
              >
                Read the Methodology
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
