from fastAPI import FastAPI, WebSocket, HTTPException
from uuid import uuid4

app = FastAPI()
sessions = {}

