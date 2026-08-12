import React, { useState, useEffect } from 'react';
import './App.css';
import Dashboard from './components/Dashboard';
import RepoExplorer from './components/RepoExplorer';
import AgentChat from './components/AgentChat';
import CodePreview from './components/CodePreview';
import APIList from './components/APIList';
import TestProof from './components/TestProof';
import ArchDiagram from './components/ArchDiagram';
import Auth from './components/Auth';

export default function App() {
  const [view, setView] = useState('dashboard'); // 'dashboard', 'workspace', 'settings'
  const [activeTab, setActiveTab] = useState('debugging'); // 'debugging', 'architecture', 'apis', 'tests'
  const [apiKey, setApiKey] = useState('');
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [activeFilePath, setActiveFilePath] = useState(null);
  const [highlightLineRange, setHighlightLineRange] = useState(null);
  const [backendConfigured, setBackendConfigured] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('agent_theme') || 'dark');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('auth_session')) || null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('agent_theme', next);
  };

  // Check backend server status
  const checkStatus = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/status');
      if (response.ok) {
        const data = await response.json();
        setBackendConfigured(data.api_key_configured);
      }
    } catch (e) {
      console.error("Backend status check failed:", e);
    }
  };

  useEffect(() => {
    // Load local storage api key if any
    const saved = localStorage.getItem('agent_gemini_key') || '';
    setApiKey(saved);
    if (saved) {
      // Sync with backend session
      updateBackendKey(saved);
    }
    checkStatus();
  }, []);

  const updateBackendKey = async (key) => {
    try {
      await fetch('http://localhost:8000/api/settings/apikey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: key })
      });
      checkStatus();
    } catch (e) {
      console.error("Error setting API key on backend:", e);
    }
  };

  const handleApiKeyChange = (e) => {
    const val = e.target.value;
    setApiKey(val);
    localStorage.setItem('agent_gemini_key', val);
    updateBackendKey(val);
  };

  const handleSelectRepo = (repo) => {
    setSelectedRepo(repo);
    setActiveFilePath(null);
    setHighlightLineRange(null);
    setView('workspace');
  };

  const handleCitationClick = (filePath, lineRange) => {
    setActiveFilePath(filePath);
    setHighlightLineRange(lineRange);
  };

  const getHeaderTitle = () => {
    switch (view) {
      case 'dashboard': return 'Repositories';
      case 'workspace': return selectedRepo ? `Workspace: ${selectedRepo.name}` : 'Workspace';
      case 'settings': return 'Settings';
      default: return 'DevCopilot Workspace';
    }
  };

  if (!user) {
    return <Auth onLogin={setUser} />;
  }

  return (
    <div className="app-container">
      {/* Sidebar navigation */}
      <aside className="sidebar">
        <div className="logo-section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.35rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="logo-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>
            </div>
            <span className="logo-text">DevCopilot Agent</span>
          </div>
          {user && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--success)' }}></span>
              <span>Developer: {user.name || user.email}</span>
            </div>
          )}
        </div>

        <ul className="nav-links">
          <li 
            className={`nav-item ${view === 'dashboard' ? 'active' : ''}`}
            onClick={() => setView('dashboard')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
            <span>Repositories</span>
          </li>
          <li 
            className={`nav-item ${view === 'workspace' ? 'active' : ''} ${!selectedRepo ? 'disabled-nav' : ''}`}
            onClick={() => selectedRepo && setView('workspace')}
            style={{ opacity: selectedRepo ? 1 : 0.5, cursor: selectedRepo ? 'pointer' : 'not-allowed' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span>Ask Agent</span>
          </li>
          <li 
            className={`nav-item ${view === 'settings' ? 'active' : ''}`}
            onClick={() => setView('settings')}
            style={{ marginTop: 'auto' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            <span>Settings</span>
          </li>
          <li 
            className="nav-item"
            onClick={() => {
              localStorage.removeItem('auth_session');
              setUser(null);
            }}
            style={{ cursor: 'pointer', borderTop: '1px solid var(--border-glass)', borderRadius: 0, paddingTop: '1rem', marginTop: '0.5rem' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            <span>Sign Out</span>
          </li>
        </ul>
      </aside>

      {/* Main content display */}
      <main className="main-content">
        <header className="app-header">
          <div className="header-title">
            <h1>{getHeaderTitle()}</h1>
          </div>

          <div className="header-actions">
            <button className="theme-toggle-btn" onClick={toggleTheme} style={{
              background: 'transparent',
              border: '1px solid var(--border-glass)',
              color: 'var(--text-primary)',
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}>
              {theme === 'dark' ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                  <span>Light Mode</span>
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                  <span>Dark Mode</span>
                </>
              )}
            </button>
            
            {backendConfigured ? (
              <div className="api-badge configured" title="API connection active.">
                ● Connected
              </div>
            ) : (
              <div className="api-badge missing" onClick={() => setView('settings')} title="Click to set your API Key.">
                ● Key Required
              </div>
            )}
          </div>
        </header>

        {/* View Switch */}
        {view === 'dashboard' && (
          <Dashboard 
            onSelectRepo={handleSelectRepo} 
            selectedRepoId={selectedRepo?.id}
          />
        )}

        {view === 'workspace' && selectedRepo && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: 'calc(100vh - 64px)' }}>
            {/* Workspace Subheader with Tabs */}
            <div style={{
              height: '48px',
              borderBottom: '1px solid var(--border-glass)',
              background: 'rgba(15, 23, 42, 0.4)',
              display: 'flex',
              alignItems: 'center',
              padding: '0 1.5rem',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', gap: '1.5rem', height: '100%' }}>
                {['debugging', 'architecture', 'apis', 'tests'].map(tab => (
                  <button 
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: activeTab === tab ? '#fff' : 'var(--text-secondary)',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      height: '100%',
                      padding: '0 0.25rem',
                      borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
                      transition: 'var(--transition-smooth)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}
                  >
                    {tab === 'debugging' ? 'Debugging' : tab === 'architecture' ? 'Architecture' : tab === 'apis' ? 'API Discovery' : 'Test Proof'}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                main • indexed just now
              </div>
            </div>
            
            {/* Workspace Panels based on Tab */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {activeTab === 'debugging' && (
                <>
                  <div style={{ width: activeFilePath ? '50%' : '100%', height: '100%', borderRight: activeFilePath ? '1px solid var(--border-glass)' : 'none' }}>
                    <AgentChat 
                      repoId={selectedRepo.id} 
                      onSelectCitation={handleCitationClick}
                    />
                  </div>
                  {activeFilePath && (
                    <div style={{ width: '50%', height: '100%' }}>
                      <CodePreview 
                        repoId={selectedRepo.id}
                        filePath={activeFilePath}
                        highlightLineRange={highlightLineRange}
                        onClose={() => setActiveFilePath(null)}
                      />
                    </div>
                  )}
                </>
              )}

              {activeTab === 'architecture' && (
                <>
                  <div style={{ width: activeFilePath ? '22%' : '30%', height: '100%', borderRight: '1px solid var(--border-glass)' }}>
                    <RepoExplorer 
                      repoId={selectedRepo.id}
                      activeFilePath={activeFilePath}
                      onSelectFile={(path) => {
                        setActiveFilePath(path);
                        setHighlightLineRange(null);
                      }}
                    />
                  </div>
                  <div style={{ width: activeFilePath ? '38%' : '70%', height: '100%', borderRight: activeFilePath ? '1px solid var(--border-glass)' : 'none' }}>
                    <ArchDiagram 
                      onSelectFile={(file, line) => {
                        setActiveFilePath(file);
                        setHighlightLineRange(line);
                      }}
                    />
                  </div>
                  {activeFilePath && (
                    <div style={{ width: '40%', height: '100%' }}>
                      <CodePreview 
                        repoId={selectedRepo.id}
                        filePath={activeFilePath}
                        highlightLineRange={highlightLineRange}
                        onClose={() => setActiveFilePath(null)}
                      />
                    </div>
                  )}
                </>
              )}

              {activeTab === 'apis' && (
                <>
                  <div style={{ width: activeFilePath ? '50%' : '100%', height: '100%', borderRight: activeFilePath ? '1px solid var(--border-glass)' : 'none' }}>
                    <APIList 
                      repoId={selectedRepo.id}
                      onSelectFile={(file, line) => {
                        setActiveFilePath(file);
                        setHighlightLineRange(line);
                      }}
                    />
                  </div>
                  {activeFilePath && (
                    <div style={{ width: '50%', height: '100%' }}>
                      <CodePreview 
                        repoId={selectedRepo.id}
                        filePath={activeFilePath}
                        highlightLineRange={highlightLineRange}
                        onClose={() => setActiveFilePath(null)}
                      />
                    </div>
                  )}
                </>
              )}

              {activeTab === 'tests' && (
                <div style={{ width: '100%', height: '100%' }}>
                  <TestProof repoId={selectedRepo.id} />
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'settings' && (
          <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '600px' }}>
            <div className="dashboard-card">
              <h2 className="card-title" style={{marginBottom: '1rem'}}>Gemini API Key</h2>
              <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem'}}>
                Enter your Google Gemini API Key below. This key will be used to generate text embeddings (`gemini-embedding-2`) and process developer Q&A using the `gemini-3.5-flash` model.
              </p>
              <div className="form-group">
                <input 
                  type="password" 
                  className="form-input" 
                  placeholder="AIzaSy..."
                  value={apiKey} 
                  onChange={handleApiKeyChange}
                />
              </div>
              <div style={{marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.75rem'}}>
                Keys are saved in your browser local storage and set in active backend sessions.
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
