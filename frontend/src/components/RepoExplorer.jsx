import React, { useState, useEffect } from 'react';

// Helper to construct tree from flat paths
function buildFileTree(files) {
  const root = { name: 'root', type: 'dir', children: {} };

  files.forEach(file => {
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
          size: file.size_bytes
        };
      } else {
        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            path: parts.slice(0, index + 1).join('/'),
            type: 'dir',
            children: {}
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
        const response = await fetch(`http://localhost:8000/api/repositories/${repoId}/files`);
        if (response.ok) {
          const files = await response.json();
          const treeData = buildFileTree(files);
          setTree(treeData);
          
          // Auto expand root level dirs
          const initialExpanded = {};
          Object.keys(treeData.children).forEach(k => {
            if (treeData.children[k].type === 'dir') {
              initialExpanded[treeData.children[k].path] = true;
            }
          });
          setExpandedDirs(initialExpanded);
        }
      } catch (e) {
        console.error("Error loading files for explorer:", e);
      } finally {
        setLoading(false);
      }
    };

    loadFiles();
  }, [repoId]);

  const toggleExpand = (dirPath) => {
    setExpandedDirs(prev => ({
      ...prev,
      [dirPath]: !prev[dirPath]
    }));
  };

  const renderNode = (node, depth = 0) => {
    if (node.type === 'file') {
      const isActive = activeFilePath === node.path;
      return (
        <div 
          key={node.path} 
          className={`tree-node file ${isActive ? 'active' : ''}`}
          style={{ paddingLeft: `${depth * 14 + 16}px` }}
          onClick={() => onSelectFile(node.path)}
        >
          {/* File Icon */}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{color: 'var(--text-secondary)'}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span>{node.name}</span>
        </div>
      );
    }

    const isExpanded = !!expandedDirs[node.path];
    const sortedKeys = Object.keys(node.children).sort((a, b) => {
      // Directories first, then alphabetical
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
            className="tree-node dir" 
            style={{ paddingLeft: `${depth * 14}px`, display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, color: 'var(--text-primary)' }}
            onClick={() => toggleExpand(node.path)}
          >
            {/* Arrow Icon */}
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="14" 
              height="14" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2.5" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              style={{
                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.15s ease',
                color: 'var(--text-muted)'
              }}
            >
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            
            {/* Folder Icon */}
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{color: 'var(--primary)'}}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            
            <span>{node.name}</span>
          </div>
        )}
        
        {/* Children list */}
        {(node.name === 'root' || isExpanded) && (
          <div className="tree-children">
            {sortedKeys.map(key => renderNode(node.children[key], node.name === 'root' ? 0 : depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return <div style={{padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem'}}>Loading directory structure...</div>;
  }

  return (
    <div className="explorer-container">
      <div className="explorer-title">Codebase Tree</div>
      {tree ? renderNode(tree) : (
        <div style={{color: 'var(--text-muted)', fontSize: '0.85rem', padding: '1rem'}}>
          Empty or uningested repository.
        </div>
      )}
    </div>
  );
}
