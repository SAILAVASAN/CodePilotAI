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
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Terminal Block (65% width) */}
      <div style={{ width: '65%', display: 'flex', flexDirection: 'column', height: '100%', borderRight: '1px solid var(--border-glass)' }}>
        <div style={{ padding: '0.75rem 1rem', background: '#0a0d14', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            &gt;_ runTests()
          </span>
          <span style={{ fontSize: '0.7rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            ● LOCAL WORKSPACE
          </span>
        </div>

        <div style={{
          flex: 1,
          background: '#04060a',
          padding: '1.25rem',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.82rem',
          color: '#d1d5db',
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          lineHeight: '1.6'
        }}>
          {!executed ? (
            <div style={{ color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-secondary)' }}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
              <span>Test Runner ready. Click "Run verification" to inspect.</span>
            </div>
          ) : (
            <div>
              {logs}
              {loading && (
                <div style={{ color: 'var(--accent)', marginTop: '0.5rem' }} className="thinking-dots">
                  <span>Running verification tests</span> <span></span><span></span><span></span>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: '1rem', background: '#0a0d14', borderTop: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'center' }}>
          <button 
            className="btn-primary" 
            style={{ width: '100%', maxWidth: '300px' }} 
            onClick={runVerification} 
            disabled={loading}
          >
            {loading ? (
              <span>Running...</span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Run verification
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Info Panel (35% width) */}
      <div style={{ width: '35%', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', background: 'rgba(255,255,255,0.01)' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Verification Statistics</h3>
        
        {results ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{
              background: results.success ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
              border: results.success ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '8px',
              padding: '1rem',
              textAlign: 'center'
            }}>
              <span style={{
                fontSize: '0.9rem',
                fontWeight: 700,
                color: results.success ? 'var(--success)' : 'var(--danger)'
              }}>
                {results.success ? '✔ PASSED' : '✘ FAILED'}
              </span>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Test suite run complete
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: '6px', padding: '0.75rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Runner</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, marginTop: '0.2rem', textTransform: 'uppercase', color: 'var(--accent)' }}>
                  {results.runner}
                </div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: '6px', padding: '0.75rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Exit Code</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, marginTop: '0.2rem' }}>
                  {results.exit_code !== undefined ? results.exit_code : 'N/A'}
                </div>
              </div>
            </div>
            
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
              <strong>Framework details:</strong> The agent detects framework configurations like `package.json` testing scripts, `pytest` configs, or python `unittest` modules. It runs verification in a subprocess matching your environment PATH settings.
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Run codebase verification to populate active statistics. Tests run in an isolated execution block on your machine.
          </div>
        )}
      </div>
    </div>
  );
}
