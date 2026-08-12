import React, { useState, useEffect } from 'react';

export default function APIList({ repoId, onSelectFile }) {
  const [endpoints, setEndpoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!repoId) return;

    const fetchEndpoints = async () => {
      setLoading(true);
      try {
        const response = await fetch(`http://localhost:8000/api/repositories/${repoId}/endpoints`);
        if (response.ok) {
          const data = await response.json();
          setEndpoints(data);
        }
      } catch (e) {
        console.error("Error fetching endpoints:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchEndpoints();
  }, [repoId]);

  const getMethodColor = (method) => {
    switch (method) {
      case 'GET': return '#3b82f6'; // Blue
      case 'POST': return '#10b981'; // Green
      case 'PUT': return '#f59e0b'; // Yellow
      case 'DELETE': return '#ef4444'; // Red
      default: return '#8b5cf6'; // Purple for custom methods (USE, PATCH)
    }
  };

  const filtered = endpoints.filter(ep => 
    ep.path.toLowerCase().includes(search.toLowerCase()) || 
    ep.file_path.toLowerCase().includes(search.toLowerCase()) || 
    ep.method.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: '1.25rem', height: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Discovered Endpoints ({endpoints.length})</h3>
        <input 
          type="text" 
          placeholder="Filter routes..." 
          value={search} 
          onChange={e => setSearch(e.target.value)}
          style={{
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid var(--border-glass)',
            color: '#fff',
            borderRadius: '6px',
            padding: '0.35rem 0.75rem',
            fontSize: '0.8rem',
            outline: 'none',
            width: '200px'
          }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {loading ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '1rem' }}>Scanning source files for API routes...</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '1rem', textAlign: 'center' }}>
            No endpoints found matching filters.
          </div>
        ) : (
          filtered.map((ep, idx) => (
            <div 
              key={idx}
              onClick={() => onSelectFile(ep.file_path, String(ep.line_number))}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'between',
                padding: '0.75rem 1rem',
                background: 'rgba(20, 29, 48, 0.4)',
                border: '1px solid var(--border-glass)',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'var(--transition-smooth)'
              }}
              className="repo-item"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  color: '#fff',
                  background: getMethodColor(ep.method),
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  minWidth: '55px',
                  textAlign: 'center'
                }}>
                  {ep.method}
                </span>
                
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#f3f4f6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ep.path}
                </span>
              </div>
              
              <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <div style={{ fontFamily: 'var(--font-mono)' }}>{ep.file_path.split('/').pop()}</div>
                <div style={{ color: 'var(--text-muted)' }}>Line {ep.line_number}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
