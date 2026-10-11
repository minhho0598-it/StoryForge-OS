from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers.beats import router as beats_router
from routers.chapters import router as chapters_router
from routers.projects import router as projects_router
from routers.render import router as render_router
from routers.settings import router as settings_router

app = FastAPI(title="Story Maker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects_router)
app.include_router(chapters_router)
app.include_router(beats_router)
app.include_router(settings_router)
app.include_router(render_router)
