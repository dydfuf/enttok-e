"""ChromaDB service for vector similarity search."""

import asyncio
import json
import logging
from typing import Any, Dict, List, Optional

from app.core.config import (
    CHROMA_COLLECTION_NAME,
    CHROMA_PERSIST_DIR,
    EMBEDDING_MODEL,
)

logger = logging.getLogger(__name__)

# Global ChromaDB state
_client = None
_collection = None
_embedding_fn = None
_initialized = False


def _get_embedding_function():
    """Get or create embedding function using sentence-transformers."""
    global _embedding_fn
    if _embedding_fn is None:
        try:
            # Set environment variables to avoid common issues
            import os
            os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

            from chromadb.utils.embedding_functions import (
                DefaultEmbeddingFunction,
            )

            # Use ChromaDB's default embedding function (onnx-based, no PyTorch issues)
            _embedding_fn = DefaultEmbeddingFunction()
            logger.info("Initialized ChromaDB default embedding function")
        except Exception as e:
            logger.warning(
                f"Failed to initialize embedding function: {e}, will use None"
            )
            _embedding_fn = None
    return _embedding_fn


def _init_sync() -> None:
    """Initialize ChromaDB client and collection synchronously."""
    global _client, _collection, _initialized

    if _initialized:
        return

    try:
        import chromadb
        from chromadb.config import Settings

        _client = chromadb.PersistentClient(
            path=CHROMA_PERSIST_DIR,
            settings=Settings(anonymized_telemetry=False),
        )

        embedding_fn = _get_embedding_function()

        # Try to get or create collection, handling embedding function conflicts
        try:
            _collection = _client.get_or_create_collection(
                name=CHROMA_COLLECTION_NAME,
                embedding_function=embedding_fn,
                metadata={"hnsw:space": "cosine"},
            )
        except Exception as e:
            error_str = str(e).lower()
            if "embedding" in error_str or "conflict" in error_str:
                # Delete existing collection and recreate with new embedding function
                logger.warning(
                    f"Embedding function conflict detected, recreating collection: {e}"
                )
                try:
                    _client.delete_collection(CHROMA_COLLECTION_NAME)
                    logger.info(f"Deleted existing collection: {CHROMA_COLLECTION_NAME}")
                except Exception as del_e:
                    logger.warning(f"Failed to delete collection: {del_e}")

                _collection = _client.get_or_create_collection(
                    name=CHROMA_COLLECTION_NAME,
                    embedding_function=embedding_fn,
                    metadata={"hnsw:space": "cosine"},
                )
            else:
                raise

        _initialized = True
        logger.info(
            f"ChromaDB initialized: collection={CHROMA_COLLECTION_NAME}, "
            f"count={_collection.count()}"
        )
    except ImportError:
        logger.error("chromadb not installed. Run: uv add chromadb")
        raise
    except Exception as e:
        logger.error(f"Failed to initialize ChromaDB: {e}")
        raise


async def initialize() -> None:
    """Initialize ChromaDB client asynchronously."""
    await asyncio.to_thread(_init_sync)


def _ensure_initialized() -> None:
    """Ensure ChromaDB is initialized."""
    if not _initialized or _collection is None:
        _init_sync()


def compose_embedding_text(observation: Dict[str, Any]) -> str:
    """Compose text for embedding from observation fields."""
    parts = [
        f"Title: {observation['title']}",
        f"Type: {observation['type']}",
        f"Narrative: {observation['narrative']}",
    ]

    facts = observation.get("facts")
    if facts:
        if isinstance(facts, str):
            facts = json.loads(facts)
        if facts:
            parts.append(f"Facts: {', '.join(facts)}")

    concepts = observation.get("concepts")
    if concepts:
        if isinstance(concepts, str):
            concepts = json.loads(concepts)
        if concepts:
            parts.append(f"Concepts: {', '.join(concepts)}")

    return "\n".join(parts)


def _add_or_update_sync(
    observation_id: str,
    text: str,
    metadata: Dict[str, Any],
) -> None:
    """Add or update a single observation in ChromaDB synchronously."""
    _ensure_initialized()
    if _collection is None:
        raise RuntimeError("ChromaDB collection not initialized")

    # Filter metadata to only include supported types
    filtered_metadata = {}
    for key, value in metadata.items():
        if isinstance(value, (str, int, float, bool)):
            filtered_metadata[key] = value
        elif value is None:
            continue
        else:
            filtered_metadata[key] = str(value)

    _collection.upsert(
        ids=[observation_id],
        documents=[text],
        metadatas=[filtered_metadata],
    )


