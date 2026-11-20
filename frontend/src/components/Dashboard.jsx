import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { GitBranch, Waypoints, Trash2, Database, ShieldCheck, Crosshair, RefreshCw } from 'lucide-react';
import { apiGet, apiPost, apiDelete } from '../lib/api';
import ConfirmDialog from './ui/ConfirmDialog';

const STATUS_STYLES = {
  ready: 'text-success bg-emerald-500/10',
  ingesting: 'text-accent bg-cyan-500/10',
  cloning: 'text-warning bg-amber-500/10',
  pending: 'text-warning bg-amber-500/10',
  failed: 'text-danger bg-red-500/10',
};

export default function Dashboard({ onSelectRepo, selectedRepoId, onImportFromProvider }) {
  const [repos, setRepos] = useState([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);

  const fetchRepos = async () => {
    try {
      const response = await apiGet('/api/repositories');
      if (response.ok) {
        const data = await response.json();
        setRepos(data);
      }
    } catch (e) {
      console.error('Error fetching repositories:', e);
    }
  };

  useEffect(() => {
    fetchRepos();
    const interval = setInterval(fetchRepos, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleConnect = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a codebase project name.');
      return;
    }
    if (!url && !localPath) {
      setError('Please provide either a remote Git repository URL or a local folder path.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await apiPost('/api/repositories', {
        name,
        url: url || null,
        local_path: localPath || null,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Failed to initiate repository connection.');
      }

      toast.success('Connection initialized. Ingestion process running in the background.');
      setName('');
      setUrl('');
      setLocalPath('');
      fetchRepos();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      const response = await apiDelete(`/api/repositories/${pendingDelete.id}`);
      if (response.ok) {
        toast.success(`"${pendingDelete.name}" index deleted.`);
        fetchRepos();
      } else {
        toast.error('Failed to delete repository index.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error calling delete endpoint.');
    } finally {
      setPendingDelete(null);
    }
  };

  const handleReindex = async (repo) => {
    try {
      toast.info(`Reindexing "${repo.name}"...`);
      const response = await apiPost(`/api/repositories/${repo.id}/reindex`, {});
      if (response.ok) {
        toast.success(`Reindexing started for "${repo.name}".`);
        fetchRepos();
      } else {
        const err = await response.json();
        toast.error(err.detail || 'Failed to start reindexing.');
      }
    } catch (e) {
      toast.error('Failed to trigger reindexing.');
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-bg-base">
      <div className="grid flex-1 grid-cols-2 gap-6 p-6">
        {/* Connection Form Card */}
        <motion.div
          whileHover={{ y: -4 }}
          className="h-fit rounded-2xl border border-border-glass bg-bg-surface p-6 shadow-card backdrop-blur-2xl transition-shadow"
        >
          <h2 className="mb-5 flex items-center gap-2 font-heading text-base font-semibold text-text-primary">
            <GitBranch size={18} className="text-primary" />
            Connect Codebase Repository
          </h2>

          <div className="mb-5 flex gap-3">
            <button
              type="button"
              onClick={() => onImportFromProvider?.('github')}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border-glass bg-bg-surface-hover py-2.5 text-sm font-semibold text-text-primary transition-transform hover:-translate-y-0.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              Import from GitHub
            </button>
            <button
              type="button"
              onClick={() => onImportFromProvider?.('gitlab')}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border-glass bg-bg-surface-hover py-2.5 text-sm font-semibold text-text-primary transition-transform hover:-translate-y-0.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="#FC6D26">
                <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z" />
              </svg>
              Import from GitLab
            </button>
          </div>

          <div className="mb-5 text-center text-xs font-semibold text-text-muted">— OR PASTE A URL / LOCAL PATH —</div>

          {error && (
            <div className="mb-4 rounded-md bg-red-500/10 p-3 text-sm text-danger">{error}</div>
          )}

          <form onSubmit={handleConnect} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-secondary">Project Name</label>
              <input
                type="text"
                placeholder="e.g. My Express App"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="rounded-lg border border-border-glass bg-bg-input px-4 py-3 text-sm text-text-primary outline-none transition-shadow focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-glow)]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-secondary">Git Remote Repository URL (HTTPS)</label>
              <input
                type="url"
                placeholder="e.g. https://github.com/expressjs/express.git"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="rounded-lg border border-border-glass bg-bg-input px-4 py-3 text-sm text-text-primary outline-none transition-shadow focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-glow)]"
              />
            </div>

            <div className="my-1 text-center text-xs font-semibold text-text-muted">— OR —</div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-secondary">Local Codebase Folder Path (Windows)</label>
              <input
                type="text"
                placeholder="e.g. C:\Projects\my-node-app"
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
                className="rounded-lg border border-border-glass bg-bg-input px-4 py-3 text-sm text-text-primary outline-none transition-shadow focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-glow)]"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 w-full rounded-lg bg-gradient-to-br from-primary to-primary-hover py-3 font-bold text-white shadow-[0_4px_12px_var(--primary-glow)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {isSubmitting ? 'Connecting...' : 'Scan & Index Codebase'}
            </button>
          </form>
        </motion.div>

        {/* Active Repos Card */}
        <motion.div
          whileHover={{ y: -4 }}
          className="h-fit rounded-2xl border border-border-glass bg-bg-surface p-6 shadow-card backdrop-blur-2xl transition-shadow"
        >
          <h2 className="mb-5 flex items-center gap-2 font-heading text-base font-semibold text-text-primary">
            <Waypoints size={18} className="text-accent" />
            Active Repositories
          </h2>

          {repos.length === 0 ? (
            <div className="py-8 text-center text-sm text-text-muted">
              No repositories indexed yet. Connect one above to get started.
            </div>
          ) : (
            <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto">
              {repos.map((r) => (
                <div
                  key={r.id}
                  onClick={() => r.status === 'ready' && onSelectRepo(r)}
                  className={`flex items-center justify-between rounded-lg border p-4 transition-all ${
                    r.status === 'ready' ? 'cursor-pointer' : 'cursor-default'
                  } ${
                    selectedRepoId === r.id
                      ? 'border-l-4 border-primary bg-bg-surface-hover'
                      : 'border-border-glass bg-bg-surface-hover hover:border-primary-glow hover:shadow-[0_0_12px_var(--primary-glow)]'
                  }`}
                >
                  <div className="min-w-0">
                    <h3 className={`truncate text-[0.95rem] font-bold ${selectedRepoId === r.id ? 'text-primary' : 'text-text-primary'}`}>
                      {r.name}
                    </h3>
                    <p className="mt-0.5 truncate text-xs text-text-secondary">
                      {r.url ? `Git: ${r.url}` : `Local: ${r.local_path}`}
                    </p>
                    {r.error_message && <p className="mt-0.5 text-xs text-danger">{r.error_message}</p>}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-[0.7rem] font-bold uppercase ${STATUS_STYLES[r.status] || STATUS_STYLES.pending}`}>
                      {r.status}
                    </span>

                    <button
                      onClick={(e) => { e.stopPropagation(); handleReindex(r); }}
                      title="Re-index Codebase"
                      className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-primary/10 hover:text-primary"
                    >
                      <RefreshCw size={15} />
                    </button>

                    <button
                      onClick={(e) => { e.stopPropagation(); setPendingDelete(r); }}
                      title="Delete Repo Index"
                      className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-red-500/10 hover:text-danger"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Footer */}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-4 border-t border-border-glass bg-bg-surface p-6 shadow-card">
        <div>
          <div className="font-heading text-sm font-extrabold tracking-wide text-text-primary">
            DevCopilot Intelligence Engine
          </div>
          <div className="mt-0.5 text-xs text-text-secondary">
            Local-first codebase indexing & semantic verification.
          </div>
        </div>

        <div className="flex flex-wrap gap-10">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-accent">
              <Database size={14} strokeWidth={2.5} />
              <span>SQLite Vector Store</span>
            </div>
            <div className="mt-0.5 text-[0.72rem] text-text-secondary">Fast, portable semantic search</div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-success">
              <ShieldCheck size={14} strokeWidth={2.5} />
              <span>Zero Code Export</span>
            </div>
            <div className="mt-0.5 text-[0.72rem] text-text-secondary">Source stays 100% on your machine</div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
              <Crosshair size={14} strokeWidth={2.5} />
              <span>Precise Citations</span>
            </div>
            <div className="mt-0.5 text-[0.72rem] text-text-secondary">Direct file & line references</div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete repository index?"
        message={`This will permanently remove "${pendingDelete?.name}" and its cached database chunks.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
