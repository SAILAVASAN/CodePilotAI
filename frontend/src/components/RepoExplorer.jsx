import { useState, useEffect } from 'react';
import { ChevronRight, Folder, File as FileIcon } from 'lucide-react';
import { apiGet } from '../lib/api';

// Helper to construct tree from flat paths
function buildFileTree(files) {
  const root = { name: 'root', type: 'dir', children: {} };

  files.forEach((file) => {
    const parts = file.file_path.split('/');
    let current = root;

    parts.forEach((part, index) => {
      const isLast = index === parts.length - 1;

      if (isLast) {
        current.children[part] = {
          name: part,
          path: file.file_path,
          type: 'file',
          language: file.language,
          size: file.size_bytes,
        };
      } else {
        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            path: parts.slice(0, index + 1).join('/'),
            type: 'dir',
            children: {},
          };
        }
        current = current.children[part];
      }
    });
  });

  return root;
}

export default function RepoExplorer({ repoId, activeFilePath, onSelectFile }) {
  const [tree, setTree] = useState(null);
  const [expandedDirs, setExpandedDirs] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!repoId) return;

    const loadFiles = async () => {
      setLoading(true);
      try {
        const response = await apiGet(`/api/repositories/${repoId}/files`);
        if (response.ok) {
          const files = await response.json();
          const treeData = buildFileTree(files);
          setTree(treeData);

          const initialExpanded = {};
          Object.keys(treeData.children).forEach((k) => {
            if (treeData.children[k].type === 'dir') {
              initialExpanded[treeData.children[k].path] = true;
            }
          });
          setExpandedDirs(initialExpanded);
        }
      } catch (e) {
        console.error('Error loading files for explorer:', e);
      } finally {
        setLoading(false);
      }
    };

    loadFiles();
  }, [repoId]);

  const toggleExpand = (dirPath) => {
    setExpandedDirs((prev) => ({ ...prev, [dirPath]: !prev[dirPath] }));
  };

  const renderNode = (node, depth = 0) => {
    if (node.type === 'file') {
      const isActive = activeFilePath === node.path;
      return (
        <div
          key={node.path}
          onClick={() => onSelectFile(node.path)}
          style={{ paddingLeft: `${depth * 14 + 32}px` }}
          className={`flex cursor-pointer items-center gap-2 rounded py-1.5 pr-2 text-[0.85rem] transition-colors hover:bg-bg-surface-hover ${
            isActive ? 'bg-indigo-500/15 font-semibold text-white' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <FileIcon size={14} strokeWidth={2.5} className="shrink-0 text-text-secondary" />
          <span className="truncate">{node.name}</span>
        </div>
      );
    }

    const isExpanded = !!expandedDirs[node.path];
    const sortedKeys = Object.keys(node.children).sort((a, b) => {
      const aNode = node.children[a];
      const bNode = node.children[b];
      if (aNode.type !== bNode.type) {
        return aNode.type === 'dir' ? -1 : 1;
      }
      return a.localeCompare(b);
    });

    return (
      <div key={node.path || node.name}>
        {node.name !== 'root' && (
          <div
            onClick={() => toggleExpand(node.path)}
            style={{ paddingLeft: `${depth * 14 + 16}px` }}
            className="flex cursor-pointer items-center gap-1.5 rounded py-1.5 pr-2 text-[0.85rem] font-semibold text-text-primary transition-colors hover:bg-bg-surface-hover"
          >
            <ChevronRight
              size={14}
              strokeWidth={2.5}
              className={`shrink-0 text-text-muted transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
            />
            <Folder size={14} strokeWidth={2.5} className="shrink-0 text-primary" />
            <span className="truncate">{node.name}</span>
          </div>
        )}

        {(node.name === 'root' || isExpanded) && (
          <div>{sortedKeys.map((key) => renderNode(node.children[key], node.name === 'root' ? 0 : depth + 1))}</div>
        )}
      </div>
    );
  };

  if (loading) {
    return <div className="p-4 text-sm text-text-secondary">Loading directory structure...</div>;
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-3 pl-2 text-[0.85rem] font-bold tracking-wide text-text-secondary uppercase">Codebase Tree</div>
      {tree ? renderNode(tree) : (
        <div className="p-4 text-sm text-text-muted">Empty or uningested repository.</div>
      )}
    </div>
  );
}
