import unittest
import numpy as np
import os
import sys

# Ensure backend directory is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import rag

class TestAgentRAG(unittest.TestCase):

    def test_cosine_similarity_perfect_match(self):
        v1 = np.array([1.0, 0.0, 0.0], dtype=np.float32)
        v2 = np.array([1.0, 0.0, 0.0], dtype=np.float32)
        sim = rag.cosine_similarity(v1, v2)
        self.assertAlmostEqual(sim, 1.0, places=5)

    def test_cosine_similarity_orthogonal(self):
        v1 = np.array([1.0, 0.0, 0.0], dtype=np.float32)
        v2 = np.array([0.0, 1.0, 0.0], dtype=np.float32)
        sim = rag.cosine_similarity(v1, v2)
        self.assertAlmostEqual(sim, 0.0, places=5)

    def test_python_ast_chunking(self):
        code = """class Calculator:
    def add(self, a, b):
        return a + b

    def subtract(self, a, b):
        return a - b

def main():
    print("Hello world")
"""
        chunks = rag.get_python_chunks(code, "test.py")
        chunk_types = [c["type"] for c in chunks]
        chunk_names = [c["name"] for c in chunks]
        
        self.assertIn("class", chunk_types)
        self.assertIn("function", chunk_types)
        self.assertIn("Calculator", chunk_names)
        self.assertIn("add", chunk_names)
        self.assertIn("subtract", chunk_names)
        self.assertIn("main", chunk_names)

    def test_javascript_regex_chunking(self):
        code = """export default class UserService {
    async getUser(id) {
        return fetch(`/api/user/${id}`);
    }
}

function configureApp() {
    console.log("Configured");
}
"""
        chunks = rag.get_regex_chunks(code, "test.js", "javascript")
        chunk_types = [c["type"] for c in chunks]
        chunk_names = [c["name"] for c in chunks]
        
        self.assertIn("class", chunk_types)
        self.assertIn("function", chunk_types)
        self.assertIn("UserService", chunk_names)
        self.assertIn("getUser", chunk_names)
        self.assertIn("configureApp", chunk_names)

    def test_sliding_window_fallback(self):
        text = "\n".join([f"Line number {i}" for i in range(100)])
        chunks = rag.get_sliding_window_chunks(text, "test.txt", window_size=20, overlap=5)
        
        self.assertTrue(len(chunks) > 0)
        self.assertEqual(chunks[0]["start_line"], 1)
        self.assertEqual(chunks[0]["end_line"], 20)
        self.assertEqual(chunks[1]["start_line"], 16)

    def test_search_similar_chunks(self):
        db_chunks = [
            {
                "file_path": "auth.py",
                "start_line": 1,
                "end_line": 10,
                "type": "function",
                "name": "login",
                "text": "def login(): pass",
                "embedding": np.array([1.0, 0.0, 0.0], dtype=np.float32)
            },
            {
                "file_path": "db.py",
                "start_line": 1,
                "end_line": 10,
                "type": "function",
                "name": "connect",
                "text": "def connect(): pass",
                "embedding": np.array([0.0, 1.0, 0.0], dtype=np.float32)
            }
        ]
        
        query_emb = [0.9, 0.1, 0.0]
        results = rag.search_similar_chunks(query_emb, db_chunks, top_k=1)
        
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["file_path"], "auth.py")
        self.assertTrue(results[0]["score"] > 0.8)

if __name__ == '__main__':
    unittest.main()
