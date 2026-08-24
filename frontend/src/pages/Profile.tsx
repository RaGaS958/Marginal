import { useState, FormEvent } from 'react';
import { motion } from 'motion/react';
import { User, Mail, Save, Bell, Moon } from 'lucide-react';
import { useAuthStore } from '@/store/auth';

export function Profile() {
  const { user, updateUser } = useAuthStore();
  
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');

  const [isSaved, setIsSaved] = useState(false);

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    updateUser({ name, email });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  if (!user) return null;

  return (
    <main className="flex-grow flex flex-col p-4 md:p-8 relative overflow-hidden max-w-3xl mx-auto w-full">
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[100px] pointer-events-none"></div>
      
      <div className="mb-8">
        <h1 className="font-display-lg-mobile text-on-surface mb-2 tracking-tight">Profile Settings</h1>
        <p className="text-on-surface-variant font-body-md">Manage your account configuration and preferences.</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-surface-container-lowest border border-outline-variant rounded-3xl p-6 md:p-8 shadow-sm space-y-8 relative z-10"
      >
        <section>
          <h2 className="text-lg font-bold text-on-surface mb-4">Account Information</h2>
          <form onSubmit={handleSave} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-surface-container-low border border-outline-variant rounded-xl focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface"
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
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-surface-container-low border border-outline-variant rounded-xl focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="bg-primary text-on-primary px-6 py-2.5 rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors flex items-center gap-2"
              >
                <Save size={16} />
                {isSaved ? 'Saved!' : 'Save Changes'}
              </button>
            </div>
          </form>
        </section>

        <div className="border-t border-outline-variant"></div>

        <section>
          <h2 className="text-lg font-bold text-on-surface mb-4">Preferences</h2>
          <div className="space-y-4">
            

            <div className="flex items-center justify-between p-4 bg-surface-container-low rounded-xl border border-outline-variant/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant">
                  <Moon size={20} />
                </div>
                <div>
                  <h3 className="font-medium text-on-surface text-sm">Dark Mode</h3>
                  <p className="text-xs text-on-surface-variant">Toggle application theme (system default).</p>
                </div>
              </div>
              <button 
                className={`w-12 h-6 rounded-full transition-colors relative bg-primary opacity-50 cursor-not-allowed`}
              >
                <div className={`w-4 h-4 rounded-full bg-white absolute top-1 left-7`}></div>
              </button>
            </div>
            
          </div>
        </section>
      </motion.div>
    </main>
  );
}
