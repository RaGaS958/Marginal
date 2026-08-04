import { useState, type FormEvent } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Mail, Lock, User, ArrowRight } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useGoogleLogin } from '@react-oauth/google';

export function SignUp() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showGooglePrompt, setShowGooglePrompt] = useState(false);
  const [googleUsername, setGoogleUsername] = useState('');
  const [googleEmail, setGoogleEmail] = useState('');
  const navigate = useNavigate();

  const loginWithGoogle = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const userInfo = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        }).then(res => res.json());

        setGoogleEmail(userInfo.email);
        setShowGooglePrompt(true);
      } catch (err) {
        console.error("Failed to fetch Google user info", err);
      }
    },
    onError: (errorResponse) => console.log(errorResponse),
  });

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    
    // --- BACKEND INTEGRATION POINT: REGISTRATION ---
    // Replace the dummy logic below with a real API call to your backend.
    // Example using fetch:
    /*
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      
      if (!response.ok) {
        throw new Error('Registration failed');
      }
      
      const data = await response.json();
      // Save token (e.g., localStorage.setItem('token', data.token))
      // Update global auth state (Zustand/Context)
      navigate('/analyze');
    } catch (error) {
      console.error(error);
      // Handle error (show toast/message to user)
    }
    */
    
    // Dummy sign up logic (Remove when backend is ready)
    useAuthStore.getState().login({ name: name || email.split('@')[0], email });
    navigate('/analyze');
  };

  const handleGoogleSubmit = (e: FormEvent) => {
    e.preventDefault();
    useAuthStore.getState().login({ name: googleUsername, email: googleEmail || 'google.user@example.com' });
    navigate('/analyze');
  };

  if (showGooglePrompt) {
    return (
      <main className="flex-grow flex items-center justify-center p-4 md:p-8 relative overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[100px] pointer-events-none"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[100px] pointer-events-none"></div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-md bg-surface-container-lowest border border-outline-variant rounded-3xl p-8 shadow-md relative z-10"
        >
          <div className="text-center mb-8">
            <h1 className="font-display-lg-mobile text-on-surface mb-2 tracking-tight">Almost there!</h1>
            <p className="text-on-surface-variant font-body-md">Choose a username to complete sign up.</p>
          </div>
          <form onSubmit={handleGoogleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-label-mono text-on-surface-variant uppercase tracking-wider mb-2">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-on-surface-variant/50">
                  <User size={18} />
                </div>
                <input
                  type="text"
                  required
                  className="w-full pl-11 pr-4 py-3 bg-surface-container-low border border-outline-variant rounded-xl focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface placeholder:text-on-surface-variant/40"
                  placeholder="researcher123"
                  value={googleUsername}
                  onChange={(e) => setGoogleUsername(e.target.value)}
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full bg-surface-container-low border border-outline-variant text-on-surface py-3.5 rounded-xl font-medium text-lg hover:bg-surface-container transition-all shadow-sm flex items-center justify-center gap-2 group mt-2"
            >
              Finish Sign Up
              <ArrowRight size={18} className="text-primary group-hover:translate-x-1 transition-transform" />
            </button>
          </form>
        </motion.div>
      </main>
    );
  }

  return (
    <main className="flex-grow flex items-center justify-center p-4 md:p-8 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[100px] pointer-events-none"></div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md bg-surface-container-lowest border border-outline-variant rounded-3xl p-8 shadow-md relative z-10"
      >
        <div className="text-center mb-8">
          <h1 className="font-display-lg-mobile text-on-surface mb-2 tracking-tight">Create Account</h1>
          <p className="text-on-surface-variant font-body-md">Join Marginal to start analyzing.</p>
        </div>

        <form onSubmit={handleSignUp} className="space-y-5">
          <div>
            <label className="block text-sm font-label-mono text-on-surface-variant uppercase tracking-wider mb-2">
              Full Name
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-on-surface-variant/50">
                <User size={18} />
              </div>
              <input
                type="text"
                required
                className="w-full pl-11 pr-4 py-3 bg-surface-container-low border border-outline-variant rounded-xl focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface placeholder:text-on-surface-variant/40"
                placeholder="Dr. Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-label-mono text-on-surface-variant uppercase tracking-wider mb-2">
              Email Address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-on-surface-variant/50">
                <Mail size={18} />
              </div>
              <input
                type="email"
                required
                className="w-full pl-11 pr-4 py-3 bg-surface-container-low border border-outline-variant rounded-xl focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface placeholder:text-on-surface-variant/40"
                placeholder="researcher@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-label-mono text-on-surface-variant uppercase tracking-wider mb-2">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-on-surface-variant/50">
                <Lock size={18} />
              </div>
              <input
                type="password"
                required
                className="w-full pl-11 pr-4 py-3 bg-surface-container-low border border-outline-variant rounded-xl focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface placeholder:text-on-surface-variant/40"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

            <button
              type="submit"
              className="w-full bg-surface-container-low border border-outline-variant text-on-surface py-3.5 rounded-xl font-medium text-lg hover:bg-surface-container transition-all shadow-sm flex items-center justify-center gap-2 group mt-2"
            >
              Create Account
              <ArrowRight size={18} className="text-primary group-hover:translate-x-1 transition-transform" />
            </button>
          </form>

          <div className="relative flex items-center py-6">
            <div className="flex-grow border-t border-outline-variant"></div>
            <span className="flex-shrink-0 mx-4 text-on-surface-variant text-xs font-label-mono tracking-widest uppercase">OR</span>
            <div className="flex-grow border-t border-outline-variant"></div>
          </div>

          <button 
            type="button" 
            onClick={() => loginWithGoogle()} 
            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl border border-outline-variant text-on-surface bg-surface-container-lowest hover:bg-surface-container-low transition-colors font-medium text-[15px] shadow-sm"
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>


        <div className="mt-8 text-center text-sm font-body-md text-on-surface-variant">
          Already have an account?{' '}
          <NavLink to="/login" className="text-primary font-medium hover:underline">
            Sign In
          </NavLink>
        </div>
      </motion.div>
    </main>
  );
}
