import { useState, useEffect, useRef } from 'react';
import { X, FileSearch } from 'lucide-react';
import { apiGet } from '../lib/api';

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
        const response = await apiGet(`/api/repositories/${repoId}/file?path=${encodeURIComponent(filePath)}`);
        if (response.ok) {
          const data = await response.json();
          setFileData(data);
        } else {
          setError(`Failed to retrieve content for file: ${filePath}`);
        }
      } catch (err) {
        console.error(err);
        setError('Error connecting to backend server.');
      } finally {
        setLoading(false);
      }
    };

    fetchFileContent();
  }, [repoId, filePath]);

  useEffect(() => {
    if (highlightLineRange && containerRef.current && fileData) {
      const [startLine] = highlightLineRange.split('-').map(Number);
      if (startLine) {
        const lineEl = containerRef.current.querySelector(`#line-${startLine}`);
        if (lineEl) {
          lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }, [highlightLineRange, fileData]);

  if (loading) {
    return <div className="p-6 text-sm text-text-secondary">Reading codebase file...</div>;
  }

  if (error) {
    return <div className="p-6 text-sm text-danger">{error}</div>;
  }

  if (!fileData) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm text-text-muted">
        <FileSearch size={28} strokeWidth={1.5} className="text-primary" />
        Select a file from the explorer tree or click on an agent codebase citation to inspect code.
      </div>
    );
  }

  const lines = fileData.content.split('\n');

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
    <div className="flex h-full flex-col" ref={containerRef}>
      <div className="flex items-center justify-between border-b border-border-glass bg-bg-surface px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm text-accent">{fileData.file_path}</span>
          <span className="text-[0.7rem] text-text-muted uppercase">{fileData.language}</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded p-1 text-text-secondary transition-colors hover:text-text-primary"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto whitespace-pre bg-bg-surface-hover p-4 font-mono text-[0.85rem] leading-relaxed text-text-primary">
        {lines.map((line, idx) => {
          const lineNum = idx + 1;
          const highlighted = isLineHighlighted(lineNum);
          return (
            <div
              key={lineNum}
              id={`line-${lineNum}`}
              className={`flex border-l-[3px] ${highlighted ? 'border-primary bg-indigo-500/25' : 'border-transparent'}`}
            >
              <span
                className={`w-[45px] shrink-0 border-r border-white/5 pr-5 text-right select-none ${
                  highlighted ? 'font-bold text-text-primary' : 'text-text-muted'
                }`}
              >
                {lineNum}
              </span>
              <span className="flex-1 pl-5">{line || ' '}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
