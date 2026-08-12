import React from 'react';

export default function ArchDiagram({ onSelectFile }) {
  
  // Custom nodes mapping to actual codebase files in this project
  const nodes = [
    {
      id: 'auth',
      title: 'auth.py',
      label: 'Gemini Keys / API Route Protection',
      role: 'middleware',
      file: 'backend/app.py',
      line: '33',
      color: '#f59e0b', // Yellow
      x: 30, y: 50
    },
    {
      id: 'app',
      title: 'app.py',
      label: 'FastAPI Router & Endpoints',
      role: 'router',
      file: 'backend/app.py',
      line: '1',
      color: '#3b82f6', // Blue
      x: 200, y: 150
    },
    {
      id: 'rag',
      title: 'rag.py',
      label: 'AST Chunks & Vector Search',
      role: 'service',
      file: 'backend/rag.py',
      line: '1',
      color: '#8b5cf6', // Purple
      x: 370, y: 50
    },
    {
      id: 'db',
      title: 'db.py',
      label: 'SQLite / Blob Embeddings Storage',
      role: 'database',
      file: 'backend/db.py',
      line: '13',
      color: '#ec4899', // Pink
      x: 370, y: 250
    }
  ];

  return (
    <div style={{ padding: '1.25rem', height: '100%', display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative' }}>
      <div>
        <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>
          ROUTE TRACE / 0048
        </h3>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Interactive logical path map. Click on any block to preview file.</p>
      </div>

      <div style={{ flex: 1, background: 'rgba(0, 0, 0, 0.2)', border: '1px solid var(--border-glass)', borderRadius: '12px', position: 'relative', overflow: 'hidden' }}>
        
        {/* SVG Connector Lines */}
        <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none' }}>
          {/* Node 1 to 2 */}
          <path d="M 115 95 Q 160 95 160 140 T 200 175" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeDasharray="4,4" />
          {/* Node 2 to 3 */}
          <path d="M 285 175 Q 320 175 320 120 T 370 95" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeDasharray="4,4" />
          {/* Node 2 to 4 */}
          <path d="M 285 175 Q 320 175 320 230 T 370 295" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeDasharray="4,4" />
        </svg>

        {/* Nodes Grid */}
        {nodes.map(n => (
          <div 
            key={n.id}
            onClick={() => onSelectFile(n.file, n.line)}
            style={{
              position: 'absolute',
              left: `${n.x}px`,
              top: `${n.y}px`,
              width: '140px',
              padding: '0.75rem',
              background: 'rgba(15, 23, 42, 0.85)',
              border: `1px solid ${n.color}`,
              borderRadius: '8px',
              cursor: 'pointer',
              zIndex: 5,
              boxShadow: `0 4px 15px rgba(0,0,0,0.5)`,
              transition: 'var(--transition-smooth)'
            }}
            className="repo-item"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: n.color }}></span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: '#fff' }}>
                {n.title}
              </span>
            </div>
            
            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', lineHeight: '1.3' }}>
              {n.label}
            </div>
          </div>
        ))}

        {/* Legend */}
        <div style={{ position: 'absolute', bottom: '1rem', left: '1rem', display: 'flex', gap: '0.75rem', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#f59e0b' }}></span> Gatekeeper
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#3b82f6' }}></span> Endpoint
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#8b5cf6' }}></span> Logic
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ec4899' }}></span> DB
          </span>
        </div>
      </div>
    </div>
  );
}
