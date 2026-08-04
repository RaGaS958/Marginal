import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import StackingCards from '@/components/StackingCards';
import { motion } from 'motion/react';

const methodologySteps = [
  {
    title: '1. Ingestion & Parsing',
    description: 'When a manuscript is submitted, our parsing engine structures the document, identifying core arguments, methodology, and key findings.',
    link: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?q=80&w=2070&auto=format&fit=crop',
    color: '#F6F4EE',
  },
  {
    title: '2. Retrieval',
    description: 'We query extensive academic databases (including Semantic Scholar and ArXiv) to find structurally and semantically similar literature. This utilizes vector embeddings to find conceptual overlap beyond simple keyword matching.',
    link: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2082&auto=format&fit=crop',
    color: '#F0EBE1',
  },
  {
    title: '3. Scoring',
    description: 'The system generates a Similarity Constellation. The novelty score is a weighted calculation: Abstract & Core Claims (30%), Methodology (30%), Proposed Workflow (25%), Keywords & Context (15%).',
    link: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=2070&auto=format&fit=crop',
    color: '#EAE4D7',
  },
  {
    title: '4. Reviewer Prose',
    description: 'Finally, the system generates a human-readable review, highlighting strengths and specific areas for optimization or differentiation.',
    link: 'https://images.unsplash.com/photo-1456324504439-367cee3b3c32?q=80&w=2070&auto=format&fit=crop',
    color: '#E3DCCB',
  },
];

export function About() {
  const navigate = useNavigate();

  const sectionVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
  };

  return (
    <main className="flex-grow w-full max-w-4xl mx-auto px-margin-mobile md:px-margin-desktop py-8 md:py-16">
      <motion.button 
        onClick={() => navigate(-1)} 
        className="hover:text-primary flex items-center gap-1 font-label-mono text-label-mono text-on-surface-variant mb-12 transition-colors"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
      >
        <ArrowLeft size={16} /> Back
      </motion.button>
      
      <motion.h1 
        className="font-display-lg-mobile md:font-display-lg text-on-surface mb-12 tracking-tight"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        About Marginal
      </motion.h1>
      
      <div className="space-y-24 text-body-md text-on-surface leading-relaxed">
        <motion.section 
          variants={sectionVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-10%" }}
        >
          <p className="text-xl md:text-2xl font-light text-on-surface-variant max-w-3xl leading-snug">
            Marginal is an advanced novelty assessment engine built to assist researchers, editors, and institutions in verifying the structural and semantic originality of academic manuscripts before formal submission.
          </p>
        </motion.section>

        <motion.section
          variants={sectionVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-10%" }}
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
            <div className="md:col-span-4">
              <h2 className="font-headline-md text-on-surface border-b border-outline-variant pb-3 inline-block">Our Mission</h2>
            </div>
            <div className="md:col-span-8">
              <p className="text-lg text-on-surface-variant">
                The peer-review process is currently bottlenecked by the sheer volume of submissions and the difficulty of identifying true novelty. Our mission is to provide an objective, data-driven pre-check that empowers authors to refine their contributions and helps editors quickly identify high-impact research. We believe that by automating the novelty assessment, we can accelerate the dissemination of critical scientific discoveries.
              </p>
            </div>
          </div>
        </motion.section>

        <motion.section 
          className="mb-24"
          variants={sectionVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-10%" }}
        >
          <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-outline-variant pb-4 mb-8">
            <h2 className="font-headline-md text-on-surface mb-2 md:mb-0">Methodology</h2>
            <p className="text-sm font-label-mono text-on-surface-variant uppercase tracking-widest">
              Four-stage verification
            </p>
          </div>
          <p className="mb-12 text-lg text-on-surface-variant max-w-2xl">
            Marginal uses a deterministic, four-stage verification process designed for scale and precision, extracting insight from complex academic structures.
          </p>
          <div className="w-full relative">
            <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-outline-variant to-transparent hidden md:block -ml-8"></div>
            <StackingCards projects={methodologySteps} />
          </div>
        </motion.section>

        <motion.section
          variants={sectionVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-10%" }}
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
            <div className="md:col-span-4">
              <h2 className="font-headline-md text-on-surface border-b border-outline-variant pb-3 inline-block">Privacy & Security</h2>
            </div>
            <div className="md:col-span-8">
              <p className="mb-6 text-lg text-on-surface-variant">
                We understand the extreme sensitivity of unpublished academic work. Marginal operates on a strict ephemeral analysis protocol.
              </p>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-surface-container-high flex-shrink-0 flex items-center justify-center font-label-mono text-xs">01</div>
                  <div>
                    <h4 className="font-medium text-on-surface mb-1">Zero Training Data</h4>
                    <p className="text-on-surface-variant text-sm">Your submissions are never used to train or fine-tune generalized language models.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-surface-container-high flex-shrink-0 flex items-center justify-center font-label-mono text-xs">02</div>
                  <div>
                    <h4 className="font-medium text-on-surface mb-1">Ephemeral Processing</h4>
                    <p className="text-on-surface-variant text-sm">Once the analysis is complete and delivered to your dashboard, the raw text is discarded from our processing nodes.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-surface-container-high flex-shrink-0 flex items-center justify-center font-label-mono text-xs">03</div>
                  <div>
                    <h4 className="font-medium text-on-surface mb-1">Auto-Deletion</h4>
                    <p className="text-on-surface-variant text-sm">All metadata and analysis results are irrevocably purged from our servers 30 days after submission, or immediately upon user request.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        <motion.section 
          className="bg-surface-container-low p-8 md:p-12 rounded-2xl border border-outline-variant text-center relative overflow-hidden"
          variants={sectionVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-10%" }}
        >
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/5 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-primary/5 rounded-full blur-3xl"></div>
          
          <div className="relative z-10">
            <h2 className="font-headline-md text-on-surface mb-4">Need Support or Have Questions?</h2>
            <p className="text-on-surface-variant mb-8 max-w-lg mx-auto text-lg">
              Our team is available to assist institutions and individual researchers with custom integrations and support inquiries.
            </p>
            <a href="mailto:support@marginal.com" className="inline-block bg-surface-container-highest border border-outline text-on-surface px-8 py-3 rounded-xl font-label-mono font-medium hover:bg-white transition-colors shadow-sm">
              Contact Support
            </a>
          </div>
        </motion.section>
      </div>
    </main>
  );
}

