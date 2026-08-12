# CodePilotAI

CodePilotAI is a local codebase assistant built with FastAPI and React. It indexes your local or remote git repositories, breaks source code into AST and regex chunks, computes vector embeddings, and provides intelligent Q&A with direct code file citations, route discovery, and test execution.

## Features

- **Code Indexing & Chunking**: Parses Python AST and language regex patterns (JavaScript, TypeScript, Go, Rust, Java, C++) into function and class chunks.
- **Local Vector Store**: Stores embeddings in a local SQLite database and performs cosine similarity search.
- **Code Chat**: Ask questions about your repository and receive answers grounded in your actual files and line numbers.
- **API Route Discovery**: Automatically scans Express, FastAPI, Flask, and Rocket files to list defined REST endpoints.
- **Test Runner**: Detects `npm test`, `pytest`, `cargo test`, `mvn test`, or `unittest` and runs tests directly from the interface.

## Project Structure

```text
CodePilotAI/
├── backend/
│   ├── app.py           # FastAPI server & route handlers
│   ├── agent.py         # Code assistant logic & tool execution
│   ├── db.py            # SQLite database & vector storage
│   ├── rag.py           # AST parser, file scanner, & embedding client
│   ├── run_tests.py     # Subprocess test runner
│   ├── test_agent.py    # Unit tests
│   └── requirements.txt # Python dependencies
├── frontend/
│   ├── src/             # React UI components & styling
│   └── package.json     # Frontend dependencies
├── run_backend.bat      # Backend launch script
├── run_frontend.bat     # Frontend launch script
└── README.md
```

## Quick Start

### 1. Backend Setup

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# Linux/macOS
source venv/bin/activate

pip install -r requirements.txt
python -m uvicorn app:app --reload --port 8000
```

Create a `backend/.env` file with your Gemini API key:
```env
GEMINI_API_KEY=your_api_key_here
```

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at `http://localhost:5173` and connects to the backend at `http://localhost:8000`.

### 3. Windows Batch Launchers

- Double-click `run_backend.bat` to start the backend server.
- Double-click `run_frontend.bat` to start the frontend dev server.

## Testing

Run the backend test suite:
```bash
python -m unittest discover -s backend
```

## License

MIT
