import React, { useState } from 'react';

export default function TestProof({ repoId }) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [logs, setLogs] = useState('');
  const [executed, setExecuted] = useState(false);

  const runVerification = async () => {
    setLoading(true);
    setResults(null);
    setLogs('Initializing workspace verification...\nDetecting testing framework...\n');
    setExecuted(true);

    try {
      const response = await fetch(`http://localhost:8000/api/repositories/${repoId}/run-tests`, {
        method: 'POST'
      });
      if (response.ok) {
        const data = await response.json();
        setResults(data);
        setLogs(prev => prev + `Runner detected: ${data.runner}\nExecuting: ${data.message}\n\n` + data.logs);
      } else {
        setLogs(prev => prev + '\nError: Failed to execute verification tests. Check backend logs.');
      }
    } catch (e) {
      console.error(e);
      setLogs(prev => prev + '\nError: Connection to backend test runner timed out.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--bg-base)' }}>
      {/* Terminal Block (65% width) */}
      <div style={{ width: '65%', display: 'flex', flexDirection: 'column', height: '100%', borderRight: '1px solid var(--border-glass)' }}>
        
        {/* Terminal Header */}
        <div style={{
          padding: '0.75rem 1.25rem',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-glass)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            &gt;_ runTests()
          </span>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            ● LOCAL WORKSPACE
          </span>
        </div>

        {/* Terminal Log Console */}
        <div style={{
          flex: 1,
          background: 'var(--bg-input)',
          padding: '1.25rem',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.85rem',
          color: 'var(--text-primary)',
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          lineHeight: '1.6'
        }}>
          {!executed ? (
            <div style={{ color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', alignItems: 'center', gap: '0.75rem' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)' }}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
              <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Test Runner ready. Click "Run verification" to execute test suite.</span>
            </div>
          ) : (
            <div>
              {logs}
              {loading && (
                <div style={{ color: 'var(--accent)', marginTop: '0.75rem' }} className="thinking-dots">
                  <span>Running verification tests</span> <span></span><span></span><span></span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Button Bar */}
        <div style={{ padding: '1rem', background: 'var(--bg-surface)', borderTop: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'center' }}>
          <button 
            className="btn-primary" 
            style={{ width: '100%', maxWidth: '320px', padding: '0.75rem 1.5rem' }} 
            onClick={runVerification} 
            disabled={loading}
          >
            {loading ? (
              <span>Running...</span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Run verification
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Verification Statistics Panel (35% width) */}
      <div style={{ width: '35%', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', background: 'var(--bg-surface)', overflowY: 'auto' }}>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>Verification Statistics</h3>
        
        {results ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="card-3d" style={{
              background: results.success ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              border: results.success ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '10px',
              padding: '1.1rem',
              textAlign: 'center'
            }}>
              <span style={{
                fontSize: '1rem',
                fontWeight: 800,
                color: results.success ? 'var(--success)' : 'var(--danger)'
              }}>
                {results.success ? '✔ PASSED' : '✘ FAILED'}
              </span>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.35rem', margin: 0 }}>
                Test suite run complete
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="card-3d" style={{ background: 'var(--bg-surface-hover)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '0.85rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Runner</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, marginTop: '0.2rem', textTransform: 'uppercase', color: 'var(--primary)' }}>
                  {results.runner}
                </div>
              </div>
              <div className="card-3d" style={{ background: 'var(--bg-surface-hover)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '0.85rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Exit Code</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, marginTop: '0.2rem', color: 'var(--text-primary)' }}>
                  {results.exit_code !== undefined ? results.exit_code : 'N/A'}
                </div>
              </div>
            </div>
            
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.45', background: 'var(--bg-surface-hover)', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
              <strong style={{ color: 'var(--text-primary)' }}>Framework details:</strong> The agent detects framework configurations like `package.json` testing scripts, `pytest` configs, or python `unittest` modules. It runs verification in a subprocess matching your environment PATH settings.
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.45', background: 'var(--bg-surface-hover)', padding: '1rem', borderRadius: '8px', border: '1px dashed var(--border-glass)' }}>
            Run codebase verification to populate active statistics. Tests run in an isolated execution block on your machine.
          </div>
        )}
      </div>
    </div>
  );
}
