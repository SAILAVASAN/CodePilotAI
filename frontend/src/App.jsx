import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Toaster } from 'sonner';
import {
  LayoutDashboard, MessageSquare, Settings, LogOut, Sun, Moon,
  ChevronLeft, ChevronRight, Bot, KeyRound,
} from 'lucide-react';
import './App.css';
import Dashboard from './components/Dashboard';
import RepoExplorer from './components/RepoExplorer';
import AgentChat from './components/AgentChat';
import CodePreview from './components/CodePreview';
import APIList from './components/APIList';
import TestProof from './components/TestProof';
import ArchDiagram from './components/ArchDiagram';
import Auth from './components/Auth';
import RepoPicker from './components/RepoPicker';
import { apiGet, apiPost } from './lib/api';

const WORKSPACE_TABS = [
  { key: 'debugging', label: 'Debugging' },
  { key: 'architecture', label: 'Architecture' },
  { key: 'apis', label: 'API Discovery' },
  { key: 'tests', label: 'Test Proof' },
];

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Repositories', icon: LayoutDashboard },
  { key: 'workspace', label: 'Ask Agent', icon: MessageSquare },
];

export default function App() {
  const [view, setView] = useState('dashboard');
  const [activeTab, setActiveTab] = useState('debugging');
  const [apiKey, setApiKey] = useState('');
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [activeFilePath, setActiveFilePath] = useState(null);
  const [highlightLineRange, setHighlightLineRange] = useState(null);
  const [backendConfigured, setBackendConfigured] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('agent_theme') || 'dark');
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [repoPickerProvider, setRepoPickerProvider] = useState(null); // null | 'github' | 'gitlab'
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('agent_theme', next);
  };

  const checkStatus = async () => {
    try {
      const response = await apiGet('/api/status');
      if (response.ok) {
        const data = await response.json();
        setBackendConfigured(data.api_key_configured);
      }
    } catch (e) {
      console.error('Backend status check failed:', e);
    }
  };

  // On mount: find out who (if anyone) the session cookie identifies as, and
  // whether we just landed back from an OAuth provider's callback redirect.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthSuccess = params.get('oauth') === 'success';
    const oauthProvider = params.get('provider');
    if (oauthSuccess) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    apiGet('/api/auth/me')
      .then(async (response) => {
        if (response.ok) {
          setUser(await response.json());
          if (oauthSuccess && oauthProvider) {
            setRepoPickerProvider(oauthProvider);
          }
        }
      })
      .catch((e) => console.error('Session check failed:', e))
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    const saved = localStorage.getItem('agent_gemini_key') || '';
    setApiKey(saved);
    if (saved) {
      updateBackendKey(saved);
    }
    checkStatus();
  }, [user]);

  const handleSignOut = async () => {
    try {
      await apiPost('/api/auth/logout', {});
    } catch (e) {
      console.error('Logout failed:', e);
    }
    setUser(null);
  };

  const updateBackendKey = async (key) => {
    try {
      await apiPost('/api/settings/apikey', { api_key: key });
      checkStatus();
    } catch (e) {
      console.error('Error setting API key on backend:', e);
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

  if (authLoading) {
    return <div className="h-screen w-screen bg-bg-base" />;
  }

  if (!user) {
    return (
      <>
        <Toaster theme={theme} position="top-center" richColors />
        <Auth onLogin={setUser} />
      </>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-[image:var(--bg-gradient)]">
      <Toaster theme={theme} position="top-center" richColors />

      {/* Sidebar navigation */}
      <motion.aside
        animate={{ width: sidebarCollapsed ? 72 : 260 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className="relative z-10 flex flex-shrink-0 flex-col border-r border-border-glass bg-bg-sidebar backdrop-blur-2xl"
      >
        <button
          type="button"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? 'Expand Sidebar' : 'Minimize Sidebar'}
          className="absolute top-5 -right-[13px] z-20 flex h-[26px] w-[26px] items-center justify-center rounded-full border border-border-glass bg-bg-surface text-text-primary shadow-lg transition-transform hover:scale-110 hover:border-primary-hover hover:bg-primary hover:text-white"
        >
          {sidebarCollapsed ? <ChevronRight size={14} strokeWidth={2.5} /> : <ChevronLeft size={14} strokeWidth={2.5} />}
        </button>

        <div className="flex h-full flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border-glass px-5 py-6">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent text-white shadow-[0_0_15px_var(--primary-glow)]">
            <Bot size={20} />
          </div>
          {!sidebarCollapsed && (
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-heading text-base font-extrabold bg-[image:var(--logo-text-gradient)] bg-clip-text text-transparent">
                CodePilot
              </span>
              <span className="truncate text-[0.7rem] text-text-secondary">
                Developer: {user.name || user.email}
              </span>
            </div>
          )}
        </div>

        <ul className="flex flex-1 flex-col gap-1 px-3 py-5">
          {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
            const disabled = key === 'workspace' && !selectedRepo;
            const active = view === key;
            return (
              <li
                key={key}
                onClick={() => !disabled && setView(key)}
                className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                  disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                } ${
                  active
                    ? 'border-l-[3px] border-primary bg-gradient-to-r from-indigo-500/15 to-cyan-500/5 text-text-primary'
                    : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'
                }`}
              >
                <Icon size={18} />
                {!sidebarCollapsed && <span>{label}</span>}
              </li>
            );
          })}

          <li
            onClick={() => setView('settings')}
            className={`mt-auto flex cursor-pointer items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
              view === 'settings'
                ? 'border-l-[3px] border-primary bg-gradient-to-r from-indigo-500/15 to-cyan-500/5 text-text-primary'
                : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'
            }`}
          >
            <Settings size={18} />
            {!sidebarCollapsed && <span>Settings</span>}
          </li>
          <li
            onClick={handleSignOut}
            className="mt-1 flex cursor-pointer items-center gap-3 rounded-none border-t border-border-glass px-4 pt-4 pb-1 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            <LogOut size={18} />
            {!sidebarCollapsed && <span>Sign Out</span>}
          </li>
        </ul>
        </div>
      </motion.aside>

      {/* Main content display */}
      <main className="relative flex h-screen flex-1 flex-col overflow-hidden">
        <header className="z-[5] flex h-16 items-center justify-between border-b border-border-glass bg-bg-header px-6 backdrop-blur-2xl">
          <h1 className="text-lg font-semibold text-text-primary">{getHeaderTitle()}</h1>

          <div className="flex items-center gap-4">
            <button
              onClick={toggleTheme}
              className="flex items-center gap-1.5 rounded-md border border-border-glass px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-bg-surface-hover"
            >
              {theme === 'dark' ? <><Sun size={14} /><span>Light Mode</span></> : <><Moon size={14} /><span>Dark Mode</span></>}
            </button>

            {backendConfigured ? (
              <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-success">
                ● Connected
              </div>
            ) : (
              <div
                onClick={() => setView('settings')}
                className="flex cursor-pointer items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-danger animate-pulse"
                title="Click to set your API Key."
              >
                ● Key Required
              </div>
            )}
          </div>
        </header>

        <AnimatePresence mode="wait">
          {view === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="flex flex-1 flex-col overflow-hidden"
            >
              <Dashboard
                onSelectRepo={handleSelectRepo}
                selectedRepoId={selectedRepo?.id}
                onImportFromProvider={setRepoPickerProvider}
              />
            </motion.div>
          )}

          {view === 'workspace' && selectedRepo && (
            <motion.div
              key="workspace"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="flex flex-1 flex-col overflow-hidden"
            >
              <div className="flex h-12 shrink-0 items-center justify-between border-b border-border-glass bg-bg-surface px-6">
                <div className="flex h-full gap-6">
                  {WORKSPACE_TABS.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setActiveTab(key)}
                      className={`h-full border-b-2 px-1 text-sm font-semibold tracking-wide uppercase transition-colors ${
                        activeTab === key
                          ? 'border-primary text-text-primary'
                          : 'border-transparent text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="font-mono text-xs text-text-muted">main • indexed just now</div>
              </div>

              <div className="flex flex-1 overflow-hidden">
                {activeTab === 'debugging' && (
                  <>
                    <div className={`h-full ${activeFilePath ? 'w-1/2 border-r border-border-glass' : 'w-full'}`}>
                      <AgentChat repoId={selectedRepo.id} onSelectCitation={handleCitationClick} />
                    </div>
                    {activeFilePath && (
                      <div className="h-full w-1/2">
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
                    <div className={`h-full border-r border-border-glass ${activeFilePath ? 'w-[22%]' : 'w-[30%]'}`}>
                      <RepoExplorer
                        repoId={selectedRepo.id}
                        activeFilePath={activeFilePath}
                        onSelectFile={(path) => { setActiveFilePath(path); setHighlightLineRange(null); }}
                      />
                    </div>
                    <div className={`h-full ${activeFilePath ? 'w-[38%] border-r border-border-glass' : 'w-[70%]'}`}>
                      <ArchDiagram onSelectFile={(file, line) => { setActiveFilePath(file); setHighlightLineRange(line); }} />
                    </div>
                    {activeFilePath && (
                      <div className="h-full w-2/5">
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
                    <div className={`h-full ${activeFilePath ? 'w-1/2 border-r border-border-glass' : 'w-full'}`}>
                      <APIList
                        repoId={selectedRepo.id}
                        onSelectFile={(file, line) => { setActiveFilePath(file); setHighlightLineRange(line); }}
                      />
                    </div>
                    {activeFilePath && (
                      <div className="h-full w-1/2">
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
                  <div className="h-full w-full">
                    <TestProof repoId={selectedRepo.id} />
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {view === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="flex flex-1 flex-col gap-6 overflow-y-auto p-8"
            >
              <div className="max-w-xl rounded-2xl border border-border-glass bg-bg-surface p-6 shadow-card backdrop-blur-2xl">
                <h2 className="mb-4 flex items-center gap-2 font-heading text-lg font-semibold text-text-primary">
                  <KeyRound size={18} className="text-primary" />
                  Gemini API Key
                </h2>
                <p className="mb-5 text-sm text-text-secondary">
                  Enter your Google Gemini API Key below. This key will be used to generate text embeddings (`gemini-embedding-2`) and process developer Q&A using the `gemini-3.5-flash` model.
                </p>
                <div className="flex flex-col gap-1.5">
                  <input
                    type="password"
                    placeholder="AIzaSy..."
                    value={apiKey}
                    onChange={handleApiKeyChange}
                    className="rounded-lg border border-border-glass bg-bg-input px-4 py-3 text-sm text-text-primary outline-none transition-shadow focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-glow)]"
                  />
                </div>
                <div className="mt-4 text-xs text-text-muted">
                  Keys are saved in your browser local storage and set in active backend sessions.
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <RepoPicker
        open={!!repoPickerProvider}
        provider={repoPickerProvider}
        onClose={() => setRepoPickerProvider(null)}
        onImported={() => setRepoPickerProvider(null)}
      />
    </div>
  );
}
