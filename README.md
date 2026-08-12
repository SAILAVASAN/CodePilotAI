# DevCopilot - Codebase Analysis & Developer Platform

DevCopilot is a local codebase intelligence engine designed to index software repositories, perform AST-aware RAG vector search, execute automated verification test suites, and map API routes across multi-language codebases.

---

## Repository Structure

```text
Ai Agents/
├── backend/
│   ├── app.py              # FastAPI application server & REST endpoints
│   ├── agent.py            # SoftwareAgent core reasoning loop & tool executor
│   ├── db.py               # SQLite database schemas, vector storage & sessions
│   ├── rag.py              # Code scanner, AST/regex chunker & embedding client
│   ├── run_tests.py        # Subprocess test suite detection & runner engine
│   ├── test_agent.py       # Unit test suite for vector search & chunking
│   ├── requirements.txt    # Backend Python package requirements
│   └── uploads/            # Temporary directory for cloned remote repositories
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AgentChat.jsx    # Interactive developer Q&A interface
│   │   │   ├── APIList.jsx      # Automated REST route discovery panel
│   │   │   ├── ArchDiagram.jsx  # System flow & module dependency tracer
│   │   │   ├── Auth.jsx         # User authentication & access management
│   │   │   ├── CodePreview.jsx  # Code viewer with line highlighting
│   │   │   ├── Dashboard.jsx    # Repository connector & management grid
│   │   │   ├── RepoExplorer.jsx # Codebase file tree explorer
│   │   │   └── TestProof.jsx    # Isolated test execution terminal
│   │   ├── App.jsx              # Main application shell & tab router
│   │   └── main.jsx             # React entry point
│   ├── package.json        # Frontend Node dependencies & scripts
│   └── vite.config.js      # Vite build configuration
├── run_backend.bat         # Startup script for FastAPI backend
├── run_frontend.bat        # Startup script for Vite frontend server
├── .gitignore              # Git ignore rules for node_modules, DB & env files
└── README.md               # Project documentation
```

---

## Key Technical Features

- **AST & Regex Code Chunking**: Extracts class bodies, function definitions, and module scopes for Python, JavaScript, TypeScript, Go, Rust, Java, and C++.
- **Vector Search Engine**: Generates embeddings via Google Gemini (`gemini-embedding-2` / `text-embedding-004`) and performs cosine similarity search stored in local SQLite database blobs.
- **Autonomous Tool Execution**: The agent iteratively executes tools (`searchCode`, `getFile`, `getDependencies`, `runTests`) to gather empirical codebase evidence before answering.
- **Automated Test Verification**: Scans repository configurations (`package.json`, `pytest.ini`, `Cargo.toml`, `pom.xml`, `unittest`) and runs verification tests inside an isolated subprocess.
- **REST Endpoint Discovery**: Automatically parses source files to map exposed API routes across FastAPI, Express, Flask, and Rocket frameworks.

---

## Getting Started

### Prerequisites

- **Python**: 3.10 or higher
- **Node.js**: 18.0 or higher
- **Git**: Installed and accessible in environment `PATH`

---

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create and activate a Python virtual environment:
   ```bash
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```

3. Install required dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure environment variables in `backend/.env`:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   NODE_PATH=C:\Program Files\nodejs
   PYTHON_PATH=C:\Python312\python.exe
   GIT_PATH=git
   ```

5. Run the backend server:
   ```bash
   uvicorn app:app --reload --host 0.0.0.0 --port 8000
   ```

---

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

---

## Running via Windows Batch Scripts

You can start both services using the provided batch scripts:

- **Start Backend**: Double-click `run_backend.bat`
- **Start Frontend**: Double-click `run_frontend.bat`

---

## Running Automated Unit Tests

To verify RAG chunking algorithms, cosine similarity calculation, and database persistence:

```bash
python -m unittest discover -s backend
```

---

## API Endpoints Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/status` | Check system configuration status |
| `POST` | `/api/settings/apikey` | Update active API key session |
| `GET` | `/api/repositories` | List all connected repository indexes |
| `POST` | `/api/repositories` | Connect and ingest local path or Git URL |
| `DELETE` | `/api/repositories/{id}` | Delete repository index and stored chunks |
| `GET` | `/api/repositories/{id}/files` | Retrieve flat file list of indexed repository |
| `GET` | `/api/repositories/{id}/file` | Fetch line-numbered content of specific file |
| `POST` | `/api/agent/chat` | Execute agent reasoning loop on user query |
| `GET` | `/api/repositories/{id}/endpoints` | Discover REST API endpoints from source code |
| `POST` | `/api/repositories/{id}/run-tests` | Trigger test suite runner in workspace |
