import { useState } from 'react';
import { motion } from 'motion/react';
import { Bot, Eye, EyeOff } from 'lucide-react';
import { apiPost, API_BASE } from '../lib/api';

export default function Auth({ onLogin }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please fill in all required fields.');
      return;
    }

    if (isSignUp) {
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }

      try {
        const response = await apiPost('/api/auth/signup', { email, password, name });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail || 'Registration failed.');
        }
        await performSignIn();
      } catch (err) {
        setError(err.message);
      }
    } else {
      await performSignIn();
    }
  };

  const performSignIn = async () => {
    try {
      const response = await apiPost('/api/auth/signin', { email, password });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Sign In failed.');
      }

      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGithubLogin = () => {
    window.location.href = `${API_BASE}/api/auth/github/login`;
  };

  const handleGitlabLogin = () => {
    window.location.href = `${API_BASE}/api/auth/gitlab/login`;
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[image:var(--bg-gradient)] p-6">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="flex w-full max-w-[420px] flex-col gap-7 rounded-2xl border border-border-glass bg-bg-surface p-9 shadow-card backdrop-blur-2xl"
      >
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-[10px] bg-gradient-to-br from-primary to-accent text-white shadow-[0_0_20px_var(--primary-glow)]">
            <Bot size={24} />
          </div>
          <h2 className="font-heading text-xl font-extrabold tracking-tight text-text-primary">CodePilot</h2>
          <p className="mt-1 text-xs text-text-secondary">Developer Workspace Authentication</p>
        </div>

        <div className="flex rounded-lg border border-border-glass bg-bg-input p-1">
          <button
            type="button"
            onClick={() => { setIsSignUp(false); setError(''); }}
            className={`flex-1 rounded-md py-2 text-xs font-semibold transition-colors ${
              !isSignUp ? 'bg-bg-surface text-text-primary shadow-sm' : 'text-text-secondary'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setIsSignUp(true); setError(''); }}
            className={`flex-1 rounded-md py-2 text-xs font-semibold transition-colors ${
              isSignUp ? 'bg-bg-surface text-text-primary shadow-sm' : 'text-text-secondary'
            }`}
          >
            Sign Up
          </button>
        </div>

        {error && (
          <div className="rounded-md border border-red-500/20 bg-red-500/[0.08] px-3 py-2.5 text-[0.78rem] text-danger">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {isSignUp && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-secondary">Your Name</label>
              <input
                type="text"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-lg border border-border-glass bg-bg-input px-4 py-2.5 text-[0.82rem] text-text-primary outline-none transition-shadow focus:border-primary focus:shadow-[0_0_8px_var(--primary-glow)]"
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-text-secondary">Email Address</label>
            <input
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="rounded-lg border border-border-glass bg-bg-input px-4 py-2.5 text-[0.82rem] text-text-primary outline-none transition-shadow focus:border-primary focus:shadow-[0_0_8px_var(--primary-glow)]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-text-secondary">Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="rounded-lg border border-border-glass bg-bg-input px-4 py-2.5 text-[0.82rem] text-text-primary outline-none transition-shadow focus:border-primary focus:shadow-[0_0_8px_var(--primary-glow)]"
            />
          </div>

          {isSignUp && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-secondary">Confirm Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="rounded-lg border border-border-glass bg-bg-input px-4 py-2.5 text-[0.82rem] text-text-primary outline-none transition-shadow focus:border-primary focus:shadow-[0_0_8px_var(--primary-glow)]"
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="-mt-1 mb-1 flex items-center gap-1.5 self-start text-xs text-text-secondary"
          >
            {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
            Show Password characters
          </button>

          <button
            type="submit"
            className="mt-1 w-full rounded-lg bg-gradient-to-br from-primary to-primary-hover py-2.5 font-semibold text-white shadow-[0_4px_12px_var(--primary-glow)] transition-transform hover:-translate-y-0.5"
          >
            {isSignUp ? 'Create Workspace Account' : 'Sign In to Workspace'}
          </button>
        </form>

        <div className="-my-1 text-center text-xs text-text-muted">— OR —</div>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleGithubLogin}
            className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-border-glass bg-bg-surface-hover py-2.5 text-sm font-semibold text-text-primary transition-transform hover:-translate-y-0.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            Continue with GitHub
          </button>

          <button
            type="button"
            onClick={handleGitlabLogin}
            className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-border-glass bg-bg-surface-hover py-2.5 text-sm font-semibold text-text-primary transition-transform hover:-translate-y-0.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#FC6D26">
              <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z" />
            </svg>
            Continue with GitLab
          </button>
        </div>
      </motion.div>
    </div>
  );
}
