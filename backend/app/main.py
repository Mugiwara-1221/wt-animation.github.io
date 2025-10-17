from fastapi import FastAPI, WebSocket, HTTPException, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from typing import List, Dict, Any
from pydantic import BaseModel
import secrets
import os
import json

app = FastAPI()
sessions: Dict[str, Dict] = {}
sessions_data: Dict[str, Dict] = {}
session_locks = {}

class JoinRequest(BaseModel):
    username: str

class LockRequest(BaseModel):
    character: str
    username: str

class ConnectionManager:
    def __init__(self):
        self.active: Dict[str, List[WebSocket]] = {}

    async def connect(self, sid: str, websocket: WebSocket):
        await websocket.accept()
        sockets = self.active.setdefault(sid, [])
        if websocket not in sockets:
            sockets.append(websocket)

    def disconnect(self, sid: str, websocket: WebSocket):
        if sid in self.active and websocket in self.active[sid]:
            self.active[sid].remove(websocket)
            if not self.active[sid]:
                del self.active[sid]  # clean up empty session
                
    async def broadcast(self, sid: str, payload: dict | str):
        data = payload if isinstance(payload, str) else json.dumps(payload)
        dead = []
        for ws in self.active.get(sid, []):
            try:
                await ws.send_text(data)
            except Exception as e:
                print(f"[WS] Failed to send to {sid}: {e}")
                dead.append(ws)
        for ws in dead:
            self.disconnect(sid, ws)
manager = ConnectionManager()

app.add_middleware(
    CORSMiddleware,
    #allow_origins=["https://mugiwara-1221.github.io/wt-animation.github.io/"],   # or ["http://127.0.0.1:5500"]
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# @app.get("/")
# async def root():
#     return {"message": "Hello from FastAPI on Render!"}

@app.middleware("http")
async def log_requests(request, call_next):
    print("Incoming:", request.method, request.url.path)
    return await call_next(request)

def generate_unique_sid(length=6):
    return ''.join(secrets.choice("0123456789") for _ in range(length))

@app.post("/session")
async def create_session():
    sid = generate_unique_sid()
    sessions[sid] = {"users": [], "story": None}
    return {"session_id": sid}

@app.get("/session/{session_id}")
def get_session(session_id: str):
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@app.post("/session/{sid}/join")
async def join_session(sid: str, req: JoinRequest):
    if sid not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    if len(sessions[sid]["users"]) >= 6:
        raise HTTPException(status_code=400, detail="Session full")
    sessions[sid]["users"].append(req.username)
    await manager.broadcast(sid, {
        "type": "system",
        "message": f"{req.username} has joined the session."
    })
    return {"joined": True}

@app.post("/session/{session_id}/lock")
async def lock_character(session_id: int, data: LockRequest):
    if session_id not in session_locks:
        session_locks[session_id] = {}
    # Check if character is already locked
    if data.character in session_locks[session_id]:
        return {"error": "Character already locked"}, 409
    # Lock character to user
    session_locks[session_id][data.character] = data.username
    await manager.broadcast(session_id, {"type": "locks", "locks": session_locks[session_id]
    })

    return {"success": True, "character": data.character, "username": data.username, "locks": session_locks[session_id]}

@app.websocket("/ws/{sid}")
async def websocket_endpoint( sid: str, websocket: WebSocket ):
    print(f"[WS] Incoming connection for session {sid}")
    await manager.connect(sid, websocket)
    print(f"[WS] Connected: {sid}")
    await websocket.send_json({
        "type": "locks",
        "locks": session_locks.get(sid, {})
    })
    try:
        while True:
            msg = await websocket.receive_text()
            await websocket.send_text(f"Echo from {sid}: {msg}")
            print(f"[WS] Received from {sid}: {msg}")
    except WebSocketDisconnect:
        print(f"[WS] Disconnected: {sid}")
        manager.disconnect(sid, websocket)
    
app.mount("/", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "../../"), html=True), name="frontend")