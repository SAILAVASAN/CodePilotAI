import os
import json
import time
import logging
import httpx
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

class LLMClient:
    _ollama_checked_at: float = 0.0
    _ollama_cached_status: bool = False
    _working_gemini_model: Optional[str] = None

    def __init__(self, api_key: Optional[str] = None):
        self.ollama_base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
        self.code_model = os.environ.get("CODE_MODEL", "qwen2.5-coder")
        self.api_key = api_key or os.environ.get("MOONSHOT_API_KEY") or os.environ.get("GEMINI_API_KEY", "")
        self.gemini_api_key = self.api_key if not self.api_key.startswith("sk-") else os.environ.get("GEMINI_API_KEY", "")
        self.client = httpx.Client(timeout=120.0)

    def is_ollama_available(self) -> bool:
        """Checks if local Ollama daemon is running with a 30s TTL cache to avoid blocking latency."""
        now = time.time()
        if now - LLMClient._ollama_checked_at < 30.0:
            return LLMClient._ollama_cached_status

        try:
            resp = self.client.get(f"{self.ollama_base_url}/api/tags", timeout=0.25)
            LLMClient._ollama_cached_status = (resp.status_code == 200)
        except Exception:
            LLMClient._ollama_cached_status = False

        LLMClient._ollama_checked_at = now
        return LLMClient._ollama_cached_status

    def generate_chat(self, system_prompt: str, user_prompt: str, response_format_json: bool = True) -> str:
        """
        Sends chat prompt to Ollama if active; otherwise routes to Moonshot or Gemini.
        Returns the text response.
        """
        if self.is_ollama_available():
            try:
                logger.info(f"Routing request to local Ollama ({self.code_model})...")
                payload: Dict[str, Any] = {
                    "model": self.code_model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    "stream": False
                }
                if response_format_json:
                    payload["format"] = "json"

                resp = self.client.post(
                    f"{self.ollama_base_url}/api/chat",
                    json=payload,
                    timeout=180.0
                )
                resp.raise_for_status()
                data = resp.json()
                return data["message"]["content"]
            except Exception as e:
                logger.warning(f"Ollama generation failed ({e}); attempting fallback...")

        # If key is an sk- token, use Moonshot / OpenAI compatible endpoint
        if self.api_key.startswith("sk-"):
            try:
                return self._generate_openai_compatible(system_prompt, user_prompt, response_format_json)
            except Exception as e:
                logger.warning(f"OpenAI/Moonshot call failed ({e}); falling back to Gemini...")

        # Fallback to Gemini API
        return self._generate_gemini(system_prompt, user_prompt, response_format_json)

    def _generate_openai_compatible(self, system_prompt: str, user_prompt: str, response_format_json: bool) -> str:
        url = os.environ.get("OPENAI_BASE_URL", "https://api.moonshot.cn/v1/chat/completions")
        model = os.environ.get("OPENAI_MODEL", "moonshot-v1-8k")
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": 0.2
        }
        if response_format_json:
            payload["response_format"] = {"type": "json_object"}

        resp = self.client.post(url, json=payload, headers=headers, timeout=120.0)
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]

    def _generate_gemini(self, system_prompt: str, user_prompt: str, response_format_json: bool) -> str:
        if not self.gemini_api_key:
            raise RuntimeError(
                "Neither Ollama (local) nor a Gemini API Key is available. "
                "Please start Ollama at http://localhost:11434 or configure GEMINI_API_KEY."
            )

        models_to_try = [
            LLMClient._working_gemini_model,
            os.environ.get("GEMINI_MODEL", "gemini-3.8-flash"),
            "gemini-3.8-flash",
            "gemini-3.5-flash"
        ]
        # Remove duplicates and None while preserving order
        seen = set()
        unique_models = []
        for m in models_to_try:
            if m and m not in seen:
                seen.add(m)
                unique_models.append(m)

        for model in unique_models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={self.gemini_api_key}"
            payload: Dict[str, Any] = {
                "systemInstruction": {
                    "parts": [{"text": system_prompt}]
                },
                "contents": [
                    {
                        "role": "user",
                        "parts": [{"text": user_prompt}]
                    }
                ],
                "generationConfig": {
                    "temperature": 0.2
                }
            }
            if response_format_json:
                payload["generationConfig"]["responseMimeType"] = "application/json"

            try:
                resp = self.client.post(url, json=payload, headers={"Content-Type": "application/json"})
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts:
                            LLMClient._working_gemini_model = model
                            return parts[0].get("text", "")
                logger.warning(f"Gemini {model} returned status {resp.status_code}: {resp.text}")
            except Exception as e:
                logger.warning(f"Error calling Gemini {model}: {e}")

        raise RuntimeError("Failed to generate response using Gemini fallback models.")
