import { useState, useEffect } from 'react';
import {
  Bug, Play, CheckCircle2, XCircle, AlertTriangle, ShieldCheck,
  FileCode, Sparkles, ArrowRight, RotateCcw, Check, RefreshCw,
  Layers, Terminal, MessageSquare, ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost } from '../lib/api';
import AgentChat from './AgentChat';

export default function DebuggerStudio({ repo, onSelectCitation }) {
  const [mode, setMode] = useState('studio'); // 'studio' | 'chat'
  const [errorMessage, setErrorMessage] = useState('');
  const [stackTrace, setStackTrace] = useState('');
  const [language, setLanguage] = useState('auto');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [currentSession, setCurrentSession] = useState(null);
  const [evidenceList, setEvidenceList] = useState([]);
  const [patches, setPatches] = useState([]);
  const [sessionsHistory, setSessionsHistory] = useState([]);
  const [patchApplying, setPatchApplying] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const repoId = repo?.id;

  // Load past debug sessions on mount or repo change
  useEffect(() => {
    if (repoId) {
      loadSessionsHistory();
    }
  }, [repoId]);

  const loadSessionsHistory = async () => {
    if (!repoId) return;
    try {
      const resp = await apiGet(`/api/repositories/${repoId}/debug-sessions`);
      if (resp.ok) {
        const data = await resp.json();
        setSessionsHistory(data);
      }
    } catch (e) {
      console.error('Failed to load debug sessions history:', e);
    }
  };

  const handleStartAnalysis = async () => {
    if (!errorMessage.trim() && !stackTrace.trim()) {
      toast.error('Please paste an error message or stack trace to investigate.');
      return;
    }

    setIsAnalyzing(true);
    setActiveStep(1);
    setTestResult(null);

    try {
      // Step 1: Create session
      const createResp = await apiPost('/api/debug/sessions', {
        repo_id: repoId,
        error_message: errorMessage || 'Runtime Exception',
        stack_trace: stackTrace,
        language: language === 'auto' ? null : language
      });

      if (!createResp.ok) {
        throw new Error('Failed to create debug session.');
      }

      const { session_id } = await createResp.json();
      setActiveStep(2);

      // Step 2 & 3: Run AI Investigation
      const analyzeResp = await apiPost(`/api/debug/sessions/${session_id}/analyze`, {});
      if (!analyzeResp.ok) {
        const err = await analyzeResp.json();
        throw new Error(err.detail || 'Investigation failed.');
      }

      setActiveStep(3);
      const data = await analyzeResp.json();

      // Step 4: Fetch complete session details
      const detailsResp = await apiGet(`/api/debug/sessions/${session_id}`);
      if (detailsResp.ok) {
        const details = await detailsResp.json();
        setCurrentSession(details.session);
        setEvidenceList(details.evidence || []);
        setPatches(details.patches || []);
      }

      setActiveStep(4);
      toast.success('Investigation completed with grounded repository evidence.');
      loadSessionsHistory();
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'Error occurred during investigation.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSelectPastSession = async (sessId) => {
    try {
      const resp = await apiGet(`/api/debug/sessions/${sessId}`);
      if (resp.ok) {
        const details = await resp.json();
        setCurrentSession(details.session);
        setEvidenceList(details.evidence || []);
        setPatches(details.patches || []);
        setErrorMessage(details.session.error_message || '');
        setStackTrace(details.session.stack_trace || '');
        setTestResult(null);
        setActiveStep(4);
        toast.info(`Loaded debug session #${sessId}`);
      }
    } catch (e) {
      toast.error('Failed to load session details.');
    }
  };

  const handleApplyPatch = async (patchId) => {
    setPatchApplying(true);
    try {
      const resp = await apiPost(`/api/patches/${patchId}/apply`, {});
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail || 'Failed to apply patch.');
      }
      const data = await resp.json();
      toast.success('Patch applied cleanly! Verification tests executed.');
      
      // Update patch state locally
      setPatches((prev) =>
        prev.map((p) => (p.id === patchId ? { ...p, status: 'applied' } : p))
      );
      if (data.verification_test) {
        setTestResult(data.verification_test);
      }
    } catch (e) {
      toast.error(e.message || 'Failed to apply patch.');
    } finally {
      setPatchApplying(false);
    }
  };

  const handleRollbackPatch = async (patchId) => {
    try {
      const resp = await apiPost(`/api/patches/${patchId}/rollback`, {});
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail || 'Rollback failed.');
      }
      toast.success('Patch rolled back to original file.');
      setPatches((prev) =>
        prev.map((p) => (p.id === patchId ? { ...p, status: 'proposed' } : p))
      );
      setTestResult(null);
    } catch (e) {
      toast.error(e.message || 'Rollback failed.');
    }
  };

  const fillExampleError = (type) => {
    if (type === 'js') {
      setErrorMessage("TypeError: Cannot read properties of undefined (reading 'name')");
      setStackTrace(
        "TypeError: Cannot read properties of undefined (reading 'name')\n" +
        "    at assignRider (rider.service.js:145:12)\n" +
        "    at processOrder (order.controller.js:89:5)"
      );
      setLanguage('javascript');
    } else {
      setErrorMessage("AttributeError: 'NoneType' object has no attribute 'get'");
      setStackTrace(
        "Traceback (most recent call last):\n" +
        "  File \"backend/services/rider.py\", line 145, in assign_rider\n" +
        "    return rider.get('name')\n" +
        "AttributeError: 'NoneType' object has no attribute 'get'"
      );
      setLanguage('python');
    }
  };

  if (!repo) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-text-muted">
        Select a repository to start debugging.
      </div>
    );
  }

  if (mode === 'chat') {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border-glass bg-bg-surface px-5 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-primary" />
            <span className="font-mono text-xs font-semibold uppercase text-text-primary">Interactive Codebase Chat</span>
          </div>
          <button
            onClick={() => setMode('studio')}
            className="flex items-center gap-1.5 rounded-lg border border-border-glass bg-bg-input px-3 py-1.5 text-xs font-medium text-text-primary hover:border-primary"
          >
            <Bug size={14} className="text-accent" />
            Switch to AI Debugger Studio
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <AgentChat repoId={repoId} onSelectCitation={onSelectCitation} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-bg-base text-text-primary">
      {/* Top Bar */}
      <div className="flex items-center justify-between border-b border-border-glass bg-bg-surface px-6 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent shadow-sm">
            <Bug size={18} />
          </div>
          <div>
            <h2 className="font-heading text-sm font-bold text-text-primary">AI Debugging Agent</h2>
            <div className="flex items-center gap-2 text-[0.75rem] text-text-secondary">
              <span>Ground-truth code investigation & surgical patch generation</span>
              <span>•</span>
              <span className="text-success font-medium">● Local Intelligence</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {sessionsHistory.length > 0 && (
            <select
              className="rounded-lg border border-border-glass bg-bg-input px-3 py-1.5 text-xs text-text-primary outline-none focus:border-primary"
              onChange={(e) => e.target.value && handleSelectPastSession(e.target.value)}
              defaultValue=""
            >
              <option value="" disabled>Past Investigations ({sessionsHistory.length})</option>
              {sessionsHistory.map((s) => (
                <option key={s.id} value={s.id}>
                  #{s.id}: {s.error_type || s.error_message?.slice(0, 30)}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={() => setMode('chat')}
            className="flex items-center gap-1.5 rounded-lg border border-border-glass bg-bg-input px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary hover:text-text-primary"
            title="Open freeform assistant chat"
          >
            <MessageSquare size={14} />
            Ask Freeform Chat
          </button>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-6 p-6 lg:grid-cols-12">
        {/* Left Column: Error Input & Progress (5 cols) */}
        <div className="flex flex-col gap-5 lg:col-span-5">
          {/* Error Input Box */}
          <div className="rounded-xl border border-border-glass bg-bg-surface p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-text-secondary">
                <Terminal size={14} className="text-primary" />
                Error & Stack Trace
              </label>
              <div className="flex items-center gap-1.5">
                <span className="text-[0.7rem] text-text-muted">Examples:</span>
                <button
                  type="button"
                  onClick={() => fillExampleError('js')}
                  className="rounded bg-bg-input px-2 py-0.5 text-[0.7rem] text-text-secondary hover:text-primary"
                >
                  JS/Node
                </button>
                <button
                  type="button"
                  onClick={() => fillExampleError('py')}
                  className="rounded bg-bg-input px-2 py-0.5 text-[0.7rem] text-text-secondary hover:text-primary"
                >
                  Python
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="Error message (e.g. TypeError: Cannot read properties of undefined...)"
                value={errorMessage}
                onChange={(e) => setErrorMessage(e.target.value)}
                className="rounded-lg border border-border-glass bg-bg-input px-3.5 py-2.5 font-mono text-xs text-text-primary outline-none focus:border-primary"
              />

              <textarea
                rows={7}
                placeholder="Paste complete stack trace, terminal output, or diagnostic logs..."
                value={stackTrace}
                onChange={(e) => setStackTrace(e.target.value)}
                className="rounded-lg border border-border-glass bg-bg-input p-3.5 font-mono text-xs text-text-primary outline-none focus:border-primary"
              />

              <div className="flex items-center justify-between gap-3 pt-1">
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="rounded-lg border border-border-glass bg-bg-input px-3 py-2 text-xs text-text-primary outline-none focus:border-primary"
                >
                  <option value="auto">Auto-detect Language</option>
                  <option value="javascript">JavaScript / TypeScript</option>
                  <option value="python">Python</option>
                  <option value="go">Go</option>
                  <option value="java">Java</option>
                  <option value="rust">Rust</option>
                </select>

                <button
                  onClick={handleStartAnalysis}
                  disabled={isAnalyzing}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-primary to-accent py-2.5 font-semibold text-xs text-white shadow-md transition-all hover:opacity-95 disabled:opacity-50"
                >
                  {isAnalyzing ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      Investigating Codebase...
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      Analyze & Propose Fix
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Investigation Stepper */}
          {(isAnalyzing || currentSession) && (
            <div className="rounded-xl border border-border-glass bg-bg-surface p-5 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 font-heading text-xs font-bold uppercase tracking-wider text-text-secondary">
                <Layers size={14} className="text-primary" />
                Investigation Pipeline
              </h3>
              <div className="flex flex-col gap-3 font-mono text-xs">
                {[
                  { step: 1, label: 'Parse Stack Trace & Diagnostic Frames' },
                  { step: 2, label: 'Retrieve Exact Source Lines & AST Symbols' },
                  { step: 3, label: 'Trace Callers, Callees & Dependencies' },
                  { step: 4, label: 'Local AI Root Cause & Surgical Patch' }
                ].map(({ step, label }) => {
                  const done = activeStep >= step;
                  const active = activeStep === step && isAnalyzing;
                  return (
                    <div
                      key={step}
                      className={`flex items-center gap-3 rounded-lg border p-2.5 transition-all ${
                        active
                          ? 'border-primary bg-primary/10 text-primary font-bold'
                          : done
                          ? 'border-success/30 bg-success/5 text-text-primary'
                          : 'border-transparent text-text-muted opacity-60'
                      }`}
                    >
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.7rem]">
                        {done && !active ? (
                          <CheckCircle2 size={16} className="text-success" />
                        ) : active ? (
                          <RefreshCw size={14} className="animate-spin text-primary" />
                        ) : (
                          <span className="text-text-muted">{step}</span>
                        )}
                      </div>
                      <span>{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Diagnosis, Evidence, Patch & Tests (7 cols) */}
        <div className="flex flex-col gap-5 lg:col-span-7">
          {!currentSession && !isAnalyzing ? (
            <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-xl border border-dashed border-border-glass bg-bg-surface/50 p-8 text-center text-text-muted">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Bug size={32} />
              </div>
              <h3 className="font-heading text-base font-bold text-text-primary">No Active Investigation</h3>
              <p className="mt-2 max-w-md text-xs leading-relaxed text-text-secondary">
                Paste an error message or terminal stack trace on the left and click <b>Analyze & Propose Fix</b>. 
                CodePilotAI will locate the exact failing function in your indexed repository, analyze callers, and propose a validated patch.
              </p>
            </div>
          ) : null}

          {/* Diagnosis Card */}
          {currentSession && (
            <div className="rounded-xl border border-border-glass bg-bg-surface p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between border-b border-border-glass pb-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-accent/20 px-2.5 py-1 font-mono text-xs font-bold text-accent">
                    {currentSession.error_type || 'Runtime Error'}
                  </span>
                  <span className="flex items-center gap-1 rounded-md bg-success/20 px-2.5 py-1 text-xs font-bold text-success">
                    <ShieldCheck size={14} />
                    {Math.round((currentSession.confidence || 0.85) * 100)}% Confidence
                  </span>
                </div>
                <span className="text-[0.7rem] text-text-muted">
                  Session #{currentSession.id} • {currentSession.status}
                </span>
              </div>

              <div className="flex flex-col gap-3">
                <div>
                  <h4 className="text-[0.7rem] font-bold uppercase tracking-wider text-text-muted">Identified Root Cause</h4>
                  <p className="mt-1 text-sm font-medium leading-relaxed text-text-primary">
                    {currentSession.root_cause || 'Investigating...'}
                  </p>
                </div>

                {currentSession.suggested_fix && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5">
                    <h4 className="text-[0.7rem] font-bold uppercase tracking-wider text-primary">Proposed Remediation</h4>
                    <p className="mt-1 text-xs leading-relaxed text-text-primary">
                      {currentSession.suggested_fix}
                    </p>
                  </div>
                )}

                {currentSession.recommended_tests && currentSession.recommended_tests.length > 0 && (
                  <div>
                    <h4 className="text-[0.7rem] font-bold uppercase tracking-wider text-text-muted">Recommended Test Cases</h4>
                    <ul className="mt-1.5 flex flex-col gap-1.5">
                      {currentSession.recommended_tests.map((tc, idx) => (
                        <li key={idx} className="flex items-center gap-2 text-xs text-text-secondary">
                          <Check size={13} className="text-success" />
                          <span>{tc}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Verified Evidence Cards */}
          {evidenceList.length > 0 && (
            <div className="rounded-xl border border-border-glass bg-bg-surface p-5 shadow-sm">
              <h3 className="mb-3 flex items-center justify-between font-heading text-xs font-bold uppercase tracking-wider text-text-secondary">
                <span className="flex items-center gap-1.5">
                  <FileCode size={14} className="text-primary" />
                  Grounded Code Evidence ({evidenceList.length})
                </span>
                <span className="text-[0.7rem] font-normal lowercase text-text-muted">click citation to preview file</span>
              </h3>

              <div className="flex max-h-60 flex-col gap-2.5 overflow-y-auto pr-1">
                {evidenceList.map((ev, i) => (
                  <div
                    key={ev.id || i}
                    onClick={() => onSelectCitation(ev.file_path, `${ev.start_line}-${ev.end_line}`)}
                    className="group cursor-pointer rounded-lg border border-border-glass bg-bg-input p-3 transition-colors hover:border-primary"
                  >
                    <div className="flex items-center justify-between font-mono text-xs">
                      <span className="font-semibold text-primary group-hover:underline">
                        {ev.file_path}:{ev.start_line}-{ev.end_line}
                      </span>
                      <span className="rounded bg-bg-surface px-1.5 py-0.5 text-[0.65rem] font-bold uppercase text-text-secondary">
                        {ev.evidence_type}
                      </span>
                    </div>
                    {ev.code_snippet && (
                      <pre className="mt-2 overflow-x-auto rounded bg-bg-base/80 p-2 font-mono text-[0.7rem] leading-tight text-text-muted">
                        <code>{ev.code_snippet}</code>
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Patch Diff & Approval Viewer */}
          {patches.length > 0 && (
            <div className="rounded-xl border border-border-glass bg-bg-surface p-5 shadow-sm">
              {patches.map((patch) => {
                const isApplied = patch.status === 'applied';
                return (
                  <div key={patch.id} className="flex flex-col gap-3">
                    <div className="flex items-center justify-between border-b border-border-glass pb-3">
                      <div>
                        <span className="font-mono text-xs font-bold text-text-primary">
                          Patch: {patch.file_path}
                        </span>
                        <div className="text-[0.7rem] text-text-muted">
                          Status: <span className={isApplied ? 'text-success font-bold' : 'text-accent font-bold'}>{patch.status.toUpperCase()}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isApplied ? (
                          <button
                            onClick={() => handleRollbackPatch(patch.id)}
                            className="flex items-center gap-1.5 rounded-lg border border-border-glass bg-bg-input px-3 py-1.5 text-xs font-semibold text-text-secondary hover:border-accent hover:text-accent"
                          >
                            <RotateCcw size={13} />
                            Rollback Fix
                          </button>
                        ) : (
                          <button
                            onClick={() => handleApplyPatch(patch.id)}
                            disabled={patchApplying}
                            className="flex items-center gap-1.5 rounded-lg bg-success px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
                          >
                            {patchApplying ? (
                              <>
                                <RefreshCw size={13} className="animate-spin" />
                                Applying...
                              </>
                            ) : (
                              <>
                                <Check size={14} strokeWidth={2.5} />
                                Approve & Apply Patch
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Diff viewer */}
                    <div className="max-h-72 overflow-y-auto rounded-lg border border-border-glass bg-bg-base font-mono text-xs leading-relaxed">
                      {patch.diff_content ? (
                        patch.diff_content.split('\n').map((line, idx) => {
                          const isAdd = line.startsWith('+') && !line.startsWith('+++');
                          const isDel = line.startsWith('-') && !line.startsWith('---');
                          const isHeader = line.startsWith('@@') || line.startsWith('---') || line.startsWith('+++');
                          return (
                            <div
                              key={idx}
                              className={`px-3 py-0.5 ${
                                isAdd
                                  ? 'bg-success/15 text-success'
                                  : isDel
                                  ? 'bg-accent/15 text-accent'
                                  : isHeader
                                  ? 'text-primary font-bold'
                                  : 'text-text-secondary'
                              }`}
                            >
                              {line}
                            </div>
                          );
                        })
                      ) : (
                        <div className="p-3 text-text-muted">Unified diff preview not available.</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Test Verification Block */}
          {testResult && (
            <div className="rounded-xl border border-border-glass bg-bg-surface p-5 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2 font-mono text-xs font-bold text-text-primary">
                  <Terminal size={14} className="text-primary" />
                  Verification Test Suite: {testResult.runner || 'Runner'}
                </span>
                <span
                  className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold ${
                    testResult.success ? 'bg-success/20 text-success' : 'bg-accent/20 text-accent'
                  }`}
                >
                  {testResult.success ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                  {testResult.success ? 'PASSED' : 'FAILED'}
                </span>
              </div>
              <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-bg-base p-3 font-mono text-[0.75rem] text-text-secondary">
                <code>{testResult.logs || testResult.message}</code>
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
