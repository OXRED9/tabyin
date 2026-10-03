"""Kept as the import point used across the code base: the one LLM client (OpenRouter)."""
from .openrouter import LLMSession, OpenRouterLLM, get_llm

__all__ = ["LLMSession", "OpenRouterLLM", "get_llm"]
