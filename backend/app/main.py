from fastAPI import FastAPI, WebSocket, HTTPException
from uuid import uuid4

app = FastAPI()
sessions = {}

@app.post("/session")
def create_session():
    sid =str(uuid4())
    sessions[sid] = {"users": [], "story": None}
    return {"session_id": sid}

@app.post("/session/{sid}/join")
def join_session(sid: str, username: str):
    if sid not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    if len(sessions[sid]["users"]) >= 6:
        raise HTTPException(status_code=400, detail="Session full")
    sessions[sid]["users"].append(username)
    return {"message": f"{username} joined session {sid}"}