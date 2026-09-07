import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';

export default function ArchDiagram({ onSelectFile }) {
  const [activeCategory, setActiveCategory] = useState('ALL');

  const frontendNodes = [
    {
      id: 'app_jsx', title: 'App.jsx', layer: 'FRONTEND', tech: 'React 19 / Vite',
      role: 'Root UI Shell & Tab Router',
      description: 'Manages workspace views, themes, session state, and split pane layout.',
      file: 'frontend/src/App.jsx', line: '1', color: '#2563eb',
    },
    {
      id: 'agent_chat', title: 'AgentChat.jsx', layer: 'FRONTEND', tech: 'React 19 / Markdown',
      role: 'Developer Q&A Interface',
      description: 'Executes live agent chat, step paths, codeblocks, and citation line jumps.',
      file: 'frontend/src/components/AgentChat.jsx', line: '1', color: '#2563eb',
    },
    {
      id: 'api_list', title: 'APIList.jsx', layer: 'FRONTEND', tech: 'React 19 / OpenAPI',
      role: 'API Discovery & Tester',
      description: 'Discovers endpoints statically from regex and provides an interactive tester.',
      file: 'frontend/src/components/APIList.jsx', line: '1', color: '#2563eb',
    },
    {
      id: 'code_preview', title: 'CodePreview.jsx', layer: 'FRONTEND', tech: 'React 19 / Viewer',
      role: 'Editor & Line Highlight',
      description: 'Fetches raw file content, renders line numbers, and auto-scrolls to citations.',
      file: 'frontend/src/components/CodePreview.jsx', line: '1', color: '#2563eb',
    },
  ];

  const backendNodes = [
    {
      id: 'app_py', title: 'app.py', layer: 'BACKEND', tech: 'Python / FastAPI',
      role: 'REST API Server & Router',
      description: 'Defines FastAPI endpoints for ingestion, chat, file retrieval, and auth.',
      file: 'backend/app.py', line: '32', color: '#059669',
    },
    {
      id: 'agent_py', title: 'agent.py', layer: 'BACKEND', tech: 'Python / Gemini AI',
      role: 'Agent Reasoning Loop',
      description: 'ReAct multi-step reasoning (max 6 steps), tool dispatching, and context caps.',
      file: 'backend/agent.py', line: '34', color: '#7c3aed',
    },
    {
      id: 'rag_py', title: 'rag.py', layer: 'BACKEND', tech: 'Python / AST Engine',
      role: 'AST Code Chunker & Vector RAG',
      description: "Parses Python AST nodes (ClassDef, FunctionDef), regex patterns, and embeddings.",
      file: 'backend/rag.py', line: '51', color: '#7c3aed',
    },
    {
      id: 'run_tests_py', title: 'run_tests.py', layer: 'BACKEND', tech: 'Python / Subprocess',
      role: 'Automated Test Runner',
      description: 'Detects npm test, pytest, cargo, mvn, unittest and runs in subprocesses.',
      file: 'backend/run_tests.py', line: '8', color: '#d97706',
    },
  ];

  const databaseNodes = [
    {
      id: 'tbl_chunks', title: 'chunks (Vector Store)', layer: 'DATABASE', tech: 'SQLite BLOB / Vectors',
      role: 'AST Chunks & Embeddings',
      description: 'Stores AST code snippets, line bounds, and 768-dim float32 binary BLOB embeddings.',
      file: 'backend/db.py', line: '56', color: '#db2777',
    },
    {
      id: 'tbl_repositories', title: 'repositories Table', layer: 'DATABASE', tech: 'SQLite / Relational',
      role: 'Project Metadata & State',
      description: 'Tracks repository name, Git URL, local path, ingestion status, and error logs.',
      file: 'backend/db.py', line: '30', color: '#db2777',
    },
    {
      id: 'tbl_files', title: 'files Table', layer: 'DATABASE', tech: 'SQLite / FK Cascade',
      role: 'Source Content Index',
      description: 'Stores full text content, relative path, language, and byte size with CASCADE delete.',
      file: 'backend/db.py', line: '43', color: '#db2777',
    },
    {
      id: 'tbl_chat_history', title: 'chat_history & users', layer: 'DATABASE', tech: 'SQLite / JSON Logs',
      role: 'Chat Log & User Profiles',
      description: 'Persists developer messages, agent step JSON arrays, and user auth accounts.',
      file: 'backend/db.py', line: '73', color: '#db2777',
    },
  ];

  const renderCardSection = (title, nodes, accentColor) => (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accentColor }} />
        <h3 className="font-heading text-[0.95rem] font-bold text-text-primary">
          {title} ({nodes.length})
        </h3>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {nodes.map((node) => (
          <motion.div
            key={node.id}
            onClick={() => onSelectFile(node.file, node.line)}
            whileHover={{ y: -4 }}
            className="flex min-h-[165px] cursor-pointer flex-col justify-between rounded-[10px] border border-border-glass bg-bg-surface p-4 shadow-card"
            style={{ borderLeft: `4px solid ${node.color}` }}
          >
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-heading text-sm font-bold text-text-primary">{node.title}</span>
                <span
                  className="shrink-0 rounded border px-1.5 py-0.5 text-[0.65rem] font-extrabold whitespace-nowrap"
                  style={{ color: node.color, backgroundColor: `${node.color}1f`, borderColor: `${node.color}35` }}
                >
                  {node.layer}
                </span>
              </div>

              <div className="text-[0.78rem] font-semibold text-primary">{node.role}</div>

              <div className="line-clamp-2 text-[0.75rem] leading-relaxed text-text-secondary">
                {node.description}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-border-glass pt-2 text-[0.72rem]">
              <span className="font-mono font-medium text-text-muted">{node.tech}</span>
              <span className="flex items-center gap-1 font-bold text-primary">
                Jump to Code <ArrowRight size={11} />
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-glass bg-bg-surface p-5 shadow-card">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="rounded-md bg-gradient-to-br from-primary to-primary-hover px-2.5 py-1 text-xs font-extrabold tracking-wide text-white">
              SYSTEM ARCHITECTURE
            </span>
            <h2 className="font-heading text-lg font-extrabold text-text-primary">Architecture &amp; Dependency Map</h2>
          </div>
          <p className="mt-1.5 text-sm text-text-secondary">
            Module overview across frontend components, backend services, and database storage.
          </p>
        </div>

        <div className="flex gap-1 rounded-lg border border-border-glass bg-bg-input p-1">
          {['ALL', 'FRONTEND', 'BACKEND', 'DATABASE'].map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`rounded-md px-3.5 py-1.5 text-[0.78rem] font-bold transition-colors ${
                activeCategory === cat ? 'bg-bg-surface text-text-primary shadow-sm' : 'text-text-secondary'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {(activeCategory === 'ALL' || activeCategory === 'FRONTEND') &&
        renderCardSection('Frontend Architecture (React 19 & Vite)', frontendNodes, '#2563eb')}

      {(activeCategory === 'ALL' || activeCategory === 'BACKEND') &&
        renderCardSection('Backend Services & Agent Engine (FastAPI)', backendNodes, '#059669')}

      {(activeCategory === 'ALL' || activeCategory === 'DATABASE') &&
        renderCardSection('Database & Storage Layer (SQLite + NumPy Blobs)', databaseNodes, '#db2777')}
    </div>
  );
}
