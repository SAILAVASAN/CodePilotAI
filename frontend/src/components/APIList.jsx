import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ChevronUp, ExternalLink, Play } from 'lucide-react';
import { API_BASE } from '../lib/api';

const METHOD_STYLES = {
  GET: { bg: 'bg-blue-600', border: 'border-blue-500', light: 'bg-blue-500/10' },
  POST: { bg: 'bg-emerald-600', border: 'border-emerald-500', light: 'bg-emerald-500/10' },
  PUT: { bg: 'bg-amber-600', border: 'border-amber-500', light: 'bg-amber-500/10' },
  DELETE: { bg: 'bg-red-600', border: 'border-red-500', light: 'bg-red-500/10' },
  PATCH: { bg: 'bg-violet-600', border: 'border-violet-500', light: 'bg-violet-500/10' },
  DEFAULT: { bg: 'bg-gray-600', border: 'border-gray-500', light: 'bg-gray-500/10' },
};

export default function APIList({ repoId, onSelectFile }) {
  const [endpoints, setEndpoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedMethod, setSelectedMethod] = useState('ALL');
  const [expandedIndex, setExpandedIndex] = useState(null);

  const [testBody, setTestBody] = useState('');
  const [testHeaders, setTestHeaders] = useState('{\n  "Content-Type": "application/json"\n}');
  const [isExecuting, setIsExecuting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    if (!repoId) return;

    const fetchEndpoints = async () => {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE}/api/repositories/${repoId}/endpoints`, { credentials: 'include' });
        if (response.ok) {
          const data = await response.json();
          setEndpoints(data);
        }
      } catch (e) {
        console.error('Error fetching endpoints:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchEndpoints();
  }, [repoId]);

  const getMethodStyle = (method) => METHOD_STYLES[method.toUpperCase()] || METHOD_STYLES.DEFAULT;

  const methodsList = ['ALL', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

  const filteredEndpoints = endpoints.filter((ep) => {
    const matchesMethod = selectedMethod === 'ALL' || ep.method.toUpperCase() === selectedMethod;
    const matchesSearch = ep.path.toLowerCase().includes(search.toLowerCase()) ||
      ep.file_path.toLowerCase().includes(search.toLowerCase()) ||
      ep.method.toLowerCase().includes(search.toLowerCase());
    return matchesMethod && matchesSearch;
  });

  const handleToggleExpand = (idx, ep) => {
    if (expandedIndex === idx) {
      setExpandedIndex(null);
      setTestResult(null);
    } else {
      setExpandedIndex(idx);
      setTestResult(null);

      if (['POST', 'PUT', 'PATCH'].includes(ep.method.toUpperCase())) {
        if (ep.path.includes('chat')) {
          setTestBody(JSON.stringify({ repo_id: repoId, message: 'Explain codebase entry points' }, null, 2));
        } else if (ep.path.includes('signin') || ep.path.includes('signup')) {
          setTestBody(JSON.stringify({ email: 'dev@example.com', password: 'secretpassword' }, null, 2));
        } else if (ep.path.includes('apikey')) {
          setTestBody(JSON.stringify({ api_key: 'AIzaSy...' }, null, 2));
        } else {
          setTestBody(JSON.stringify({ name: 'Sample Repo', local_path: 'C:\\Projects\\App' }, null, 2));
        }
      } else {
        setTestBody('');
      }
    }
  };

  const handleExecuteRequest = async (ep) => {
    setIsExecuting(true);
    setTestResult(null);
    const startTime = performance.now();

    let targetUrl = ep.path;
    targetUrl = targetUrl.replace(/\{repo_id\}/g, String(repoId));
    targetUrl = targetUrl.replace(/\{id\}/g, String(repoId));

    if (!targetUrl.startsWith('http')) {
      targetUrl = `${API_BASE}${targetUrl.startsWith('/') ? '' : '/'}${targetUrl}`;
    }

    try {
      let parsedHeaders = {};
      try {
        parsedHeaders = JSON.parse(testHeaders);
      } catch (e) {
        parsedHeaders = { 'Content-Type': 'application/json' };
      }

      const options = { method: ep.method.toUpperCase(), headers: parsedHeaders, credentials: 'include' };

      if (['POST', 'PUT', 'PATCH'].includes(ep.method.toUpperCase()) && testBody.trim()) {
        options.body = testBody;
      }

      const res = await fetch(targetUrl, options);
      const endTime = performance.now();
      const durationMs = Math.round(endTime - startTime);

      let responseData;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        responseData = await res.json();
      } else {
        responseData = await res.text();
      }

      setTestResult({ status: res.status, statusText: res.statusText, durationMs, data: responseData });
    } catch (err) {
      const endTime = performance.now();
      setTestResult({
        status: 500,
        statusText: 'Network / Connection Error',
        durationMs: Math.round(endTime - startTime),
        data: { error: err.message, note: `Ensure FastAPI server is running at ${API_BASE}` },
      });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-5 overflow-hidden p-5">
      {/* Header Banner */}
      <div className="flex items-center justify-between rounded-xl border border-border-glass bg-bg-surface p-5 shadow-card">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-extrabold tracking-wide text-white">
              OPENAPI
            </span>
            <h2 className="font-heading text-lg font-extrabold text-text-primary">API Explorer &amp; Request Tester</h2>
          </div>
          <p className="mt-1.5 text-sm text-text-secondary">
            Discovered endpoints from codebase scanning. Select a route to test live requests.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[0.78rem] text-text-muted">Discovered:</span>
          <span className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-sm font-extrabold text-blue-500">
            {endpoints.length} Routes
          </span>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-1 rounded-lg border border-border-glass bg-bg-input p-1">
          {methodsList.map((m) => (
            <button
              key={m}
              onClick={() => setSelectedMethod(m)}
              className={`rounded-md px-3.5 py-1.5 text-[0.78rem] font-bold transition-colors ${
                selectedMethod === m ? 'bg-bg-surface text-text-primary shadow-sm' : 'text-text-secondary'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Search API path or file..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-[300px] flex-1 rounded-lg border border-border-glass bg-bg-input px-3.5 py-2 text-sm text-text-primary outline-none focus:border-primary"
        />
      </div>

      {/* Endpoints List */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {loading ? (
          <div className="p-8 text-center text-sm text-text-secondary">
            Scanning source code for FastAPI, Express, and Flask routes...
          </div>
        ) : filteredEndpoints.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border-glass bg-bg-surface p-8 text-center text-sm text-text-muted">
            No API routes match the active filter criteria.
          </div>
        ) : (
          filteredEndpoints.map((ep, idx) => {
            const isExpanded = expandedIndex === idx;
            const style = getMethodStyle(ep.method);

            return (
              <div
                key={idx}
                className={`shrink-0 overflow-hidden rounded-[10px] border shadow-card transition-colors ${
                  isExpanded ? `${style.border} bg-bg-surface` : 'border-border-glass bg-bg-surface-hover'
                }`}
              >
                <div
                  onClick={() => handleToggleExpand(idx, ep)}
                  className={`flex cursor-pointer items-center justify-between px-4 py-3 select-none ${isExpanded ? style.light : ''}`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    <span className={`min-w-[65px] rounded-md px-2.5 py-1 text-center text-xs font-extrabold text-white ${style.bg}`}>
                      {ep.method.toUpperCase()}
                    </span>
                    <span className="truncate font-mono text-sm font-semibold text-text-primary">{ep.path}</span>
                  </div>

                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onSelectFile(ep.file_path, String(ep.line_number)); }}
                      title="Jump to source code location"
                      className="flex items-center gap-1 rounded-md border border-border-glass bg-bg-input px-2.5 py-1 text-xs font-medium text-text-secondary"
                    >
                      <ExternalLink size={12} />
                      {ep.file_path.split('/').pop()} : L{ep.line_number}
                    </button>

                    {isExpanded ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
                  </div>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-t border-border-glass bg-bg-surface"
                    >
                      <div className="flex flex-col gap-4 p-5">
                        <div className="flex items-center justify-between">
                          <span className="text-[0.78rem] font-bold tracking-wide text-primary uppercase">
                            Parameters &amp; Execution Console
                          </span>

                          <button
                            onClick={() => handleExecuteRequest(ep)}
                            disabled={isExecuting}
                            className={`flex items-center gap-1.5 rounded-md border px-4 py-1.5 text-sm font-bold text-white shadow-md ${style.bg} ${style.border} ${
                              isExecuting ? 'cursor-not-allowed' : 'cursor-pointer'
                            }`}
                          >
                            <Play size={12} fill="currentColor" />
                            {isExecuting ? 'Sending Request...' : 'Execute Request (Try it out)'}
                          </button>
                        </div>

                        <div className={`grid gap-4 ${['POST', 'PUT', 'PATCH'].includes(ep.method.toUpperCase()) ? 'grid-cols-2' : 'grid-cols-1'}`}>
                          <div>
                            <label className="mb-1.5 block text-xs font-semibold text-text-secondary">Request Headers (JSON)</label>
                            <textarea
                              rows={3}
                              value={testHeaders}
                              onChange={(e) => setTestHeaders(e.target.value)}
                              className="w-full rounded-lg border border-border-glass bg-bg-input px-3 py-2 font-mono text-[0.85rem] text-text-primary outline-none"
                            />
                          </div>

                          {['POST', 'PUT', 'PATCH'].includes(ep.method.toUpperCase()) && (
                            <div>
                              <label className="mb-1.5 block text-xs font-semibold text-text-secondary">Request Body (JSON)</label>
                              <textarea
                                rows={3}
                                value={testBody}
                                onChange={(e) => setTestBody(e.target.value)}
                                className="w-full rounded-lg border border-border-glass bg-bg-input px-3 py-2 font-mono text-[0.85rem] text-text-primary outline-none"
                              />
                            </div>
                          )}
                        </div>

                        {testResult && (
                          <div className="flex flex-col gap-2.5 rounded-lg border border-border-glass bg-bg-input p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <span
                                  className={`rounded-md border px-2.5 py-0.5 text-[0.78rem] font-extrabold ${
                                    testResult.status >= 200 && testResult.status < 300
                                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                                      : 'border-red-500/30 bg-red-500/10 text-red-500'
                                  }`}
                                >
                                  {testResult.status} {testResult.statusText}
                                </span>
                                <span className="text-xs font-medium text-text-secondary">Time: {testResult.durationMs} ms</span>
                              </div>
                              <span className="font-mono text-[0.72rem] text-text-muted">HTTP / 1.1 Response</span>
                            </div>

                            <pre className="max-h-60 overflow-y-auto rounded-md border border-border-glass bg-bg-surface-hover p-3.5 font-mono text-[0.82rem] whitespace-pre-wrap text-text-primary">
                              {typeof testResult.data === 'object' ? JSON.stringify(testResult.data, null, 2) : String(testResult.data)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
