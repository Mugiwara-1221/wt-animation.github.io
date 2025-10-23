from fastapi import FastAPI, WebSocket, HTTPException, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from typing import List, Dict, Any
from pydantic import BaseModel
import secrets
import os
import json
import asyncio

p = "123456@windtree"
app = FastAPI()
sessions: Dict[str, Dict] = {}

class JoinRequest(BaseModel):
    user_id: int

class LockRequest(BaseModel):
    character: str
    user_id: int

class SaveFramesRequest(BaseModel):
    user_id: int
    character: str
    frames: List[str]
    fps: int

class ConnectionManager:
    def __init__(self):
        self.active: Dict[str, List[WebSocket]] = {}

    async def connect(self, sid: str, websocket: WebSocket):
        await websocket.accept()
        sockets = self.active.setdefault(sid, [])
        if websocket not in sockets:
            sockets.append(websocket)
        print(f"[WS] Connected {sid}, total sockets={len(sockets)}")

    def disconnect(self, sid: str, websocket: WebSocket):
        if sid in self.active and websocket in self.active[sid]:
            self.active[sid].remove(websocket)
            if not self.active[sid]:
                del self.active[sid]  # clean up empty session
                
    async def broadcast(self, sid: str, payload: dict | str):
        data = payload if isinstance(payload, str) else json.dumps(payload)
        #print(data)
        dead = []
        sockets = self.active.get(sid, [])
        for ws in sockets:
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
    #allow_origins=["http://127.0.0.1:8000", "https://mugiwara-1221.github.io/wt-animation.github.io/"],
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
    sessions[sid] = {
        "users": {1: {"id": 1, "label": "Guest 1"}},  # use dict keyed by user_id for easier lookups
        "locks": {},       # character → user_id
        "drawings": {},    # character → {user_id, frames, fps}
        "data": {}         # extra metadata (story, grade, etc.)
    }
    return {"session_id": sid, "user_id":1, "label": "Guest 1"}

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
    session = sessions[sid]
    if len(sessions[sid]["users"]) >= 6:
        raise HTTPException(status_code=400, detail="Session full")
    new_id = len(session["users"])+1
    label = req.user_id or f"Guest {new_id}"
    user = {"id": new_id, "label": label}
    session["users"][new_id] = user
    await manager.broadcast(sid, {
        "type": "system",
        "message": f"{label} has joined the session."
    })
    return {"joined": True, "user_id": new_id, "label": label}

@app.post("/session/{sid}/lock")
async def lock_character(sid: str, data: LockRequest):
    session = sessions.setdefault(sid, {
        "users": {},
        "locks": {},
        "drawings": {},
        "data": {}
    })
    # Check if character is already locked
    current_locks = session["locks"]
    owner = current_locks.get(data.character)
    print("Trying to lock:", data.character, "for", data.user_id)
    if owner and owner != data.user_id:
        raise HTTPException(status_code=409, detail="Character already locked")
    # Lock character to user
    current_locks[data.character] = data.user_id
    print(f"[BROADCAST] {sid} locks -> {current_locks}")
    await manager.broadcast( sid, {"type": "locks", "locks": current_locks})
    return {"success": True, "character": data.character, "user_id": data.user_id, "locks": current_locks}

@app.post("/session/{sid}/unlock")
async def unlock_character(sid: str, data: LockRequest):
    if sid not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    # Only unlock if this user actually owns the lock
    session = sessions[sid]
    locks = session["locks"]
    onwer = locks.get(data.character)
    if onwer is None:
        raise HTTPException(status_code=404, detail="Charater not locked")
    if onwer != data.user_id:
        raise HTTPException(status_code=403, detail="You do not own this lock")
    del locks[data.character]
    await manager.broadcast(sid, {
        "type": "locks",
        "locks": locks
    })
    return {"success": True, "charater": data.character}
    
@app.post("/session/{sid}/save_frames")
async def save_frames(sid: str, data: SaveFramesRequest):
    session = sessions.setdefault(sid, {
        "users": {}, "locks": {}, "drawings": {}, "data": {}
    })
    # Always ensure frames dict exists
    if "frames" not in session:
        session["frames"] = {}
    now = asyncio.get_event_loop().time()
    # Ensure this character has a slot with a list
    char_store = session["frames"].setdefault(data.character, {
        "user_id": data.user_id,
        "frames": [],
        "fps": data.fps,
        "start_time": now
    })
    # Append new frames if provided
    if data.frames:
        char_store["frames"].extend(data.frames)
    # Update metadata
    char_store["fps"] = data.fps
    char_store["start_time"] = now
    await manager.broadcast(sid, {
        "type": "character_frames",
        "character": data.character,
        "user_id": data.user_id,
        "frames": char_store["frames"],
        "fps": char_store["fps"],
        "start_time": char_store["start_time"]
    })
    return {"success": True}

@app.get("/session/{sid}/frames")
async def get_frames(sid: str):
    session = sessions.get(sid)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session.get("frames", {})

@app.websocket("/ws/{sid}")
async def websocket_endpoint( sid: str, websocket: WebSocket ):
    print(f"[WS] Incoming connection for session {sid}")
    await manager.connect(sid, websocket)
    print(f"[WS] Connected: {sid}")
    session = sessions.setdefault(sid, {
        "users": {},
        "locks": {},
        "drawings": {},
        "data": {}
    })
    await websocket.send_json({
        "type": "locks",
        "locks": session["locks"]
    })
    await websocket.send_json({
        "type": "all_characters",
        "characters": session["drawings"]
    })
    try:
        while True:
            raw = await websocket.receive_text()
            print(f"[WS] Received from {sid}: {raw}")
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            # If it's a character_frames update, broadcast to everyone
            if msg.get("type") == "character_frames":
                now = asyncio.get_event_loop().time()
                msg["start_time"] = now
                session["drawings"][msg["character"]] = {
                    "frames": msg["frames"],
                    "fps": msg["fps"],
                    "start_time": now
                }
                await manager.broadcast(sid, msg)
            else:
                # fallback: echo or handle other message types
                await websocket.send_text(f"Echo from {sid}: {raw}")
    except WebSocketDisconnect:
        print(f"[WS] Disconnected: {sid}")
        manager.disconnect(sid, websocket)
        user_id = websocket.scope.get("user_id")
        if user_id is not None:
            locks = session["locks"]
            to_remove = [char for char, owner in locks.item() if owner == user_id]
            for char in to_remove:
                del locks[char]
            # Broadcast updated locks
            await manager.broadcast(sid, {
                "type": "locks",
                "locks": locks
            })

app.mount("/", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "../../"), html=True), name="frontend")