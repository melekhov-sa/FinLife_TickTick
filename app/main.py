from fastapi import FastAPI
from fastapi.responses import HTMLResponse

app = FastAPI(title="FinLife")

@app.get("/", response_class=HTMLResponse)
def index():
    return "<h1>FinLife is running ✅</h1><p>Local dev ok.</p>"
