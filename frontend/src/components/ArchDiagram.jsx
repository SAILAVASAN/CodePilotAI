import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Waypoints, GitBranch, AlertTriangle, ArrowRight, ArrowDownRight,
  Layers, FileCode, CheckCircle2, ChevronRight, ShieldAlert, Sparkles, RefreshCw
} from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';

const CATEGORY_COLORS = {
  'Controllers & Routes': '#06b6d4',
  'Services & Core': '#8b5cf6',
  'Models & Schemas': '#ec4899',
  'Database & Storage': '#10b981',
  'Components & Views': '#3b82f6',
  'Tests': '#f59e0b',
  'General': '#64748b'
};

export default function ArchDiagram({ repoId, onSelectFile }) {
  const [depData, setDepData] = useState({ nodes: [], edges: [], total_relationships: 0 });
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [impactData, setImpactData] = useState(null);
  const [activeCategory, setActiveCategory] = useState('ALL');

  useEffect(() => {
    if (repoId) {
      loadDependencies();
    }
  }, [repoId]);

  const loadDependencies = async () => {
    setLoading(true);
    setSelectedNode(null);
    setImpactData(null);
    try {
      const resp = await apiGet(`/api/repositories/${repoId}/dependencies`);
      if (resp.ok) {
        const data = await resp.json();
        setDepData(data);
      }
    } catch (e) {
      console.error('Failed to load dependencies:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectNode = async (node) => {
    setSelectedNode(node);
    try {
      const resp = await apiPost(`/api/repositories/${repoId}/impact-analysis`, {
        file_path: node.file_path
      });
      if (resp.ok) {
        const data = await resp.json();
        setImpactData(data);
      }
    } catch (e) {
      console.error('Failed to load impact analysis:', e);
    }
  };

  const categories = ['ALL', ...new Set(depData.nodes.map((n) => n.category))];

  const filteredNodes = activeCategory === 'ALL'
    ? depData.nodes
    : depData.nodes.filter((n) => n.category === activeCategory);

  const groupedNodes = filteredNodes.reduce((acc, node) => {
    acc[node.category] = acc[node.category] || [];
    acc[node.category].push(node);
    return acc;
  }, {});

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-bg-base p-6 text-text-primary">
      {/* Top Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-border-glass pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Waypoints size={16} />
            </div>
            <h2 className="font-heading text-base font-bold text-text-primary">
              Code Dependency & Call Graph
            </h2>
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            Discovered {depData.total_relationships} file-to-file relationships across your repository. Click any file to compute its blast radius.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadDependencies}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-border-glass bg-bg-surface px-3 py-1.5 text-xs text-text-secondary hover:border-primary hover:text-text-primary"
            title="Refresh graph"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Category Filter Pills */}
      {categories.length > 2 && (
        <div className="mb-5 flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                activeCategory === cat
                  ? 'bg-primary text-white shadow-sm'
                  : 'border border-border-glass bg-bg-surface text-text-secondary hover:text-text-primary'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Main Grid: Nodes on Left, Impact Panel on Right */}
      <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Nodes Grid */}
        <div className={`flex flex-col gap-6 ${selectedNode ? 'lg:col-span-7' : 'lg:col-span-12'}`}>
          {depData.nodes.length === 0 && !loading ? (
            <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border-glass bg-bg-surface/50 p-8 text-center text-text-muted">
              <Layers size={36} className="mb-3 text-text-muted" />
              <h3 className="font-heading text-sm font-bold text-text-primary">No Dependencies Detected</h3>
              <p className="mt-1 max-w-sm text-xs text-text-secondary">
                Ensure this repository has standard JavaScript, TypeScript, or Python imports (`import ...` or `require(...)`).
              </p>
            </div>
          ) : (
            Object.entries(groupedNodes).map(([category, nodes]) => {
              const color = CATEGORY_COLORS[category] || '#3b82f6';
              return (
                <div key={category} className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                    <h3 className="font-heading text-xs font-bold uppercase tracking-wider text-text-secondary">
                      {category} ({nodes.length})
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                    {nodes.map((node) => {
                      const isSelected = selectedNode?.id === node.id;
                      const outgoing = depData.edges.filter((e) => e.source === node.id).length;
                      const incoming = depData.edges.filter((e) => e.target === node.id).length;

                      return (
                        <motion.div
                          key={node.id}
                          whileHover={{ y: -2 }}
                          onClick={() => handleSelectNode(node)}
                          className={`group cursor-pointer rounded-xl border p-3.5 transition-all ${
                            isSelected
                              ? 'border-primary bg-primary/10 shadow-[0_0_15px_var(--primary-glow)]'
                              : 'border-border-glass bg-bg-surface hover:border-primary/50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="truncate font-mono text-xs font-bold text-text-primary group-hover:text-primary">
                              {node.name}
                            </span>
                            <span
                              className="rounded px-1.5 py-0.5 text-[0.65rem] font-bold uppercase"
                              style={{ color, backgroundColor: `${color}15` }}
                            >
                              {node.language}
                            </span>
                          </div>

                          <p className="mt-1 truncate font-mono text-[0.7rem] text-text-muted">
                            {node.file_path}
                          </p>

                          <div className="mt-3 flex items-center justify-between border-t border-border-glass pt-2 text-[0.7rem] text-text-secondary">
                            <span>Imports: <b>{outgoing}</b></span>
                            <span>Dependents: <b>{incoming}</b></span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Impact Analysis Drawer */}
        {selectedNode && (
          <div className="flex flex-col gap-4 lg:col-span-5">
            <div className="sticky top-6 rounded-2xl border border-primary/30 bg-bg-surface p-5 shadow-card backdrop-blur-2xl">
              <div className="mb-4 flex items-center justify-between border-b border-border-glass pb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase text-primary">
                    <Sparkles size={13} />
                    Impact Analysis
                  </div>
                  <h3 className="truncate font-mono text-sm font-bold text-text-primary">
                    {selectedNode.name}
                  </h3>
                </div>

                <button
                  onClick={() => onSelectFile(selectedNode.file_path, '1')}
                  className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-white shadow-sm hover:opacity-95"
                >
                  View File
                </button>
              </div>

              {impactData && (
                <div className="flex flex-col gap-4">
                  <div className="rounded-xl border border-border-glass bg-bg-input p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-secondary">Potential Blast Radius:</span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          impactData.blast_radius_count > 0
                            ? 'bg-accent/20 text-accent'
                            : 'bg-success/20 text-success'
                        }`}
                      >
                        {impactData.blast_radius_count} Dependent File{impactData.blast_radius_count === 1 ? '' : 's'}
                      </span>
                    </div>
                    <p className="mt-1 text-[0.7rem] text-text-muted">
                      Modifying this file could affect up to {impactData.blast_radius_count} upstream file(s).
                    </p>
                  </div>

                  <div>
                    <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-text-secondary">
                      <AlertTriangle size={13} className="text-accent" />
                      Affected Upstream Files ({impactData.affected_by_changes.length})
                    </h4>
                    {impactData.affected_by_changes.length === 0 ? (
                      <p className="text-xs text-text-muted">No other files import this module directly.</p>
                    ) : (
                      <div className="flex max-h-48 flex-col gap-2 overflow-y-auto">
                        {impactData.affected_by_changes.map((up, i) => (
                          <div
                            key={i}
                            onClick={() => onSelectFile(up.source_file, '1')}
                            className="group flex cursor-pointer items-center justify-between rounded-lg border border-border-glass bg-bg-input p-2.5 text-xs transition-colors hover:border-primary"
                          >
                            <span className="truncate font-mono text-text-primary group-hover:text-primary">
                              {up.source_file}
                            </span>
                            <span className="text-[0.65rem] font-bold uppercase text-accent">
                              {up.relationship}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-text-secondary">
                      <ArrowDownRight size={13} className="text-primary" />
                      Dependencies Imported ({impactData.depends_on.length})
                    </h4>
                    {impactData.depends_on.length === 0 ? (
                      <p className="text-xs text-text-muted">This file does not import any other local modules.</p>
                    ) : (
                      <div className="flex max-h-48 flex-col gap-2 overflow-y-auto">
                        {impactData.depends_on.map((down, i) => (
                          <div
                            key={i}
                            onClick={() => onSelectFile(down.target_file, '1')}
                            className="group flex cursor-pointer items-center justify-between rounded-lg border border-border-glass bg-bg-input p-2.5 text-xs transition-colors hover:border-primary"
                          >
                            <span className="truncate font-mono text-text-primary group-hover:text-primary">
                              {down.target_file}
                            </span>
                            <span className="text-[0.65rem] font-bold uppercase text-text-muted">
                              {down.relationship}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
