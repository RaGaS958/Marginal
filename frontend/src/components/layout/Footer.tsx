import { NavLink } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="bg-surface-container-lowest border-t border-outline-variant mt-auto w-full pt-16 pb-8 px-8 md:px-16 transition-all duration-200">
      <div className="max-w-[1280px] mx-auto flex flex-col gap-12">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 md:gap-8">
          <div className="md:col-span-5 flex flex-col gap-6">
            <span className="font-display-lg text-4xl text-on-surface">Marginal</span>
            <p className="font-body-md text-on-surface-variant max-w-sm">
              The academic standard for manuscript novelty verification. Secure, precise, and built for researchers.
            </p>
          </div>
          <div className="md:col-span-7 grid grid-cols-2 md:grid-cols-3 gap-8">
            <div className="flex flex-col gap-4">
              <span className="font-label-mono text-[10px] md:text-xs uppercase tracking-[0.2em] text-on-surface-variant mb-2">Platform</span>
              <NavLink to="/analyze" className="text-on-surface hover:text-primary-container transition-colors">Analyze Manuscript</NavLink>
              <NavLink to="/about" className="text-on-surface hover:text-primary-container transition-colors">Methodology</NavLink>
              <NavLink to="/about" className="text-on-surface hover:text-primary-container transition-colors">Documentation</NavLink>
            </div>
            <div className="flex flex-col gap-4">
              <span className="font-label-mono text-[10px] md:text-xs uppercase tracking-[0.2em] text-on-surface-variant mb-2">Company</span>
              <a href="#" className="text-on-surface hover:text-primary-container transition-colors">About Us</a>
              <a href="#" className="text-on-surface hover:text-primary-container transition-colors">Privacy Policy</a>
              <a href="#" className="text-on-surface hover:text-primary-container transition-colors">Terms of Service</a>
            </div>
            <div className="flex flex-col gap-4">
              <span className="font-label-mono text-[10px] md:text-xs uppercase tracking-[0.2em] text-on-surface-variant mb-2">Connect</span>
              <a href="#" className="text-on-surface hover:text-primary-container transition-colors">Twitter</a>
              <a href="#" className="text-on-surface hover:text-primary-container transition-colors">LinkedIn</a>
              <a href="#" className="text-on-surface hover:text-primary-container transition-colors">Contact</a>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 pt-8 border-t border-outline-variant">
          <div className="flex items-center gap-2 text-on-surface-variant">
            <span className="font-label-mono text-[10px] md:text-xs uppercase tracking-[0.1em]">© 2026 Marginal Academic.</span>
          </div>
          <span className="font-meta-data text-xs text-on-surface-variant text-center md:text-right">
            System Status: All Nodes Operational.
          </span>
        </div>
      </div>
    </footer>
  );
}
