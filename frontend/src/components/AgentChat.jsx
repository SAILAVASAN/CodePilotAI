import React, { useState, useEffect, useRef } from 'react';

// Basic Markdown parser helper to render paragraphs, bullet lists, code blocks, and bold text
function parseMarkdown(text, onSelectCitation) {
  if (!text) return '';

  const citationRegex = /\[([a-zA-Z0-9_\-\.\/]+)(?::(\d+(?:-\d+)?))?\]/g;
  const lines = text.split('\n');
  const renderedElements = [];
  
  let keyIdx = 0;
  let codeBlockBuffer = [];
  let isCodeBlock = false;

  const renderInlineStyles = (txt) => {
    const boldParts = txt.split('**');
    const elements = [];
    
    boldParts.forEach((part, index) => {
      const isBold = index % 2 === 1;
      const codeParts = part.split('`');
      const inlineEls = [];
      
      codeParts.forEach((cPart, cIndex) => {
        const isInlineCode = cIndex % 2 === 1;
        const citationParts = [];
        let lastIndex = 0;
        let match;
        
        citationRegex.lastIndex = 0;
        
        while ((match = citationRegex.exec(cPart)) !== null) {
          const matchStart = match.index;
          const matchText = match[0];
          const filePath = match[1];
          const lineRange = match[2] || '';
          
          if (matchStart > lastIndex) {
            citationParts.push(cPart.substring(lastIndex, matchStart));
          }
          
          citationParts.push(
            <span 
              key={`cit-${keyIdx++}`} 
              className="citation-link" 
              onClick={() => onSelectCitation(filePath, lineRange)}
              title={`Click to view file: ${filePath} ${lineRange ? `lines ${lineRange}` : ''}`}
            >
              {matchText}
            </span>
          );
          
          lastIndex = citationRegex.lastIndex;
        }
        
        if (lastIndex < cPart.length) {
          citationParts.push(cPart.substring(lastIndex));
        }

        if (isInlineCode) {
          inlineEls.push(<code key={`code-${keyIdx++}`}>{citationParts}</code>);
        } else {
          inlineEls.push(...citationParts);
        }
      });

      if (isBold) {
        elements.push(<strong key={`bold-${keyIdx++}`}>{inlineEls}</strong>);
      } else {
        elements.push(...inlineEls);
      }
    });

    return elements;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      if (isCodeBlock) {
        // End of code block
        isCodeBlock = false;
        renderedElements.push(
          <pre key={`pre-${keyIdx++}`}>
            <code>{codeBlockBuffer.join('\n')}</code>
          </pre>
        );
        codeBlockBuffer = [];
      } else {
        // Start of code block
        isCodeBlock = true;
      }
      continue;
    }

    if (isCodeBlock) {
      codeBlockBuffer.push(line);
      continue;
    }

    // Headers (####, ###, ##, #)
    if (line.startsWith('#### ')) {
      renderedElements.push(<h4 key={`h4-${keyIdx++}`}>{renderInlineStyles(line.substring(5))}</h4>);
      continue;
    }
    if (line.startsWith('### ')) {
      renderedElements.push(<h3 key={`h3-${keyIdx++}`}>{renderInlineStyles(line.substring(4))}</h3>);
      continue;
    }
    if (line.startsWith('## ')) {
      renderedElements.push(<h2 key={`h2-${keyIdx++}`}>{renderInlineStyles(line.substring(3))}</h2>);
      continue;
    }
    if (line.startsWith('# ')) {
      renderedElements.push(<h1 key={`h1-${keyIdx++}`}>{renderInlineStyles(line.substring(2))}</h1>);
      continue;
    }

    // Bullet points
    if (line.startsWith('- ') || line.startsWith('* ')) {
      renderedElements.push(
        <ul key={`ul-${keyIdx++}`}>
          <li>{renderInlineStyles(line.substring(2))}</li>
        </ul>
      );
      continue;
    }

    // Numbered list
    const numListMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (numListMatch) {
      renderedElements.push(
        <ol key={`ol-${keyIdx++}`} start={numListMatch[1]}>
          <li>{renderInlineStyles(numListMatch[2])}</li>
        </ol>
      );
      continue;
    }

    // Paragraph
    if (line.trim() !== '') {
      renderedElements.push(<p key={`p-${keyIdx++}`}>{renderInlineStyles(line)}</p>);
    }
  }

  return renderedElements;
}

