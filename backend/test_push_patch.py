import unittest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
import app
import db

class TestPushPatch(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app.app)
        app.app.dependency_overrides[app.auth.get_current_user] = lambda: {"id": 1, "email": "test@test.com"}

    def tearDown(self):
        app.app.dependency_overrides.clear()

    @patch("db.get_patch")
    @patch("db.get_debug_session")
    @patch("db.get_repository")
    @patch("os.path.exists", return_value=True)
    @patch("subprocess.run")
    @patch("db.update_patch_status")
    def test_push_patch_success(self, mock_update, mock_run, mock_exists, mock_get_repo, mock_get_session, mock_get_patch):
        mock_get_patch.return_value = {
            "id": 1,
            "session_id": 1,
            "file_path": "backend/db.py",
            "status": "applied"
        }
        mock_get_session.return_value = {
            "id": 1,
            "repo_id": 5,
            "error_type": "RuntimeError",
            "root_cause": "Database schema mismatch"
        }
        mock_get_repo.return_value = {
            "id": 5,
            "local_path": "C:/fake/path",
            "url": "https://github.com/fake/repo.git"
        }

        # Mock subprocess calls for git branch, add, commit, push, rev-parse
        mock_res = MagicMock()
        mock_res.returncode = 0
        mock_res.stdout = "main\n"
        mock_run.return_value = mock_res

        resp = self.client.post("/api/patches/1/push", json={})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["success"])
        mock_update.assert_called_with(1, "pushed")

if __name__ == "__main__":
    unittest.main()
