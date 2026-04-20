"""
JW 연설 준비 도우미 - FastAPI 백엔드 v8
모듈화: config, db, models, services/, routers/
"""
import threading
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import _abort_event

app = FastAPI(title="JW 연설 준비 도우미 API v8")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 스트리밍 중단
@app.post("/api/abort")
def abort_generation():
    _abort_event.set()
    return {"status": "중단 요청됨"}

# 라우터 등록
from routers import settings, bible, generate, chat, preprocess, manage, draft, stt

app.include_router(settings.router)
app.include_router(bible.router)
app.include_router(generate.router)
app.include_router(chat.router)
app.include_router(preprocess.router)
app.include_router(manage.router)
app.include_router(draft.router)
app.include_router(stt.router)


@app.on_event("startup")
async def _on_startup():
    from routers.stt import reset_stuck_jobs
    reset_stuck_jobs()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
