import os
import json
import logging
import httpx
import db
import rag
import run_tests

logger = logging.getLogger(__name__)

# Agent System Prompt
SYSTEM_PROMPT = """You are CodePilot, a fast, highly capable senior software engineering assistant.
Your goal is to help developers understand, build, and debug their codebase quickly and accurately.
Always communicate clearly, professionally, and directly like an expert software engineer.
Never use robotic artificial disclaimers or conversational fluff.

RESPONSE & SPEED PRINCIPLES:
1. Fast Direct Answer: If the user's question can be answered from the Repository Files Tree, general programming knowledge, or past conversation history (e.g. project structure, framework identification, configuration, file paths), respond IMMEDIATELY with tool 'none' and provide the complete answer in your very first turn.
2. Targeted Tool Execution: Only invoke a tool when you genuinely need specific file code or live test output.
   - Use 'getFile' when you already know or can deduce the target file path.
   - Use 'searchCode' to find functions, classes, symbols, or phrases across the codebase.
   - Use 'getDependencies' when asked about packages, versions, or libraries.
   - Use 'runTests' when asked to execute or verify unit tests.
3. Codebase Grounding: Always cite actual file paths and line ranges as `[file_path:line_range]` or `[file_path]`. Never hallucinate non-existent files or functions.
4. Professional Engineering Style: Tailor your response directly to what was asked. Keep explanations crisp, actionable, and formatted with clean markdown codeblocks.

Available tools:
- searchCode(query): Search symbols, full-text code, or semantic chunks. Returns matching code snippets.
- getFile(file_path): Fetch the complete content of a specific file.
- getDependencies(): Scan dependency files (package.json, requirements.txt, Cargo.toml, etc.) to list external packages.
- runTests(): Runs the tests in the repository and returns output logs.

Return your response as a single JSON object matching the requested schema.
"""

