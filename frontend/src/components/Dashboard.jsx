import React, { useState, useEffect } from 'react';

export default function Dashboard({ onSelectRepo, selectedRepoId }) {
  const [repos, setRepos] = useState([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch repositories list
  const fetchRepos = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/repositories');
      if (response.ok) {
        const data = await response.json();
        setRepos(data);
      }
    } catch (e) {
      console.error("Error fetching repositories:", e);
    }
  };

  // Poll repos list to watch ingestion state
  useEffect(() => {
    fetchRepos();
    const interval = setInterval(fetchRepos, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleConnect = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please provide a codebase project name.");
      return;
    }
    if (!url && !localPath) {
      setError("Please provide either a remote Git repository URL or a local folder path.");
      return;
    }

    setIsSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('http://localhost:8000/api/repositories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: name,
          url: url || null,
          local_path: localPath || null
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Failed to initiate repository connection.");
      }

      setSuccess("Connection initialized. Ingestion process running in the background.");
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

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this repository index? This will clean up cached database chunks.")) {
      return;
    }
    try {
      const response = await fetch(`http://localhost:8000/api/repositories/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        fetchRepos();
      } else {
        alert("Failed to delete repository index.");
      }
    } catch (err) {
      console.error(err);
      alert("Error calling delete endpoint.");
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      <div className="dashboard-grid" style={{ flex: 1, padding: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        
        {/* Connection Form Card */}
        <div className="dashboard-card" style={{ height: 'fit-content' }}>
          <h2 className="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: 'var(--primary)'}}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            Connect a Codebase Repository
          </h2>
          
          {error && <div style={{color: 'var(--danger)', padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem'}}>{error}</div>}
          {success && <div style={{color: 'var(--success)', padding: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem'}}>{success}</div>}

          <form onSubmit={handleConnect} className="ingest-form">
            <div className="form-group">
              <label>Project Name</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="e.g. My Express App"
                value={name} 
                onChange={e => setName(e.target.value)} 
                required
              />
            </div>

            <div className="form-group">
              <label>Git Remote Repository URL (HTTPS)</label>
              <input 
                type="url" 
                className="form-input" 
                placeholder="e.g. https://github.com/expressjs/express.git"
                value={url} 
                onChange={e => setUrl(e.target.value)}
              />
            </div>

            <div style={{textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, margin: '0.5rem 0'}}>— OR —</div>

            <div className="form-group">
              <label>Local Codebase Folder Path (Windows)</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="e.g. c:\Projects\my-node-app"
                value={localPath} 
                onChange={e => setLocalPath(e.target.value)}
              />
            </div>

            <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ width: '100%', marginTop: '0.5rem' }}>
              {isSubmitting ? "Connecting..." : "Scan & Index Codebase"}
            </button>
          </form>
        </div>

        {/* Active Repos Card */}
        <div className="dashboard-card" style={{ height: 'fit-content' }}>
          <h2 className="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: 'var(--accent)'}}><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            Active Repositories
          </h2>

          {repos.length === 0 ? (
            <div style={{color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0', fontSize: '0.9rem'}}>
              No repositories indexed yet. Connect one above to get started.
            </div>
          ) : (
            <div className="repos-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '420px', overflowY: 'auto' }}>
              {repos.map(r => (
                <div 
                  key={r.id} 
                  className={`repo-item ${selectedRepoId === r.id ? 'active-border' : ''}`}
                  style={{
                    cursor: r.status === 'ready' ? 'pointer' : 'default',
                    borderLeft: selectedRepoId === r.id ? '4px solid var(--primary)' : '1px solid var(--border-glass)',
                    padding: '0.75rem 1rem',
                    background: 'rgba(255, 255, 255, 0.01)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                  onClick={() => r.status === 'ready' && onSelectRepo(r)}
                >
                  <div className="repo-info">
                    <h3 style={{fontSize: '0.95rem', margin: 0, color: selectedRepoId === r.id ? 'var(--primary)' : 'var(--text-primary)'}}>{r.name}</h3>
                    <p style={{fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0'}}>{r.url ? `Git: ${r.url}` : `Local: ${r.local_path}`}</p>
                    {r.error_message && <p style={{color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.2rem', margin: 0}}>{r.error_message}</p>}
                  </div>
                  
                  <div style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
                    <span className={`status-tag ${r.status}`} style={{
                      fontSize: '0.7rem',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      textTransform: 'uppercase',
                      fontWeight: 'bold',
                      color: r.status === 'ready' ? 'var(--success)' : r.status === 'error' ? 'var(--danger)' : 'var(--warning)',
                      background: r.status === 'ready' ? 'rgba(16, 185, 129, 0.1)' : r.status === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)'
                    }}>
                      {r.status}
                    </span>
                    
                    <button className="btn-delete" onClick={(e) => handleDelete(r.id, e)} title="Delete Repo Index" style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer'
                    }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Premium Design Footer matching the mockup */}
      <div style={{
        padding: '2rem 1.5rem',
        borderTop: '1px solid var(--border-glass)',
        marginTop: 'auto',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(0, 0, 0, 0.2)'
      }}>
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Built for the code you can't share
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', fontStyle: 'italic' }}>
            Local by default. Precise by design.
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '3rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              <span>SQLite Index</span>
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
              fast, portable search
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <span>No Upload Required</span>
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
              your workspace stays yours
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              <span>Cited Answers</span>
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
              files, lines, context
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
