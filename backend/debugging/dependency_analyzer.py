import os
import re
import ast
from typing import List, Dict, Any, Set, Optional
import logging

logger = logging.getLogger(__name__)

class DependencyAnalyzer:
    def __init__(self, repo_files: Dict[str, Dict[str, Any]]):
        """
        repo_files: dict mapping clean file_path -> {content, language}
        """
        self.repo_files = {p.replace("\\", "/"): data for p, data in repo_files.items()}
        self.available_paths = set(self.repo_files.keys())

    def analyze_all_dependencies(self) -> List[Dict[str, Any]]:
        """Extracts import and require dependency edges across all indexed files."""
        edges = []
        for file_path, data in self.repo_files.items():
            content = data.get("content", "")
            lang = data.get("language", "")
            
            if lang in ("javascript", "typescript") or file_path.endswith((".js", ".jsx", ".ts", ".tsx", ".mjs")):
                file_edges = self._analyze_js_dependencies(file_path, content)
                edges.extend(file_edges)
            elif lang == "python" or file_path.endswith(".py"):
                file_edges = self._analyze_python_dependencies(file_path, content)
                edges.extend(file_edges)

        return edges

    def _resolve_relative_path(self, current_file: str, import_target: str) -> Optional[str]:
        """Resolves relative import paths like './APIList' or '../lib/api' to repo files."""
        current_dir = os.path.dirname(current_file)
        joined = os.path.normpath(os.path.join(current_dir, import_target)).replace("\\", "/")

        candidates = [
            joined,
            joined + ".js",
            joined + ".jsx",
            joined + ".ts",
            joined + ".tsx",
            joined + "/index.js",
            joined + "/index.jsx",
            joined + "/index.ts",
            joined + "/index.tsx",
            joined + ".py"
        ]

        for cand in candidates:
            if cand in self.available_paths:
                return cand

        # Try basename matching as fallback
        base = os.path.basename(import_target)
        for p in self.available_paths:
            p_base, _ = os.path.splitext(os.path.basename(p))
            if p_base == base:
                return p

        return None

    def _analyze_js_dependencies(self, source_file: str, content: str) -> List[Dict[str, Any]]:
        edges = []
        # ES6: import ... from './target'
        import_pattern = re.compile(r'(?:import|from)\s+[\'"]([^\'"]+)[\'"]')
        # CommonJS: require('./target')
        require_pattern = re.compile(r'require\(\s*[\'"]([^\'"]+)[\'"]\s*\)')

        targets = set()
        for m in import_pattern.finditer(content):
            targets.add(m.group(1))
        for m in require_pattern.finditer(content):
            targets.add(m.group(1))

        for raw_target in targets:
            # Only resolve local/relative imports, skip node_modules (e.g. 'react', 'lucide-react')
            if raw_target.startswith(("./", "../", "@/")):
                clean_target = raw_target[2:] if raw_target.startswith("@/") else raw_target
                resolved = self._resolve_relative_path(source_file, clean_target)
                if resolved and resolved != source_file:
                    edges.append({
                        "source_file": source_file,
                        "target_file": resolved,
                        "relationship": "imports",
                        "symbol_name": None
                    })
        return edges

    def _analyze_python_dependencies(self, source_file: str, content: str) -> List[Dict[str, Any]]:
        edges = []
        try:
            tree = ast.parse(content)
        except Exception:
            return edges

        source_dir = os.path.dirname(source_file)

        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    module_name = alias.name.replace(".", "/")
                    resolved = self._resolve_relative_path(source_file, module_name)
                    if not resolved:
                        # Try direct filename
                        resolved = self._resolve_relative_path(source_file, alias.name)
                    if resolved and resolved != source_file:
                        edges.append({
                            "source_file": source_file,
                            "target_file": resolved,
                            "relationship": "imports",
                            "symbol_name": alias.name
                        })
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    module_path = node.module.replace(".", "/")
                    resolved = self._resolve_relative_path(source_file, module_path)
                    if not resolved:
                        resolved = self._resolve_relative_path(source_file, node.module)
                    if resolved and resolved != source_file:
                        symbol_names = ", ".join(a.name for a in node.names[:3])
                        edges.append({
                            "source_file": source_file,
                            "target_file": resolved,
                            "relationship": "imports",
                            "symbol_name": symbol_names
                        })

        return edges
