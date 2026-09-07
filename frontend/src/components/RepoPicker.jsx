import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Lock, Globe, Download, Search } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';
import Modal from './ui/Modal';

const PROVIDER_LABEL = {
  github: 'GitHub',
  gitlab: 'GitLab',
};

export default function RepoPicker({ open, provider, onClose, onImported }) {
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [importingFullName, setImportingFullName] = useState(null);

  useEffect(() => {
    if (!open || !provider) return;

    setLoading(true);
    setError('');
    apiGet(`/api/auth/${provider}/repos`)
      .then(async (response) => {
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || `Failed to load ${PROVIDER_LABEL[provider]} repositories.`);
        }
        return response.json();
      })
      .then(setRepos)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, provider]);

  const filtered = repos.filter((r) => r.full_name.toLowerCase().includes(search.toLowerCase()));

  const handleImport = async (repo) => {
    setImportingFullName(repo.full_name);
    try {
      const response = await apiPost('/api/repositories', {
        name: repo.name,
        url: repo.clone_url,
        provider: repo.provider,
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to import repository.');
      }
      toast.success(`Importing "${repo.name}" — indexing in the background.`);
      onImported?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setImportingFullName(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Import from ${PROVIDER_LABEL[provider] || ''}`} maxWidth="640px">
      <div className="flex flex-col gap-3 -m-5 p-5 font-sans text-sm normal-case whitespace-normal">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search your repositories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border-glass bg-bg-input py-2 pl-9 pr-3 text-sm text-text-primary outline-none focus:border-primary"
          />
        </div>

        {loading && <div className="py-8 text-center text-text-secondary">Loading repositories...</div>}
        {error && <div className="rounded-md bg-red-500/10 p-3 text-danger">{error}</div>}

        {!loading && !error && (
          <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-text-muted">No repositories match.</div>
            ) : (
              filtered.map((repo) => (
                <div
                  key={repo.full_name}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border-glass bg-bg-surface-hover p-3"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {repo.private ? (
                      <Lock size={14} className="shrink-0 text-warning" />
                    ) : (
                      <Globe size={14} className="shrink-0 text-accent" />
                    )}
                    <span className="truncate font-mono text-[0.85rem] text-text-primary">{repo.full_name}</span>
                  </div>
                  <button
                    onClick={() => handleImport(repo)}
                    disabled={importingFullName === repo.full_name}
                    className="flex shrink-0 items-center gap-1.5 rounded-md bg-gradient-to-br from-primary to-primary-hover px-3 py-1.5 text-xs font-bold text-white shadow-[0_2px_8px_var(--primary-glow)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Download size={12} />
                    {importingFullName === repo.full_name ? 'Importing...' : 'Import'}
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
