"""Thin HTTP layer around the existing Team Hybrid recommendation service."""
from dataclasses import dataclass
from threading import Lock
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from src.embeddings import EmbeddingCache, EmbeddingConfigurationError

from .adapters import to_service_inputs
from .schemas import HealthResponse, MoreRequest, RecommendationResponse, StartRequest


class ContextNotFound(Exception):
    pass


class PageUnavailable(Exception):
    pass


@dataclass
class _Context:
    service: object
    post: dict
    conditions: object
    state: dict
    recruitment_id: str
    role_id: str


def _default_embedding_factory():
    # Import and construct the network client only for a recommendation request.
    # Health and app startup never require an API key or contact the provider.
    from dotenv import load_dotenv

    load_dotenv()
    return EmbeddingCache()


class RecommendationContexts:
    """In-process holder for the existing service's saved ranking and state."""

    def __init__(self, embedding_factory):
        self._embedding_factory = embedding_factory
        self._contexts: dict[str, _Context] = {}
        self._lock = Lock()

    @staticmethod
    def _response(context_id, context, page):
        reason_inputs = context.service.reason_inputs(context.state, page)
        reasons = context.service.explain_page(context.state, page)
        candidates = []
        for selected, ranked, reason in zip(
                page["candidates"], reason_inputs["final_candidates"], reasons, strict=True):
            if selected["user_id"] != ranked["user_id"] or selected["user_id"] != reason["user_id"]:
                raise AssertionError("Reason output changed candidate membership or order")
            candidates.append({
                "user_id": selected["user_id"],
                "score": selected["score"],
                "raw_rank": selected["raw_rank"],
                "display_rank": selected["display_rank"],
                "best_experience_id": ranked.get("best_experience_id") or None,
                "reason_items": reason["reason_items"],
            })
        return RecommendationResponse(
            context_id=context_id,
            recruitment_id=context.recruitment_id,
            role_id=context.role_id,
            page=page["page"], page_size=5,
            candidates=candidates, next_action=page["next_action"],
        )

    def start(self, request: StartRequest):
        service, post, conditions = to_service_inputs(request, self._embedding_factory())
        page, state = service.start(
            post, conditions, excluded_user_ids=set(request.excluded_user_ids))
        context_id = "rec_" + uuid4().hex
        context = _Context(service, post, conditions, state,
                           request.recruitment.recruitment_id, request.target_role.role_id)
        response = self._response(context_id, context, page)
        # Reuse the service's two existing five-person selections and saved raw order.
        # Reason generation still runs in batches of at most five.
        candidates = list(response.candidates)
        if page["next_action"] == "SHOW_MORE":
            second, state = service.show_more(post, conditions, state,
                                              excluded_user_ids=set(request.excluded_user_ids))
            context.state = state
            candidates.extend(self._response(context_id, context, second).candidates)
        for rank, candidate in enumerate(candidates, 1):
            candidate.display_rank = rank
        response = RecommendationResponse(
            context_id=context_id, recruitment_id=context.recruitment_id, role_id=context.role_id,
            page=1, page_size=10, candidates=candidates, next_action="CHANGE_CONDITIONS")
        with self._lock:
            self._contexts[context_id] = context
        return response

    def more(self, context_id: str, request: MoreRequest):
        with self._lock:
            context = self._contexts.get(context_id)
            if context is None:
                raise ContextNotFound
            try:
                page, state = context.service.show_more(
                    context.post, context.conditions, context.state,
                    excluded_user_ids=set(request.excluded_user_ids))
            except ValueError as exc:
                raise PageUnavailable from exc
            updated = _Context(context.service, context.post, context.conditions, state,
                               context.recruitment_id, context.role_id)
            response = self._response(context_id, updated, page)
            self._contexts[context_id] = updated
            return response


def create_app(embedding_factory=None):
    app = FastAPI(title="Knot AI Recommendation API", version="1.0.0")
    app.state.recommendations = RecommendationContexts(
        embedding_factory or _default_embedding_factory)

    @app.exception_handler(EmbeddingConfigurationError)
    async def embedding_configuration_error(request, exc):
        return JSONResponse(status_code=503, content={"detail": str(exc)})

    @app.get("/health", response_model=HealthResponse)
    def health():
        return HealthResponse()

    @app.post("/api/v1/recommendations", response_model=RecommendationResponse)
    def start_recommendation(payload: StartRequest, request: Request):
        return request.app.state.recommendations.start(payload)

    @app.post("/api/v1/recommendations/{context_id}/more",
              response_model=RecommendationResponse, deprecated=True)
    def more_recommendations(context_id: str, payload: MoreRequest, request: Request):
        try:
            return request.app.state.recommendations.more(context_id, payload)
        except ContextNotFound:
            raise HTTPException(status_code=404, detail="Recommendation context not found.") from None
        except PageUnavailable:
            raise HTTPException(status_code=409, detail="No more recommendation page; change conditions.") from None

    return app


app = create_app()