export default function AgentChat({ repoId, onSelectCitation }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState({});
  const [viewingToolResult, setViewingToolResult] = useState(null); // Holds step details for raw result view modal
  
  const chatEndRef = useRef(null);

  // Load chat history
  const loadChatHistory = async () => {
    if (!repoId) return;
    try {
      const response = await fetch(`http://localhost:8000/api/repositories/${repoId}/chat-history`);
      if (response.ok) {
        const history = await response.json();
        setMessages(history);
      }
    } catch (e) {
      console.error("Error loading chat history:", e);
    }
  };

  useEffect(() => {
    loadChatHistory();
  }, [repoId]);

  // Scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || thinking) return;

    const userMessage = input;
    setInput('');
    setThinking(true);
    
    // Add user message locally
    setMessages(prev => [...prev, { role: 'user', content: userMessage, created_at: new Date().toISOString() }]);

    try {
      const response = await fetch('http://localhost:8000/api/agent/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          repo_id: repoId,
          message: userMessage
        })
      });

      if (response.ok) {
        const data = await response.json();
        // Add assistant message
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.answer,
          steps: data.steps,
          created_at: new Date().toISOString()
        }]);
      } else {
        const errData = await response.json();
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Agent execution failed: ${errData.detail || 'Internal server error.'}`,
          created_at: new Date().toISOString()
        }]);
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Error communicating with the backend server. Make sure FastAPI server is running.",
        created_at: new Date().toISOString()
      }]);
    } finally {
      setThinking(false);
    }
  };

  const toggleSteps = (idx) => {
    setExpandedSteps(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div style={{color: 'var(--text-muted)', textAlign: 'center', padding: '3rem 1rem', fontSize: '0.9rem'}}>
            Ask any question about the codebase. Examples:
            <ul style={{listStyle: 'none', marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center'}}>
              <li style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: 'var(--accent)'}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg> "Explain the directory architecture of this project."</li>
              <li style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: 'var(--primary)'}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> "Where is the main entry point or routing configured?"</li>
              <li style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: 'var(--success)'}}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> "What external packages or dependencies are imported?"</li>
              <li style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: 'var(--warning)'}}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg> "Run tests in this repository and report if anything fails."</li>
            </ul>
          </div>
        )}

        {messages.map((m, idx) => (
          <div key={idx} className={`message-bubble ${m.role}`}>
            {m.role === 'assistant' && m.steps && m.steps.length > 0 && (
              <div className="agent-steps-container">
                <div className="agent-steps-header" onClick={() => toggleSteps(idx)}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>
                    Agent Execution Path ({m.steps.length} actions)
                  </span>
                  <span style={{fontSize: '0.7rem', color: 'var(--text-muted)'}}>{expandedSteps[idx] ? '▼ Hide' : '▲ Show'}</span>
                </div>
                
                {expandedSteps[idx] && (
                  <div className="agent-steps-body">
                    {m.steps.map((step, sIdx) => (
                      <div key={sIdx} className="agent-step-item">
                        <div className="step-thought">Thought: {step.thought}</div>
                        {step.tool && (
                          <div style={{marginTop: '0.2rem'}}>
                            <span className="step-action">Action: {step.tool}({JSON.stringify(step.args)})</span>
                            {step.result && (
                              <span 
                                className="step-result-summary"
                                onClick={() => setViewingToolResult(step)}
                              >
                                View Output Log
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            <div className="markdown-content">
              {m.role === 'user' ? m.content : parseMarkdown(m.content, onSelectCitation)}
            </div>
          </div>
        ))}

        {thinking && (
          <div className="message-bubble assistant">
            <div style={{color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>
              <span>Agent is executing tools</span>
              <div className="thinking-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <form onSubmit={handleSend} className="message-input-area">
        <input
          type="text"
          className="message-input"
          placeholder="Ask a question about the repository..."
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={thinking}
        />
        <button type="submit" className="btn-primary" style={{height: '44px', width: '70px', padding: 0}} disabled={thinking}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </form>

      {/* Raw Tool Output Modal */}
      {viewingToolResult && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '2rem'
        }} onClick={() => setViewingToolResult(null)}>
          <div style={{
            background: 'var(--bg-base)',
            border: '1px solid var(--border-glass)',
            borderRadius: '12px',
            width: '80%',
            maxWidth: '900px',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            overflow: 'hidden'
          }} onClick={e => e.stopPropagation()}>
            <div style={{
              padding: '1rem',
              borderBottom: '1px solid var(--border-glass)',
              display: 'flex',
              justifyContent: 'between',
              alignItems: 'center',
              background: 'rgba(255,255,255,0.02)'
            }}>
              <span style={{fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--accent)', fontWeight: 600}}>
                Output for {viewingToolResult.tool}({JSON.stringify(viewingToolResult.args)})
              </span>
              <button 
                style={{background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1rem', marginLeft: 'auto'}}
                onClick={() => setViewingToolResult(null)}
              >
                ✕ Close
              </button>
            </div>
            
            <div style={{
              padding: '1.25rem',
              overflow: 'auto',
              flex: 1,
              fontFamily: 'var(--font-mono)',
              fontSize: '0.85rem',
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.5
            }}>
              {viewingToolResult.result}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
