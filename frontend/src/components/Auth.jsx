import React, { useState } from 'react';

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
        const response = await fetch('http://localhost:8000/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name })
        });
        
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail || 'Registration failed.');
        }
        
        // Automatically sign in after signup
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
      const response = await fetch('http://localhost:8000/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Sign In failed.');
      }
      
      localStorage.setItem('auth_session', JSON.stringify(data.user));
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGithubLogin = () => {
    // Simulate GitHub OAuth connection
    const userData = { email: 'git_developer@github.com', name: 'GitHub Developer', provider: 'github' };
    localStorage.setItem('auth_session', JSON.stringify(userData));
    onLogin(userData);
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      width: '100vw',
      background: 'var(--bg-gradient)',
      fontFamily: 'var(--font-sans)',
      color: 'var(--text-primary)',
      padding: '1.5rem',
      boxSizing: 'border-box'
    }}>
      {/* 3D Glassmorphic Auth Box */}
      <div className="card-3d" style={{
        width: '100%',
        maxWidth: '420px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-glass)',
        borderRadius: '16px',
        padding: '2.5rem 2.25rem',
        boxShadow: 'var(--shadow-card)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.75rem'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            background: 'linear-gradient(135deg, var(--primary), var(--accent))',
            color: '#fff',
            width: '44px',
            height: '44px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 0.75rem auto',
            boxShadow: '0 0 20px var(--primary-glow)'
          }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>
          </div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.5px' }}>
            CodePilot
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Developer Workspace Authentication
          </p>
        </div>

        {/* Tab Selection */}
        <div style={{
          display: 'flex',
          background: 'var(--bg-input)',
          padding: '0.25rem',
          borderRadius: '8px',
          border: '1px solid var(--border-glass)'
        }}>
          <button 
            type="button"
            onClick={() => { setIsSignUp(false); setError(''); }}
            style={{
              flex: 1,
              padding: '0.45rem',
              background: !isSignUp ? 'var(--bg-surface)' : 'transparent',
              boxShadow: !isSignUp ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
              border: 'none',
              color: !isSignUp ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'var(--transition-smooth)'
            }}
          >
            Sign In
          </button>
          <button 
            type="button"
            onClick={() => { setIsSignUp(true); setError(''); }}
            style={{
              flex: 1,
              padding: '0.45rem',
              background: isSignUp ? 'var(--bg-surface)' : 'transparent',
              boxShadow: isSignUp ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
              border: 'none',
              color: isSignUp ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'var(--transition-smooth)'
            }}
          >
            Sign Up
          </button>
        </div>

        {error && (
          <div style={{
            color: 'var(--danger)',
            fontSize: '0.78rem',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            padding: '0.6rem 0.75rem',
            borderRadius: '6px'
          }}>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {isSignUp && (
            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Your Name</label>
              <input 
                type="text"
                placeholder="Name"
                value={name}
                onChange={e => setName(e.target.value)}
                className="form-input"
                style={{ fontSize: '0.82rem' }}
              />
            </div>
          )}

          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Email Address</label>
            <input 
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="form-input"
              style={{ fontSize: '0.82rem' }}
              required
            />
          </div>

          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Password</label>
            <input 
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="form-input"
              style={{ fontSize: '0.82rem' }}
              required
            />
          </div>

          {isSignUp && (
            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Confirm Password</label>
              <input 
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="form-input"
                style={{ fontSize: '0.82rem' }}
                required
              />
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '-0.25rem', marginBottom: '0.25rem' }}>
            <input 
              type="checkbox" 
              id="show-password" 
              checked={showPassword} 
              onChange={() => setShowPassword(!showPassword)} 
              style={{ cursor: 'pointer' }}
            />
            <label htmlFor="show-password" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
              Show Password characters
            </label>
          </div>

          <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '0.5rem', padding: '0.65rem' }}>
            {isSignUp ? 'Create Workspace Account' : 'Sign In to Workspace'}
          </button>
        </form>

        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', margin: '-0.25rem 0' }}>— OR —</div>

        {/* Third Party Auth */}
        <button 
          type="button"
          onClick={handleGithubLogin}
          style={{
            width: '100%',
            background: 'var(--bg-surface-hover)',
            border: '1px solid var(--border-glass)',
            color: 'var(--text-primary)',
            borderRadius: '8px',
            padding: '0.65rem',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.6rem',
            transition: 'var(--transition-smooth)'
          }}
          className="repo-item"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
          Continue with GitHub
        </button>
      </div>
    </div>
  );
}
