import json
import logging
import httpx
import db
import rag
import run_tests

logger = logging.getLogger(__name__)

# Agent System Prompt
SYSTEM_PROMPT = """You are CodePilot, a senior software engineering assistant.
Your goal is to help developers understand, debug, and build their codebase.
Always communicate clearly, professionally, and directly like an expert software engineer.
Never use robotic artificial disclaimers or fluff phrases.

Always ground your answers in exact codebase evidence.
Do not hallucinate file paths, libraries, configuration, or API endpoints.
If you cannot find the answer in the code or documents using your tools, state that there is insufficient codebase evidence.
Always format file citations as `[file_path:line_range]` or `[file_path]` so the UI can highlight the file for the user.

You should perform step-by-step reasoning. To achieve this, call tools sequentially in a loop.
At each step, output:
1. Your "thought" explaining what you are looking for and why.
2. An optional "tool" call (searchCode, getFile, getDependencies, runTests) with its "args".
3. A final "answer" when you have gathered enough information.

Available tools:
- searchCode(query): Search all file chunks using semantic vector search. Returns files and relevant chunks.
- getFile(file_path): Fetch the complete content of a specific file. Useful for reading entire code files.
- getDependencies(): Scan dependency files (like package.json, requirements.txt, Cargo.toml) to identify packages used.
- runTests(): Runs the tests in the repository and returns output logs. Useful to verify fixes or find failing tests.

Return your response as a single JSON object matching the requested schema.
"""

class SoftwareAgent:
    def __init__(self, api_key: str, repo_id: int, local_path: str, node_path: str = None, python_path: str = None):
        self.api_key = api_key
        self.repo_id = repo_id
        self.local_path = local_path
        self.node_path = node_path
        self.python_path = python_path
        self.client = httpx.Client(timeout=60.0)
        
        # Resolve embeddings client key
        embed_key = api_key
        if api_key.startswith("sk-"):
            # Use backend's own Gemini key for embeddings (has high limit)
            import os
            embed_key = os.environ.get("GEMINI_API_KEY") or api_key
            
        self.rag_client = rag.GeminiClient(embed_key)

    def execute_tool(self, tool_name: str, args: dict) -> str:
        """Executes a tool on behalf of the agent and returns a text result."""
        try:
            if tool_name == "searchCode":
                query = args.get("query", "")
                if not query:
                    return "Error: Empty query parameter for searchCode."
                
                all_chunks = db.get_chunks_for_repo(self.repo_id)
                if not all_chunks:
                    return "Error: No chunks found for this repository. Ingestion might have failed or is not complete."
                
                query_emb = self.rag_client.embed_text(query)
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

        # Keep track of agent steps
        loop_limit = 6
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
                # Invoke Gemini API
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key={self.api_key}"
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
                    if response.status_code != 200:
                        raise Exception(f"Gemini API error ({response.status_code}): {response.text}")
                    
                    res_data = response.json()
                    content_text = res_data["candidates"][0]["content"]["parts"][0]["text"]
                    parsed = json.loads(content_text)
                except Exception as e:
                    logger.error(f"Error calling or parsing Gemini API: {e}")
                    return f"An error occurred while consulting the AI agent: {str(e)}", steps

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
