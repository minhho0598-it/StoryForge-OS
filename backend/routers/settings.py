from fastapi import APIRouter, HTTPException

from core.database import supabase
from core.render_config import get_global_render_config, save_global_render_config
from core.story_prompts import get_creative_prompt_catalog
from schemas import UpdateGlobalRenderConfigRequest

router = APIRouter()


@router.get("/api/settings/render-config")
async def get_default_render_config():
    try:
        return {"success": True, "render_config": get_global_render_config(supabase)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/settings/story-prompts")
async def get_story_prompt_catalog():
    try:
        return {
            "success": True,
            "prompts": get_creative_prompt_catalog(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/api/settings/render-config")
async def update_default_render_config(request: UpdateGlobalRenderConfigRequest):
    try:
        config = save_global_render_config(supabase, request.render_config.model_dump())
        return {"success": True, "render_config": config}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
