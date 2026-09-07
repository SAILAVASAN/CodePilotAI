import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Bot, Send, Info, Search, Terminal, ChevronDown, ChevronUp } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';
import Modal from './ui/Modal';

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
        isCodeBlock = false;
        renderedElements.push(
          <pre key={`pre-${keyIdx++}`}>
            <code>{codeBlockBuffer.join('\n')}</code>
          </pre>
        );
        codeBlockBuffer = [];
      } else {
        isCodeBlock = true;
      }
      continue;
    }

    if (isCodeBlock) {
      codeBlockBuffer.push(line);
      continue;
    }

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

    if (line.startsWith('- ') || line.startsWith('* ')) {
      renderedElements.push(
        <ul key={`ul-${keyIdx++}`}>
          <li>{renderInlineStyles(line.substring(2))}</li>
        </ul>
      );
      continue;
    }

    const numListMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (numListMatch) {
      renderedElements.push(
        <ol key={`ol-${keyIdx++}`} start={numListMatch[1]}>
          <li>{renderInlineStyles(numListMatch[2])}</li>
        </ol>
      );
      continue;
    }

    if (line.trim() !== '') {
      renderedElements.push(<p key={`p-${keyIdx++}`}>{renderInlineStyles(line)}</p>);
    }
  }

  return renderedElements;
}

const EXAMPLE_PROMPTS = [
  { icon: Info, color: 'text-accent', text: 'Explain the directory architecture of this project.' },
  { icon: Search, color: 'text-primary', text: 'Where is the main entry point or routing configured?' },
  { icon: Terminal, color: 'text-success', text: 'What external packages or dependencies are imported?' },
  { icon: Terminal, color: 'text-warning', text: 'Run tests in this repository and report if anything fails.' },
];

export default function AgentChat({ repoId, onSelectCitation }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState({});
  const [viewingToolResult, setViewingToolResult] = useState(null);

  const chatEndRef = useRef(null);

  const loadChatHistory = async () => {
    if (!repoId) return;
    try {
      const response = await apiGet(`/api/repositories/${repoId}/chat-history`);
      if (response.ok) {
        const history = await response.json();
        setMessages(history);
      }
    } catch (e) {
      console.error('Error loading chat history:', e);
    }
  };

  useEffect(() => {
    loadChatHistory();
  }, [repoId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || thinking) return;

    const userMessage = input;
    setInput('');
    setThinking(true);

    setMessages((prev) => [...prev, { role: 'user', content: userMessage, created_at: new Date().toISOString() }]);

    try {
      const response = await apiPost('/api/agent/chat', { repo_id: repoId, message: userMessage });

      if (response.ok) {
        const data = await response.json();
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: data.answer,
          steps: data.steps,
          created_at: new Date().toISOString(),
        }]);
      } else {
        const errData = await response.json();
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: `Agent execution failed: ${errData.detail || 'Internal server error.'}`,
          created_at: new Date().toISOString(),
        }]);
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: 'Error communicating with the backend server. Make sure FastAPI server is running.',
        created_at: new Date().toISOString(),
      }]);
    } finally {
      setThinking(false);
    }
  };

  const toggleSteps = (idx) => {
    setExpandedSteps((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className="flex h-full flex-col bg-bg-base">
      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        {messages.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-text-muted">
            Ask any question about the codebase. Examples:
            <ul className="mt-4 flex list-none flex-col items-center gap-2">
              {EXAMPLE_PROMPTS.map(({ icon: Icon, color, text }, i) => (
                <li key={i} className="flex items-center gap-2">
                  <Icon size={14} className={color} />
                  "{text}"
                </li>
              ))}
            </ul>
          </div>
        )}

        {messages.map((m, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className={`max-w-[85%] rounded-xl px-5 py-4 text-[0.92rem] leading-relaxed ${
              m.role === 'user'
                ? 'ml-auto rounded-br-sm bg-primary text-white shadow-[0_4px_12px_var(--primary-glow)]'
                : 'rounded-bl-sm border border-border-glass bg-bg-surface text-text-primary shadow-card'
            }`}
          >
            {m.role === 'assistant' && m.steps && m.steps.length > 0 && (
              <div className="mb-3 overflow-hidden rounded-lg border border-border-glass bg-bg-surface-hover">
                <div
                  onClick={() => toggleSteps(idx)}
                  className="flex cursor-pointer items-center justify-between bg-bg-surface px-3.5 py-2.5 text-[0.82rem] font-bold text-primary"
                >
                  <span className="flex items-center gap-1.5">
                    <Bot size={14} />
                    Agent Execution Path ({m.steps.length} actions)
                  </span>
                  <span className="flex items-center gap-1 text-[0.7rem] text-text-muted">
                    {expandedSteps[idx] ? <>Hide <ChevronUp size={12} /></> : <>Show <ChevronDown size={12} /></>}
                  </span>
                </div>

                {expandedSteps[idx] && (
                  <div className="flex flex-col gap-3 border-t border-border-glass p-3">
                    {m.steps.map((step, sIdx) => (
                      <div key={sIdx} className="border-l-2 border-primary pl-3 text-[0.85rem]">
                        <div className="mb-1 italic text-text-secondary">Thought: {step.thought}</div>
                        {step.tool && (
                          <div className="mt-0.5">
                            <span className="inline-block rounded bg-black/30 px-2 py-0.5 font-mono text-accent">
                              Action: {step.tool}({JSON.stringify(step.args)})
                            </span>
                            {step.result && (
                              <span
                                onClick={() => setViewingToolResult(step)}
                                className="mt-1 block cursor-pointer text-[0.75rem] text-success underline"
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

            <div className="markdown-body">
              {m.role === 'user' ? m.content : parseMarkdown(m.content, onSelectCitation)}
            </div>
          </motion.div>
        ))}

        {thinking && (
          <div className="max-w-[85%] rounded-xl rounded-bl-sm border border-border-glass bg-bg-surface px-5 py-4 shadow-card">
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <Bot size={14} />
              <span>Agent is executing tools</span>
              <div className="thinking-dots">
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <form onSubmit={handleSend} className="flex items-center gap-3 border-t border-border-glass bg-bg-surface px-6 py-4">
        <input
          type="text"
          placeholder="Ask a question about the repository..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={thinking}
          className="h-11 flex-1 rounded-lg border border-border-glass bg-bg-input px-4 text-sm text-text-primary outline-none transition-shadow focus:border-primary focus:shadow-[0_0_8px_var(--primary-glow)]"
        />
        <button
          type="submit"
          disabled={thinking}
          className="flex h-11 w-[70px] items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-hover text-white shadow-[0_4px_12px_var(--primary-glow)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          <Send size={16} strokeWidth={2.5} />
        </button>
      </form>

      <Modal
        open={!!viewingToolResult}
        onClose={() => setViewingToolResult(null)}
        title={viewingToolResult ? `Output for ${viewingToolResult.tool}(${JSON.stringify(viewingToolResult.args)})` : ''}
      >
        {viewingToolResult?.result}
      </Modal>
    </div>
  );
}
