import os
import subprocess
import logging
import json

logger = logging.getLogger(__name__)

def detect_test_runner(repo_path: str) -> tuple[str, list[str]]:
    """
    Scans the repository path and returns (runner_name, command_args).
    Supports Node/npm, Pytest, Cargo, Maven, and Python unittest.
    """
    package_json_path = os.path.join(repo_path, "package.json")
    if os.path.exists(package_json_path):
        try:
            with open(package_json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                scripts = data.get("scripts", {})
                if "test" in scripts:
                    return "npm", ["npm", "test"]
        except Exception as e:
            logger.error(f"Failed reading package.json: {e}")

    if os.path.exists(os.path.join(repo_path, "pytest.ini")) or os.path.exists(os.path.join(repo_path, "conftest.py")):
        return "pytest", ["pytest"]

    requirements_path = os.path.join(repo_path, "requirements.txt")
    if os.path.exists(requirements_path):
        try:
            with open(requirements_path, 'r', encoding='utf-8') as f:
                if "pytest" in f.read():
                    return "pytest", ["pytest"]
        except Exception:
            pass

    if os.path.exists(os.path.join(repo_path, "Cargo.toml")):
        return "cargo", ["cargo", "test"]

    if os.path.exists(os.path.join(repo_path, "pom.xml")):
        return "maven", ["mvn", "test"]

    for root, dirs, files in os.walk(repo_path):
        if "node_modules" in dirs:
            dirs.remove("node_modules")
        if ".git" in dirs:
            dirs.remove(".git")
        for file in files:
            if file.startswith("test_") and file.endswith(".py"):
                return "unittest", ["python", "-m", "unittest", "discover", "-s", root, "-p", "test_*.py"]

    return "unknown", []

def execute_repo_tests(repo_path: str, node_path: str = None, python_path: str = None) -> dict:
    """Executes repository test runner in a subprocess and returns structured output."""
    runner, cmd = detect_test_runner(repo_path)

    if runner == "unknown":
        return {
            "success": False,
            "runner": "unknown",
            "message": "No supported test runner detected (e.g. package.json, pytest, cargo, unittest).",
            "logs": "Please add tests or configure a test runner."
        }

    env = os.environ.copy()
    if node_path:
        env["PATH"] = f"{node_path};{env.get('PATH', '')}"

    if python_path and runner in ["pytest", "unittest"]:
        if cmd[0] == "pytest":
            venv_bin = os.path.dirname(python_path)
            pytest_exe = os.path.join(venv_bin, "pytest.exe")
            if os.path.exists(pytest_exe):
                cmd[0] = pytest_exe
            else:
                cmd = [python_path, "-m", "pytest"]
        elif cmd[0] == "python":
            cmd[0] = python_path

    if os.name == 'nt' and cmd[0] == "npm":
        if node_path:
            npm_cmd = os.path.join(node_path, "npm.cmd")
            cmd[0] = npm_cmd if os.path.exists(npm_cmd) else "npm.cmd"
        else:
            cmd[0] = "npm.cmd"

    logger.info(f"Executing test suite via {runner}: {' '.join(cmd)}")

    startupinfo = None
    if os.name == 'nt':
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

    try:
        res = subprocess.run(
            cmd,
            cwd=repo_path,
            capture_output=True,
            text=True,
            env=env,
            timeout=120,
            startupinfo=startupinfo
        )

        success = (res.returncode == 0)
        logs = f"Stdout:\n{res.stdout}\n\nStderr:\n{res.stderr}"

        return {
            "success": success,
            "runner": runner,
            "exit_code": res.returncode,
            "logs": logs,
            "message": f"Tests executed successfully using {runner}." if success else f"Tests failed with exit code {res.returncode}."
        }
    except subprocess.TimeoutExpired as te:
        logs = f"Stdout (partial):\n{te.stdout or ''}\n\nStderr (partial):\n{te.stderr or ''}"
        return {
            "success": False,
            "runner": runner,
            "message": "Tests timed out after 120 seconds.",
            "logs": logs + "\n\nTimeoutExpired"
        }
    except Exception as e:
        logger.error(f"Test runner execution failure: {e}")
        return {
            "success": False,
            "runner": runner,
            "message": f"Error initiating test runner: {str(e)}",
            "logs": str(e)
        }