class SoftwareAgent:
    _working_gemini_model: str = None

    def __init__(self, api_key: str, repo_id: int, local_path: str, node_path: str = None, python_path: str = None):
        self.api_key = api_key
        self.repo_id = repo_id
        self.local_path = local_path
        self.node_path = node_path
        self.python_path = python_path
        self.client = httpx.Client(timeout=60.0)
        
        self.rag_client = rag.GeminiClient(rag.resolve_embedding_key(api_key))
        self._embedding_model = None  # resolved lazily on first searchCode call
        self._cached_chunks = None

    def execute_tool(self, tool_name: str, args: dict) -> str:
        """Executes a tool on behalf of the agent and returns a text result."""
        try:
            if tool_name == "searchCode":
                query = args.get("query", "").strip()
                if not query:
                    return "Error: Empty query parameter for searchCode."

                # Fast Path 1: Check exact code symbols table (< 1ms)
                symbols = db.find_symbols_by_name(self.repo_id, query)
                if symbols:
                    formatted = [f"Found exact code symbol matches for '{query}':"]
                    for idx, s in enumerate(symbols[:5]):
                        formatted.append(
                            f"Match #{idx+1} [Symbol: {s['symbol_type']}]\n"
                            f"File: {s['file_path']} (Lines {s['start_line']}-{s['end_line']})\n"
                            f"Name: {s['name']} | Signature: {s.get('signature', '')}\n"
                        )
                    return "\n".join(formatted)

                # Fast Path 2: Full-Text Search in SQLite FTS5 (< 2ms)
                fts_matches = db.search_code_fts(self.repo_id, query, limit=5)
                if fts_matches:
                    formatted = [f"Found full-text matches for '{query}':"]
                    for idx, m in enumerate(fts_matches):
                        clean_snippet = m.get("snippet", "").replace("<b>", "").replace("</b>", "")
                        formatted.append(
                            f"Match #{idx+1} [FTS]\n"
                            f"File: {m['file_path']}\n"
                            f"```\n{clean_snippet}\n```\n"
                        )
                    return "\n".join(formatted)

                # Fallback: Semantic Vector Search
                if self._cached_chunks is None:
                    self._cached_chunks = db.get_chunks_for_repo(self.repo_id)
                all_chunks = self._cached_chunks
                if not all_chunks:
                    return "No matching code chunks found in repository index."
                
                if self._embedding_model is None:
                    self._embedding_model = self.rag_client.resolve_working_model()
                query_emb = self.rag_client.embed_text(query, model=self._embedding_model)
                results = rag.search_similar_chunks(query_emb, all_chunks, top_k=5)
                
                formatted = []
                for idx, r in enumerate(results):
                    formatted.append(
                        f"Match #{idx+1} (Score: {r['score']:.3f})\n"
                        f"File: {r['file_path']} (Lines {r['start_line']}-{r['end_line']})\n"
                        f"Type: {r['type']} {f'({r['name']})' if r['name'] else ''}\n"
                        f"```\n{r['text']}\n```\n"
                    )
                return "\n".join(formatted) if formatted else "No matching code chunks found."

            elif tool_name == "getFile":
                file_path = args.get("file_path", "")
                if not file_path:
                    return "Error: Empty file_path parameter for getFile."
                
                conn = db.get_db_connection()
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT content FROM files WHERE repo_id = ? AND file_path = ?",
                    (self.repo_id, file_path)
                )
                row = cursor.fetchone()
                conn.close()
                
                if row:
                    content = row["content"]
                    lines = content.split('\n')
                    numbered = [f"{i+1}: {line}" for i, line in enumerate(lines)]
                    return f"File: {file_path}\nTotal lines: {len(lines)}\n\n```\n" + "\n".join(numbered) + "\n```"
                else:
                    return f"Error: File '{file_path}' not found in the repository index."

            elif tool_name == "getDependencies":
                conn = db.get_db_connection()
                cursor = conn.cursor()
                # Query common dependency files
                cursor.execute(
                    "SELECT file_path, content FROM files WHERE repo_id = ? AND file_path IN ('package.json', 'requirements.txt', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle', 'setup.py')",
                    (self.repo_id,)
                )
                rows = cursor.fetchall()
                conn.close()
                
                if not rows:
                    return "No standard dependency files (package.json, requirements.txt, go.mod, Cargo.toml, pom.xml, build.gradle) found in repository."
                
                results = []
                for r in rows:
                    results.append(f"Dependency File: {r['file_path']}\nContent:\n```\n{r['content']}\n```")
                return "\n\n".join(results)

            elif tool_name == "runTests":
                # Execute tests
                res = run_tests.execute_repo_tests(self.local_path, self.node_path, self.python_path)
                return (
                    f"Test Status: {'PASSED' if res['success'] else 'FAILED'}\n"
                    f"Runner: {res['runner']}\n"
                    f"Message: {res['message']}\n"
                    f"Console Output:\n{res['logs']}"
                )

            else:
                return f"Error: Unknown tool '{tool_name}'."
        except Exception as e:
            logger.error(f"Error executing tool {tool_name}: {e}")
            return f"Error executing tool: {str(e)}"

    def run(self, user_query: str, chat_history: list = None) -> tuple[str, list]:
        """
        Executes the agentic loop.
        - chat_history: list of past messages
        Returns: (final_answer, steps_taken)
        """
        steps = []
        
        # Build prompt schema
        schema = {
            "type": "OBJECT",
            "properties": {
                "thought": { "type": "STRING", "description": "Reasoning about what to do next or analyzing findings." },
                "tool": { 
                    "type": "STRING", 
                    "description": "Name of tool to execute, or 'none' if ready to answer.",
                    "enum": ["searchCode", "getFile", "getDependencies", "runTests", "none"]
                },
                "query": { "type": "STRING", "description": "Search query for searchCode. Leave empty if not calling searchCode." },
                "file_path": { "type": "STRING", "description": "File path for getFile. Leave empty if not calling getFile." },
                "answer": { "type": "STRING", "description": "Final markdown answer answering the user query." }
            },
            "required": ["thought", "tool"]
        }

        # Build list of repository files to inject into prompt context so the agent knows the file tree!
        conn = db.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT file_path, size_bytes, language FROM files WHERE repo_id = ?", (self.repo_id,))
        files_list = cursor.fetchall()
        conn.close()

        files_summary = "\n".join([f"- {f['file_path']} ({f['language']}, {f['size_bytes']} bytes)" for f in files_list[:150]])
        if len(files_list) > 150:
            files_summary += f"\n... and {len(files_list) - 150} more files."

        # Construct System Instruction
        system_instruction_text = SYSTEM_PROMPT + "\n\nRepository Files Tree:\n" + files_summary
        system_instruction = {
            "parts": [{"text": system_instruction_text}]
        }

        # Initialize conversation contents with chat_history
        contents = []
        if chat_history:
            for msg in chat_history:
                # Alternate user and model messages cleanly. System roles are excluded.
                role = "user" if msg["role"] == "user" else "model"
                contents.append({
                    "role": role,
                    "parts": [{"text": msg["content"]}]
                })

        # Add the current user query to start the loop
        contents.append({
            "role": "user",
            "parts": [{"text": user_query}]
        })

        # Keep track of agent steps (keep loop tight for fast user responses)
        loop_limit = 4
        step_index = 0

        while step_index < loop_limit:
            if self.api_key.startswith("sk-"):
                # Moonshot AI (Kimi) Chat Completions Call
                url = "https://api.moonshot.cn/v1/chat/completions"
                headers = {
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                }
                
                # Convert contents list to OpenAI messages format
                messages = []
                messages.append({
                    "role": "system",
                    "content": system_instruction_text + "\nReturn your response as a single JSON object matching the requested schema. Do not include markdown formatting codeblocks around the JSON. Desired JSON Schema:\n" + json.dumps(schema, indent=2)
                })
                
                for c in contents:
                    role = "user" if c["role"] == "user" else "assistant"
                    messages.append({
                        "role": role,
                        "content": c["parts"][0]["text"]
                    })
                    
                payload = {
                    "model": "moonshot-v1-8k",
                    "messages": messages,
                    "response_format": {"type": "json_object"},
                    "temperature": 0.2
                }
                
                try:
                    response = self.client.post(url, json=payload, headers=headers)
                    if response.status_code != 200:
                        raise Exception(f"Moonshot API error ({response.status_code}): {response.text}")
                    
                    res_data = response.json()
                    content_text = res_data["choices"][0]["message"]["content"]
                    parsed = json.loads(content_text)
                except Exception as e:
                    logger.error(f"Error calling or parsing Moonshot API: {e}")
                    return f"An error occurred while consulting the Moonshot AI agent: {str(e)}", steps
            else:
                # Invoke Gemini API with prioritized fast model fallback
                models_to_try = [
                    SoftwareAgent._working_gemini_model,
                    os.environ.get("GEMINI_MODEL", "gemini-3.8-flash"),
                    "gemini-3.8-flash",
                    "gemini-3.5-flash"
                ]
                seen = set()
                unique_models = [m for m in models_to_try if m and not (m in seen or seen.add(m))]

                content_text = None
                parsed = None
                last_err = None

                for model in unique_models:
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={self.api_key}"
                    headers = {"Content-Type": "application/json"}
                    payload = {
                        "systemInstruction": system_instruction,
                        "contents": contents,
                        "generationConfig": {
                            "responseMimeType": "application/json",
                            "responseSchema": schema,
                            "temperature": 0.2
                        }
                    }

                    try:
                        response = self.client.post(url, json=payload, headers=headers)
                        if response.status_code == 200:
                            res_data = response.json()
                            content_text = res_data["candidates"][0]["content"]["parts"][0]["text"]
                            parsed = json.loads(content_text)
                            SoftwareAgent._working_gemini_model = model
                            break
                        else:
                            last_err = f"Gemini API ({model}) returned {response.status_code}: {response.text}"
                            logger.warning(last_err)
                    except Exception as e:
                        last_err = str(e)
                        logger.warning(f"Error calling Gemini {model}: {e}")

                if parsed is None:
                    return f"An error occurred while consulting the AI agent: {last_err}", steps

            # Add LLM response to chat history as 'model'
            contents.append({
                "role": "model",
                "parts": [{"text": content_text}]
            })

            thought = parsed.get("thought", "")
            tool = parsed.get("tool", "")
            answer = parsed.get("answer", "")
            
            # Map flat properties to args dict for execute_tool
            args = {}
            if tool == "searchCode":
                args["query"] = parsed.get("query", "")
            elif tool == "getFile":
                args["file_path"] = parsed.get("file_path", "")

            # Log step
            step_record = {
                "thought": thought,
                "tool": tool,
                "args": args,
                "result": ""
            }
            steps.append(step_record)
            
            if tool and tool in ["searchCode", "getFile", "getDependencies", "runTests"]:
                # Execute tool
                logger.info(f"Agent executing tool {tool} with args {args}")
                result = self.execute_tool(tool, args)
                
                # Limit size of result in LLM context to prevent token blowup
                truncated_result = result
                if len(result) > 8000:
                    truncated_result = result[:8000] + "\n... [truncated due to length] ..."
                
                step_record["result"] = result  # Save full result for UI
                
                # Append tool output as user message to alternate roles
                contents.append({
                    "role": "user",
                    "parts": [{"text": f"Output for tool {tool} execution:\n{truncated_result}"}]
                })
                
                step_index += 1
            else:
                # Agent provided final answer
                return answer, steps

        # Timeout return
        return "The agent reached its step execution limit before finding a final answer. Please narrow down your request.", steps
