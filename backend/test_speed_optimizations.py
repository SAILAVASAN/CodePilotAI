import unittest
from unittest.mock import MagicMock, patch
import db
import rag
from llm.client import LLMClient
from agent import SoftwareAgent

class TestSpeedOptimizations(unittest.TestCase):

    def test_gemini_client_caching(self):
        client = rag.GeminiClient(api_key="fake-key")
        rag.GeminiClient._cached_working_model = "gemini-embedding-2"
        # Should return cached model immediately without network call
        model = client.resolve_working_model()
        self.assertEqual(model, "gemini-embedding-2")

    def test_llm_client_gemini_model_ordering(self):
        client = LLMClient(api_key="fake-key")
        LLMClient._working_gemini_model = "gemini-3.8-flash"
        self.assertEqual(LLMClient._working_gemini_model, "gemini-3.8-flash")

    @patch("db.find_symbols_by_name")
    def test_agent_search_code_fast_symbol_path(self, mock_symbols):
        mock_symbols.return_value = [{
            "name": "login_user",
            "symbol_type": "function",
            "file_path": "backend/auth.py",
            "start_line": 10,
            "end_line": 25,
            "signature": "def login_user(username, password):"
        }]

        agent = SoftwareAgent(api_key="fake-key", repo_id=1, local_path=".")
        # Ensure rag_client.embed_text is NOT called when exact symbol is matched
        agent.rag_client.embed_text = MagicMock()

        result = agent.execute_tool("searchCode", {"query": "login_user"})
        self.assertIn("Found exact code symbol matches", result)
        self.assertIn("backend/auth.py", result)
        agent.rag_client.embed_text.assert_not_called()

    @patch("db.find_symbols_by_name")
    @patch("db.search_code_fts")
    def test_agent_search_code_fast_fts_path(self, mock_fts, mock_symbols):
        mock_symbols.return_value = []
        mock_fts.return_value = [{
            "file_path": "backend/config.py",
            "snippet": "JWT_SECRET = os.environ.get('JWT_SECRET')"
        }]

        agent = SoftwareAgent(api_key="fake-key", repo_id=1, local_path=".")
        agent.rag_client.embed_text = MagicMock()

        result = agent.execute_tool("searchCode", {"query": "JWT_SECRET"})
        self.assertIn("Found full-text matches", result)
        self.assertIn("backend/config.py", result)
        agent.rag_client.embed_text.assert_not_called()

if __name__ == "__main__":
    unittest.main()
