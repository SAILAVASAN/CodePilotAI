import React, { useState } from 'react';

export default function ArchDiagram({ onSelectFile }) {
  const [activeCategory, setActiveCategory] = useState('ALL');

  // Frontend Nodes (4 items)
  const frontendNodes = [
    {
      id: 'app_jsx',
      title: 'App.jsx',
      layer: 'FRONTEND',
      tech: 'React 19 / Vite',
      role: 'Root UI Shell & Tab Router',
      description: 'Manages workspace views, themes, session state, and split pane layout.',
      file: 'frontend/src/App.jsx',
      line: '1',
      color: '#2563eb',
      badgeBg: 'rgba(37, 99, 235, 0.12)',
      badgeText: '#2563eb'
    },
    {
      id: 'agent_chat',
      title: 'AgentChat.jsx',
      layer: 'FRONTEND',
      tech: 'React 19 / Markdown',
      role: 'Developer Q&A Interface',
      description: 'Executes live agent chat, step paths, codeblocks, and citation line jumps.',
      file: 'frontend/src/components/AgentChat.jsx',
      line: '1',
      color: '#2563eb',
      badgeBg: 'rgba(37, 99, 235, 0.12)',
      badgeText: '#2563eb'
    },
    {
      id: 'api_list',
      title: 'APIList.jsx',
      layer: 'FRONTEND',
      tech: 'React 19 / OpenAPI',
      role: 'API Discovery & Tester',
      description: 'Discovers endpoints statically from regex and provides an interactive tester.',
      file: 'frontend/src/components/APIList.jsx',
      line: '1',
      color: '#2563eb',
      badgeBg: 'rgba(37, 99, 235, 0.12)',
      badgeText: '#2563eb'
    },
    {
      id: 'code_preview',
      title: 'CodePreview.jsx',
      layer: 'FRONTEND',
      tech: 'React 19 / Viewer',
      role: 'Editor & Line Highlight',
      description: 'Fetches raw file content, renders line numbers, and auto-scrolls to citations.',
      file: 'frontend/src/components/CodePreview.jsx',
      line: '1',
      color: '#2563eb',
      badgeBg: 'rgba(37, 99, 235, 0.12)',
      badgeText: '#2563eb'
    }
  ];

  // Backend Nodes (4 items)
  const backendNodes = [
    {
      id: 'app_py',
      title: 'app.py',
      layer: 'BACKEND',
      tech: 'Python / FastAPI',
      role: 'REST API Server & Router',
      description: 'Defines FastAPI endpoints for ingestion, chat, file retrieval, and auth.',
      file: 'backend/app.py',
      line: '32',
      color: '#059669',
      badgeBg: 'rgba(5, 150, 105, 0.12)',
      badgeText: '#059669'
    },
    {
      id: 'agent_py',
      title: 'agent.py',
      layer: 'BACKEND',
      tech: 'Python / Gemini AI',
      role: 'Agent Reasoning Loop',
      description: 'ReAct multi-step reasoning (max 6 steps), tool dispatching, and context caps.',
      file: 'backend/agent.py',
      line: '34',
      color: '#7c3aed',
      badgeBg: 'rgba(124, 58, 237, 0.12)',
      badgeText: '#7c3aed'
    },
    {
      id: 'rag_py',
      title: 'rag.py',
      layer: 'BACKEND',
      tech: 'Python / AST Engine',
      role: 'AST Code Chunker & Vector RAG',
      description: 'Parses Python AST nodes (`ClassDef`, `FunctionDef`), regex patterns, and embeddings.',
      file: 'backend/rag.py',
      line: '51',
      color: '#7c3aed',
      badgeBg: 'rgba(124, 58, 237, 0.12)',
      badgeText: '#7c3aed'
    },
    {
      id: 'run_tests_py',
      title: 'run_tests.py',
      layer: 'BACKEND',
      tech: 'Python / Subprocess',
      role: 'Automated Test Runner',
      description: 'Detects `npm test`, `pytest`, `cargo`, `mvn`, `unittest` and runs in subprocesses.',
      file: 'backend/run_tests.py',
      line: '8',
      color: '#d97706',
      badgeBg: 'rgba(217, 119, 6, 0.12)',
      badgeText: '#d97706'
    }
  ];

  // Database Nodes (4 items)
  const databaseNodes = [
    {
      id: 'tbl_chunks',
      title: 'chunks (Vector Store)',
      layer: 'DATABASE',
      tech: 'SQLite BLOB / Vectors',
      role: 'AST Chunks & Embeddings',
      description: 'Stores AST code snippets, line bounds, and 768-dim float32 binary BLOB embeddings.',
      file: 'backend/db.py',
      line: '56',
      color: '#db2777',
      badgeBg: 'rgba(219, 39, 119, 0.12)',
      badgeText: '#db2777'
    },
    {
      id: 'tbl_repositories',
      title: 'repositories Table',
      layer: 'DATABASE',
      tech: 'SQLite / Relational',
      role: 'Project Metadata & State',
      description: 'Tracks repository name, Git URL, local path, ingestion status, and error logs.',
      file: 'backend/db.py',
      line: '30',
      color: '#db2777',
      badgeBg: 'rgba(219, 39, 119, 0.12)',
      badgeText: '#db2777'
    },
    {
      id: 'tbl_files',
      title: 'files Table',
      layer: 'DATABASE',
      tech: 'SQLite / FK Cascade',
      role: 'Source Content Index',
      description: 'Stores full text content, relative path, language, and byte size with CASCADE delete.',
      file: 'backend/db.py',
      line: '43',
      color: '#db2777',
      badgeBg: 'rgba(219, 39, 119, 0.12)',
      badgeText: '#db2777'
    },
    {
      id: 'tbl_chat_history',
      title: 'chat_history & users',
      layer: 'DATABASE',
      tech: 'SQLite / JSON Logs',
      role: 'Chat Log & User Profiles',
      description: 'Persists developer messages, agent step JSON arrays, and user auth accounts.',
      file: 'backend/db.py',
      line: '73',
      color: '#db2777',
      badgeBg: 'rgba(219, 39, 119, 0.12)',
      badgeText: '#db2777'
    }
  ];

  const renderCardSection = (title, nodes, accentColor) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: accentColor }}></span>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          {title} ({nodes.length})
        </h3>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
        {nodes.map(node => (
          <div
            key={node.id}
            onClick={() => onSelectFile(node.file, node.line)}
            className="card-3d repo-item"
            style={{
              background: 'var(--bg-surface)',
              border: `1px solid var(--border-glass)`,
              borderLeft: `4px solid ${node.color}`,
              borderRadius: '10px',
              padding: '1.1rem',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '165px',
              boxShadow: 'var(--shadow-card)',
              boxSizing: 'border-box'
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {node.title}
                </span>

                <span style={{
                  fontSize: '0.65rem',
                  fontWeight: 800,
                  color: node.badgeText,
                  background: node.badgeBg,
                  padding: '0.15rem 0.45rem',
                  borderRadius: '4px',
                  border: `1px solid ${node.color}35`,
                  whiteSpace: 'nowrap'
                }}>
                  {node.layer}
                </span>
              </div>

              <div style={{ fontSize: '0.78rem', color: 'var(--primary)', fontWeight: 600 }}>
                {node.role}
              </div>

              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {node.description}
              </div>
            </div>

            <div style={{ marginTop: '0.8rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem' }}>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontWeight: 500 }}>{node.tech}</span>
              <span style={{ color: 'var(--primary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                Jump to Code →
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ padding: '1.25rem', height: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto' }}>
      
      {/* Header Banner */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-glass)',
        borderRadius: '12px',
        padding: '1.25rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.75rem',
        boxShadow: 'var(--shadow-card)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{
              background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))',
              color: '#fff',
              fontWeight: 800,
              fontSize: '0.72rem',
              padding: '0.25rem 0.6rem',
              borderRadius: '6px',
              letterSpacing: '0.5px'
            }}>
              SYSTEM ARCHITECTURE
            </span>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              Architecture & Dependency Map
            </h2>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.35rem', margin: 0 }}>
            Module overview across frontend components, backend services, and database storage.
          </p>
        </div>

        {/* Layer Filter Buttons */}
        <div style={{ display: 'flex', gap: '0.4rem', background: 'var(--bg-input)', padding: '0.25rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
          {['ALL', 'FRONTEND', 'BACKEND', 'DATABASE'].map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                background: activeCategory === cat ? 'var(--bg-surface)' : 'transparent',
                boxShadow: activeCategory === cat ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
                border: 'none',
                color: activeCategory === cat ? 'var(--text-primary)' : 'var(--text-secondary)',
                padding: '0.35rem 0.85rem',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'var(--transition-smooth)'
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid Sections based on active category filter */}
      {(activeCategory === 'ALL' || activeCategory === 'FRONTEND') && (
        renderCardSection('Frontend Architecture (React 19 & Vite)', frontendNodes, '#2563eb')
      )}

      {(activeCategory === 'ALL' || activeCategory === 'BACKEND') && (
        renderCardSection('Backend Services & Agent Engine (FastAPI)', backendNodes, '#059669')
      )}

      {(activeCategory === 'ALL' || activeCategory === 'DATABASE') && (
        renderCardSection('Database & Storage Layer (SQLite + NumPy Blobs)', databaseNodes, '#db2777')
      )}
    </div>
  );
}
