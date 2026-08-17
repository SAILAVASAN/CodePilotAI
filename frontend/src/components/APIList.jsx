import React, { useState, useEffect } from 'react';

export default function APIList({ repoId, onSelectFile }) {
  const [endpoints, setEndpoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedMethod, setSelectedMethod] = useState('ALL');
  const [expandedIndex, setExpandedIndex] = useState(null);

  // State for Swagger "Try it out" execution
  const [testParams, setTestParams] = useState({});
  const [testBody, setTestBody] = useState('');
  const [testHeaders, setTestHeaders] = useState('{\n  "Content-Type": "application/json"\n}');
  const [isExecuting, setIsExecuting] = useState(false);
  const [testResult, setTestResult] = useState(null);

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
    switch (method.toUpperCase()) {
      case 'GET': return { bg: '#2563eb', border: '#3b82f6', text: '#ffffff', lightBg: 'rgba(37, 99, 235, 0.12)' };
      case 'POST': return { bg: '#059669', border: '#10b981', text: '#ffffff', lightBg: 'rgba(5, 150, 105, 0.12)' };
      case 'PUT': return { bg: '#d97706', border: '#f59e0b', text: '#ffffff', lightBg: 'rgba(217, 119, 6, 0.12)' };
      case 'DELETE': return { bg: '#dc2626', border: '#ef4444', text: '#ffffff', lightBg: 'rgba(220, 38, 38, 0.12)' };
      case 'PATCH': return { bg: '#7c3aed', border: '#8b5cf6', text: '#ffffff', lightBg: 'rgba(124, 58, 237, 0.12)' };
      default: return { bg: '#4b5563', border: '#6b7280', text: '#ffffff', lightBg: 'rgba(75, 85, 99, 0.12)' };
    }
  };

  const methodsList = ['ALL', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

  const filteredEndpoints = endpoints.filter(ep => {
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
      
      // Default body setup based on endpoint path
      if (['POST', 'PUT', 'PATCH'].includes(ep.method.toUpperCase())) {
        if (ep.path.includes('chat')) {
          setTestBody(JSON.stringify({ repo_id: repoId, message: "Explain codebase entry points" }, null, 2));
        } else if (ep.path.includes('signin') || ep.path.includes('signup')) {
          setTestBody(JSON.stringify({ email: "dev@example.com", password: "secretpassword" }, null, 2));
        } else if (ep.path.includes('apikey')) {
          setTestBody(JSON.stringify({ api_key: "AIzaSy..." }, null, 2));
        } else {
          setTestBody(JSON.stringify({ name: "Sample Repo", local_path: "C:\\Projects\\App" }, null, 2));
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

    // Construct final URL
    let targetUrl = ep.path;
    targetUrl = targetUrl.replace(/\{repo_id\}/g, String(repoId));
    targetUrl = targetUrl.replace(/\{id\}/g, String(repoId));

    if (!targetUrl.startsWith('http')) {
      targetUrl = `http://localhost:8000${targetUrl.startsWith('/') ? '' : '/'}${targetUrl}`;
    }

    try {
      let parsedHeaders = {};
      try {
        parsedHeaders = JSON.parse(testHeaders);
      } catch (e) {
        parsedHeaders = { 'Content-Type': 'application/json' };
      }

      const options = {
        method: ep.method.toUpperCase(),
        headers: parsedHeaders
      };

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

      const resHeaders = {};
      res.headers.forEach((val, key) => { resHeaders[key] = val; });

      setTestResult({
        status: res.status,
        statusText: res.statusText,
        durationMs,
        headers: resHeaders,
        data: responseData
      });
    } catch (err) {
      const endTime = performance.now();
      setTestResult({
        status: 500,
        statusText: 'Network / Connection Error',
        durationMs: Math.round(endTime - startTime),
        headers: {},
        data: { error: err.message, note: "Ensure FastAPI server is running at http://localhost:8000" }
      });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div style={{ padding: '1.25rem', height: '100%', display: 'flex', flexDirection: 'column', gap: '1.25rem', overflow: 'hidden' }}>
      
      {/* Swagger UI Header Banner */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-glass)',
        borderRadius: '12px',
        padding: '1.25rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: 'var(--shadow-card)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{
              background: '#059669',
              color: '#fff',
              fontWeight: 800,
              fontSize: '0.72rem',
              padding: '0.25rem 0.6rem',
              borderRadius: '6px',
              letterSpacing: '0.5px'
            }}>
              OPENAPI
            </span>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              API Explorer & Request Tester
            </h2>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.35rem', margin: 0 }}>
            Discovered endpoints from codebase scanning. Select a route to test live requests.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Discovered:</span>
          <span style={{
            background: 'rgba(59, 130, 246, 0.12)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            color: '#2563eb',
            padding: '0.25rem 0.75rem',
            borderRadius: '12px',
            fontSize: '0.85rem',
            fontWeight: 800
          }}>
            {endpoints.length} Routes
          </span>
        </div>
      </div>

      {/* Filter Controls Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.4rem', background: 'var(--bg-input)', padding: '0.25rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
          {methodsList.map(m => (
            <button
              key={m}
              onClick={() => setSelectedMethod(m)}
              style={{
                background: selectedMethod === m ? 'var(--bg-surface)' : 'transparent',
                boxShadow: selectedMethod === m ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
                border: 'none',
                color: selectedMethod === m ? 'var(--text-primary)' : 'var(--text-secondary)',
                padding: '0.35rem 0.85rem',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'var(--transition-smooth)'
              }}
            >
              {m}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
          <input
            type="text"
            placeholder="Search API path or file..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="form-input"
            style={{
              fontSize: '0.82rem',
              padding: '0.45rem 0.85rem',
              width: '100%'
            }}
          />
        </div>
      </div>

      {/* Endpoints Accordion List */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingRight: '0.25rem' }}>
        {loading ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '2rem', textAlign: 'center' }}>
            Scanning source code for FastAPI, Express, and Flask routes...
          </div>
        ) : filteredEndpoints.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '2rem', textAlign: 'center', background: 'var(--bg-surface)', borderRadius: '8px', border: '1px dashed var(--border-glass)' }}>
            No API routes match the active filter criteria.
          </div>
        ) : (
          filteredEndpoints.map((ep, idx) => {
            const isExpanded = expandedIndex === idx;
            const styleTheme = getMethodColor(ep.method);

            return (
              <div
                key={idx}
                className="card-3d"
                style={{
                  background: isExpanded ? 'var(--bg-surface)' : 'var(--bg-surface-hover)',
                  border: `1px solid ${isExpanded ? styleTheme.border : 'var(--border-glass)'}`,
                  borderRadius: '10px',
                  overflow: 'hidden',
                  transition: 'var(--transition-smooth)',
                  boxShadow: isExpanded ? 'var(--shadow-card)' : 'none'
                }}
              >
                {/* Header Row */}
                <div
                  onClick={() => handleToggleExpand(idx, ep)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.75rem 1.1rem',
                    cursor: 'pointer',
                    userSelect: 'none',
                    background: isExpanded ? styleTheme.lightBg : 'transparent'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: 0 }}>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      color: styleTheme.text,
                      background: styleTheme.bg,
                      padding: '0.25rem 0.65rem',
                      borderRadius: '6px',
                      minWidth: '65px',
                      textAlign: 'center'
                    }}>
                      {ep.method.toUpperCase()}
                    </span>

                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {ep.path}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectFile(ep.file_path, String(ep.line_number));
                      }}
                      style={{
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-glass)',
                        color: 'var(--text-secondary)',
                        fontSize: '0.75rem',
                        padding: '0.25rem 0.6rem',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 500
                      }}
                      title="Jump to source code location"
                    >
                      {ep.file_path.split('/').pop()} : L{ep.line_number}
                    </button>

                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                </div>

                {/* Expanded Swagger "Try It Out" Details */}
                {isExpanded && (
                  <div style={{ padding: '1.25rem', borderTop: '1px solid var(--border-glass)', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Parameters & Execution Console
                      </span>

                      <button
                        onClick={() => handleExecuteRequest(ep)}
                        disabled={isExecuting}
                        style={{
                          background: styleTheme.bg,
                          border: `1px solid ${styleTheme.border}`,
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          padding: '0.45rem 1.1rem',
                          borderRadius: '6px',
                          cursor: isExecuting ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                        }}
                      >
                        {isExecuting ? 'Sending Request...' : 'Execute Request (Try it out)'}
                      </button>
                    </div>

                    {/* Request Config Inputs */}
                    <div style={{ display: 'grid', gridTemplateColumns: ['POST', 'PUT', 'PATCH'].includes(ep.method.toUpperCase()) ? '1fr 1fr' : '1fr', gap: '1rem' }}>
                      {/* Headers Input */}
                      <div>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                          Request Headers (JSON)
                        </label>
                        <textarea
                          rows={3}
                          value={testHeaders}
                          onChange={e => setTestHeaders(e.target.value)}
                          className="form-input"
                          style={{
                            width: '100%',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.85rem',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>

                      {/* Request Body Input if POST/PUT */}
                      {['POST', 'PUT', 'PATCH'].includes(ep.method.toUpperCase()) && (
                        <div>
                          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                            Request Body (JSON)
                          </label>
                          <textarea
                            rows={3}
                            value={testBody}
                            onChange={e => setTestBody(e.target.value)}
                            className="form-input"
                            style={{
                              width: '100%',
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.85rem',
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Response Console */}
                    {testResult && (
                      <div style={{
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-glass)',
                        borderRadius: '8px',
                        padding: '1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.6rem'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <span style={{
                              fontWeight: 800,
                              fontSize: '0.78rem',
                              padding: '0.2rem 0.6rem',
                              borderRadius: '6px',
                              color: testResult.status >= 200 && testResult.status < 300 ? '#059669' : '#dc2626',
                              background: testResult.status >= 200 && testResult.status < 300 ? 'rgba(5, 150, 105, 0.12)' : 'rgba(220, 38, 38, 0.12)',
                              border: `1px solid ${testResult.status >= 200 && testResult.status < 300 ? 'rgba(5, 150, 105, 0.3)' : 'rgba(220, 38, 38, 0.3)'}`
                            }}>
                              {testResult.status} {testResult.statusText}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                              Time: {testResult.durationMs} ms
                            </span>
                          </div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            HTTP / 1.1 Response
                          </span>
                        </div>

                        {/* Response Body Block */}
                        <pre style={{
                          margin: 0,
                          padding: '0.85rem',
                          background: 'var(--bg-surface-hover)',
                          borderRadius: '6px',
                          border: '1px solid var(--border-glass)',
                          color: 'var(--text-primary)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.82rem',
                          maxHeight: '240px',
                          overflowY: 'auto',
                          whiteSpace: 'pre-wrap'
                        }}>
                          {typeof testResult.data === 'object' ? JSON.stringify(testResult.data, null, 2) : String(testResult.data)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
