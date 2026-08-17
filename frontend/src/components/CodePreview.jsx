import React, { useState, useEffect, useRef } from 'react';

export default function CodePreview({ repoId, filePath, highlightLineRange, onClose }) {
  const [fileData, setFileData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    if (!repoId || !filePath) {
      setFileData(null);
      return;
    }

    const fetchFileContent = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`http://localhost:8000/api/repositories/${repoId}/file?path=${encodeURIComponent(filePath)}`);
        if (response.ok) {
          const data = await response.json();
          setFileData(data);
        } else {
          setError(`Failed to retrieve content for file: ${filePath}`);
        }
      } catch (err) {
        console.error(err);
        setError("Error connecting to backend server.");
      } finally {
        setLoading(false);
      }
    };

    fetchFileContent();
  }, [repoId, filePath]);

  // Scroll to highlighted lines if specified
  useEffect(() => {
    if (highlightLineRange && containerRef.current && fileData) {
      const [startLine] = highlightLineRange.split('-').map(Number);
      if (startLine) {
        // Find line element
        const lineEl = containerRef.current.querySelector(`#line-${startLine}`);
        if (lineEl) {
          lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }, [highlightLineRange, fileData]);

  if (loading) {
    return <div style={{padding: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem'}}>Reading codebase file...</div>;
  }

  if (error) {
    return <div style={{padding: '1.5rem', color: 'var(--danger)', fontSize: '0.85rem'}}>{error}</div>;
  }

  if (!fileData) {
    return (
      <div style={{
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100%', 
        color: 'var(--text-muted)',
        fontSize: '0.9rem',
        textAlign: 'center',
        padding: '2rem'
      }}>
        Select a file from the explorer tree or click on an agent codebase citation to inspect code.
      </div>
    );
  }

  const lines = fileData.content.split('\n');

  // Check if a line number is within the highlighted range
  const isLineHighlighted = (lineNum) => {
    if (!highlightLineRange) return false;
    const parts = highlightLineRange.split('-');
    if (parts.length === 1) {
      return lineNum === Number(parts[0]);
    } else if (parts.length === 2) {
      const start = Number(parts[0]);
      const end = Number(parts[1]);
      return lineNum >= start && lineNum <= end;
    }
    return false;
  };

  return (
    <div className="code-preview-container" ref={containerRef}>
      <div className="code-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className="code-title">{fileData.file_path}</span>
          <span style={{fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase'}}>{fileData.language}</span>
        </div>
        {onClose && (
          <button 
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: 'bold',
              padding: '0.2rem 0.5rem',
              borderRadius: '4px',
              transition: 'var(--transition-smooth)'
            }}
            className="btn-close"
          >
            ✕
          </button>
        )}
      </div>
      
      <div className="code-editor">
        {lines.map((line, idx) => {
          const lineNum = idx + 1;
          const highlighted = isLineHighlighted(lineNum);
          return (
            <div 
              key={lineNum} 
              id={`line-${lineNum}`}
              className="code-line"
              style={{
                background: highlighted ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
                borderLeft: highlighted ? '3px solid var(--primary)' : '3px solid transparent'
              }}
            >
              <span className="code-line-number" style={{color: highlighted ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: highlighted ? 700 : 400}}>
                {lineNum}
              </span>
              <span className="code-line-content">
                {line || ' '}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
