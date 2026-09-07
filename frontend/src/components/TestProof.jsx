import { useState } from 'react';
import { Wrench, Play, CheckCircle2, XCircle } from 'lucide-react';
import { API_BASE } from '../lib/api';

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
      const response = await fetch(`${API_BASE}/api/repositories/${repoId}/run-tests`, { method: 'POST', credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setResults(data);
        setLogs((prev) => prev + `Runner detected: ${data.runner}\nExecuting: ${data.message}\n\n` + data.logs);
      } else {
        setLogs((prev) => prev + '\nError: Failed to execute verification tests. Check backend logs.');
      }
    } catch (e) {
      console.error(e);
      setLogs((prev) => prev + '\nError: Connection to backend test runner timed out.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full overflow-hidden bg-bg-base">
      {/* Terminal Block */}
      <div className="flex h-full w-[65%] flex-col border-r border-border-glass">
        <div className="flex items-center justify-between border-b border-border-glass bg-bg-surface px-5 py-3">
          <span className="font-mono text-sm font-semibold text-text-primary">&gt;_ runTests()</span>
          <span className="flex items-center gap-1.5 text-xs font-bold text-success">● LOCAL WORKSPACE</span>
        </div>

        <div className="flex-1 overflow-y-auto whitespace-pre-wrap bg-bg-input p-5 font-mono text-[0.85rem] leading-relaxed text-text-primary">
          {!executed ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-text-muted">
              <Wrench size={32} strokeWidth={1.5} className="text-primary" />
              <span className="text-sm font-medium">Test Runner ready. Click "Run verification" to execute test suite.</span>
            </div>
          ) : (
            <div>
              {logs}
              {loading && (
                <div className="thinking-dots mt-3 text-accent">
                  <span>Running verification tests</span> <span></span><span></span><span></span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-center border-t border-border-glass bg-bg-surface p-4">
          <button
            onClick={runVerification}
            disabled={loading}
            className="flex w-full max-w-[320px] items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-primary to-primary-hover py-3 font-bold text-white shadow-[0_4px_12px_var(--primary-glow)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Running...' : <><Play size={14} fill="currentColor" /> Run verification</>}
          </button>
        </div>
      </div>

      {/* Verification Statistics */}
      <div className="flex w-[35%] flex-col gap-5 overflow-y-auto bg-bg-surface p-6">
        <h3 className="font-heading text-lg font-extrabold text-text-primary">Verification Statistics</h3>

        {results ? (
          <div className="flex flex-col gap-4">
            <div
              className={`flex flex-col items-center gap-1.5 rounded-[10px] border p-4 text-center ${
                results.success ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-red-500/30 bg-red-500/10'
              }`}
            >
              <span className={`flex items-center gap-1.5 text-base font-extrabold ${results.success ? 'text-success' : 'text-danger'}`}>
                {results.success ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                {results.success ? 'PASSED' : 'FAILED'}
              </span>
              <p className="text-sm text-text-secondary">Test suite run complete</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border-glass bg-bg-surface-hover p-3.5 text-center">
                <div className="text-xs font-medium text-text-secondary">Runner</div>
                <div className="mt-0.5 text-sm font-extrabold text-primary uppercase">{results.runner}</div>
              </div>
              <div className="rounded-lg border border-border-glass bg-bg-surface-hover p-3.5 text-center">
                <div className="text-xs font-medium text-text-secondary">Exit Code</div>
                <div className="mt-0.5 text-sm font-extrabold text-text-primary">
                  {results.exit_code !== undefined ? results.exit_code : 'N/A'}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border-glass bg-bg-surface-hover p-3.5 text-[0.82rem] leading-relaxed text-text-secondary">
              <strong className="text-text-primary">Framework details:</strong> The agent detects framework configurations like package.json testing scripts, pytest configs, or python unittest modules. It runs verification in a subprocess matching your environment PATH settings.
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border-glass bg-bg-surface-hover p-4 text-[0.85rem] leading-relaxed text-text-secondary">
            Run codebase verification to populate active statistics. Tests run in an isolated execution block on your machine.
          </div>
        )}
      </div>
    </div>
  );
}
