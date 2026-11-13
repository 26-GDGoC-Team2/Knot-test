"""Persistent model/text keyed cache; only OpenAI embeddings are requested."""
import hashlib
import json
import logging
import math
import os
from pathlib import Path

MODEL = "text-embedding-3-small"
ROOT = Path(__file__).resolve().parents[1]


def cache_directory():
    """Resolve relative deployment paths against the repository, not the shell cwd."""
    value = Path(os.environ.get("EMBEDDING_CACHE_DIR", "").strip() or "cache/embeddings")
    return value if value.is_absolute() else ROOT / value


class EmbeddingConfigurationError(ValueError):
    pass


class EmbeddingCacheMissError(EmbeddingConfigurationError):
    def __init__(self, missing_count):
        self.missing_count = missing_count
        super().__init__("Embedding cache miss and OPENAI_API_KEY is not configured.")


def validate_vector(vector):
    if not vector or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in vector):
        raise ValueError("Invalid embedding vector")
    if not any(vector):
        raise ValueError("Zero embedding vector")
    return vector


class EmbeddingCache:
    def __init__(self, client=None, directory: Path | None = None, model=MODEL):
        self.client, self.directory, self.model = client, (Path(directory) if directory is not None else cache_directory()) / model, model
        self._owns_client = False
        self._provider_errors = ()
        self.usage = dict(model=model, new_embedding_count=0, cache_hits=0,
                          target_text_count=0, unique_text_count=0, api_request_count=0,
                          total_tokens=0, prompt_tokens=0)

    def _client_for_missing(self, count):
        if self.client is None:
            key = os.environ.get("OPENAI_API_KEY", "").strip()
            if not key:
                logging.getLogger(__name__).warning("Embedding cache miss: %d texts; API key not configured", count)
                raise EmbeddingCacheMissError(count)
            try:
                from openai import OpenAI, APIError
            except ImportError:
                raise EmbeddingConfigurationError("Embedding runtime dependencies are missing; install requirements.txt.") from None
            self.client = OpenAI(api_key=key, base_url="https://api.openai.com/v1", max_retries=0, timeout=60)
            self._owns_client = True
            self._provider_errors = (APIError,)
        return self.client

    def close(self):
        if self._owns_client:
            self.client.close()

    def get_many(self, texts: list[str]) -> dict[str, list[float]]:
        unique = list(dict.fromkeys(texts))
        self.usage["target_text_count"] += len(texts)
        self.usage["unique_text_count"] += len(unique)
        result, missing = {}, []
        for text in unique:
            digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
            key = hashlib.sha256((self.model + "\0" + text).encode("utf-8")).hexdigest()
            path = self.directory / f"{key}.json"
            if path.exists():
                item = json.loads(path.read_text(encoding="utf-8"))
                if item["model"] != self.model or item["text_hash"] != digest:
                    raise ValueError("Embedding cache metadata mismatch")
                result[text] = validate_vector(item["embedding"])
                self.usage["cache_hits"] += 1
            else:
                missing.append((text, digest, path))
        if missing:
            client = self._client_for_missing(len(missing))
            self.directory.mkdir(parents=True, exist_ok=True)
        for start in range(0, len(missing), 32):
            batch = missing[start:start + 32]
            self.usage["api_request_count"] += 1
            try:
                response = client.embeddings.create(model=self.model, input=[x[0] for x in batch],
                                                     encoding_format="float")
            except self._provider_errors as exc:
                status = getattr(exc, "status_code", None)
                message = f"Embedding provider request failed (HTTP {status})." if status else "Embedding provider request failed."
                raise EmbeddingConfigurationError(message) from None
            if len(response.data) != len(batch) or {d.index for d in response.data} != set(range(len(batch))):
                raise ValueError("Embedding response indices mismatch")
            self.usage["total_tokens"] += response.usage.total_tokens
            self.usage["prompt_tokens"] += response.usage.prompt_tokens
            for item in response.data:
                text, digest, path = batch[item.index]
                vector = validate_vector(item.embedding)
                payload = dict(model=self.model, text_hash=digest, embedding=vector)
                temp = path.with_suffix(".tmp")
                temp.write_text(json.dumps(payload, allow_nan=False), encoding="utf-8")
                temp.replace(path)
                result[text] = vector
                self.usage["new_embedding_count"] += 1
        return result