async def sync_observation(
    observation_id: str,
    text: str,
    metadata: Dict[str, Any],
) -> None:
    """Add or update a single observation in ChromaDB."""
    await asyncio.to_thread(_add_or_update_sync, observation_id, text, metadata)


def _sync_batch_sync(
    observation_ids: List[str],
    texts: List[str],
    metadatas: List[Dict[str, Any]],
) -> None:
    """Batch sync observations to ChromaDB synchronously."""
    _ensure_initialized()
    if _collection is None:
        raise RuntimeError("ChromaDB collection not initialized")

    # Filter metadata
    filtered_metadatas = []
    for meta in metadatas:
        filtered = {}
        for key, value in meta.items():
            if isinstance(value, (str, int, float, bool)):
                filtered[key] = value
            elif value is None:
                continue
            else:
                filtered[key] = str(value)
        filtered_metadatas.append(filtered)

    _collection.upsert(
        ids=observation_ids,
        documents=texts,
        metadatas=filtered_metadatas,
    )


async def sync_batch(
    observation_ids: List[str],
    texts: List[str],
    metadatas: List[Dict[str, Any]],
) -> None:
    """Batch sync multiple observations to ChromaDB."""
    if not observation_ids:
        return
    await asyncio.to_thread(
        _sync_batch_sync, observation_ids, texts, metadatas
    )


def _query_sync(
    query_text: str,
    n_results: int = 10,
    where: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """Query ChromaDB synchronously."""
    _ensure_initialized()
    if _collection is None:
        raise RuntimeError("ChromaDB collection not initialized")

    results = _collection.query(
        query_texts=[query_text],
        n_results=n_results,
        where=where,
        include=["distances", "metadatas", "documents"],
    )

    # Convert results to list of dicts
    output = []
    if results["ids"] and results["ids"][0]:
        ids = results["ids"][0]
        distances = results["distances"][0] if results["distances"] else [0] * len(ids)
        metadatas = results["metadatas"][0] if results["metadatas"] else [{}] * len(ids)
        documents = results["documents"][0] if results["documents"] else [""] * len(ids)

        for i, obs_id in enumerate(ids):
            output.append({
                "observation_id": obs_id,
                "distance": distances[i],
                "metadata": metadatas[i],
                "document": documents[i],
            })

    return output


async def search(
    query_text: str,
    n_results: int = 10,
    where: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """
    Perform semantic similarity search.

    Args:
        query_text: The query text to search for
        n_results: Maximum number of results to return
        where: Optional ChromaDB filter conditions

    Returns:
        List of results with observation_id, distance, metadata, document
    """
    return await asyncio.to_thread(_query_sync, query_text, n_results, where)


def _delete_sync(observation_id: str) -> None:
    """Delete an observation from ChromaDB synchronously."""
    _ensure_initialized()
    if _collection is None:
        raise RuntimeError("ChromaDB collection not initialized")

    try:
        _collection.delete(ids=[observation_id])
    except Exception as e:
        logger.warning(f"Failed to delete observation {observation_id} from ChromaDB: {e}")


async def delete_observation(observation_id: str) -> None:
    """Delete an observation from ChromaDB."""
    await asyncio.to_thread(_delete_sync, observation_id)


def _get_count_sync() -> int:
    """Get collection count synchronously."""
    _ensure_initialized()
    if _collection is None:
        return 0
    return _collection.count()


async def get_count() -> int:
    """Get the number of observations in ChromaDB."""
    return await asyncio.to_thread(_get_count_sync)


async def sync_pending_observations() -> int:
    """
    Sync all pending observations from SQLite to ChromaDB.

    Returns:
        Number of observations synced
    """
    from app.db import memory_repo

    pending = await memory_repo.get_pending_chroma_sync(limit=100)
    if not pending:
        return 0

    observation_ids = []
    texts = []
    metadatas = []

    for obs in pending:
        observation_ids.append(obs["observation_id"])
        texts.append(compose_embedding_text(obs))
        metadatas.append({
            "type": obs["type"],
            "source": obs["source"],
            "project_path": obs.get("project_path") or "",
            "event_ts": obs["event_ts"],
        })

    await sync_batch(observation_ids, texts, metadatas)
    await memory_repo.mark_chroma_synced(observation_ids)

    logger.info(f"Synced {len(observation_ids)} observations to ChromaDB")
    return len(observation_ids)


def is_available() -> bool:
    """Check if ChromaDB is available."""
    try:
        import chromadb  # noqa: F401
        return True
    except ImportError:
        return False
