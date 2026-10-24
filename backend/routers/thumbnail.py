from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Path
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from services import thumbnail_service
from services.thumbnail_service import ThumbnailJob, validate_thumbnail_job

router = APIRouter()


class ThumbnailJobRequest(ThumbnailJob):
    job_id: str = Field(min_length=1, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")


class ThumbnailValidationResponse(BaseModel):
    success: bool
    valid: bool
    job_id: str
    errors: list[str]


class ThumbnailRenderResponse(BaseModel):
    success: bool
    job_id: str
    status: str
    checks: dict[str, Any]
    errors: list[str]
    warnings: list[str]
    render: dict[str, Any]
    files: dict[str, str]


@router.post(
    "/api/thumbnails/validate",
    response_model=ThumbnailValidationResponse,
)
def validate_thumbnail(job: ThumbnailJobRequest):
    try:
        _, errors = validate_thumbnail_job(job)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        "success": not errors,
        "valid": not errors,
        "job_id": job.job_id,
        "errors": errors,
    }


@router.post(
    "/api/thumbnails/render",
    response_model=ThumbnailRenderResponse,
)
def render_thumbnail(job: ThumbnailJobRequest):
    try:
        report = thumbnail_service.render_thumbnail(job)
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    if report["status"] == "failed":
        raise HTTPException(
            status_code=422,
            detail={"job_id": job.job_id, "errors": report["errors"]},
        )

    files = {
        "image": f"/api/thumbnails/{job.job_id}/files/image",
        "svg": f"/api/thumbnails/{job.job_id}/files/svg",
        "qa": f"/api/thumbnails/{job.job_id}/files/qa",
    }
    report["render"]["image"] = files["image"]
    report["render"]["svg"] = files["svg"]
    return {
        "success": True,
        "job_id": job.job_id,
        **report,
        "files": files,
    }


@router.get("/api/thumbnails/{job_id}/files/{artifact}")
async def get_thumbnail_artifact(
    job_id: str = Path(pattern=r"^[A-Za-z0-9_-]{1,80}$"),
    artifact: Literal["image", "svg", "qa"] = "image",
):
    media_type = {
        "image": "image/png",
        "svg": "image/svg+xml",
        "qa": "application/json",
    }[artifact]
    try:
        path = thumbnail_service.thumbnail_artifact_path(job_id, artifact)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return FileResponse(
        path,
        media_type=media_type,
        filename=path.name,
        headers={"Cache-Control": "no-store"},
    )
