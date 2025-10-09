from fastapi import FastAPI, WebSocket, HTTPException
from uuid import uuid4

app = FastAPI()
sessions = {}

@app.get("/")
def root():
    return {"message": "Backend is running"}

@app.post("/session")
def create_session():
    sid =str(uuid4())[:6]
    sessions[sid] = {"users": [], "story": None}
    return {"session_id": sid}

@app.post("/session/{sid}/join")
def join_session(sid: str, username: str):
    if sid not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    if len(sessions[sid]["users"]) >= 6:
        raise HTTPException(status_code=400, detail="Session full")
    sessions[sid]["users"].append(username)
    return {"joined": True, "users": sessions[sid]["users"]}

@app.websocket("/ws/{sid}")
async def websocked_endpoint(websocket: WebSocket, sid: str):
    await websocket.accept()
    if sid not in sessions:
        await websocket.close(code=1000)
        return