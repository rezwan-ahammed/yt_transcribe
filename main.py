import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import yt_dlp
from mistralai import Mistral

app = FastAPI()

class URLRequest(BaseModel):
    url: str

@app.post("/get-lyrics")
async def generate_lyrics(request: URLRequest):
    # 1. Check for the API Key safely
    api_key = os.environ.get("MISTRAL_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ERROR: MISTRAL_API_KEY is not set in Render Environment Variables.")
    
    client = Mistral(api_key=api_key)
    audio_file_path = "temp_audio.m4a"
    
    # 2. Download Audio
    ydl_opts = {'format': 'm4a/bestaudio/best', 'outtmpl': audio_file_path, 'quiet': True}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([request.url])
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"YouTube Download Failed: {str(e)}")

    # 3. Transcribe with Mistral
    try:
        with open(audio_file_path, "rb") as audio_file:
            response = client.audio.transcriptions.complete(
                file=audio_file,
                model="voxtral-mini-transcribe-v2"
            )
        
        os.remove(audio_file_path)
        return {"lyrics": response.text}
        
    except Exception as e:
        if os.path.exists(audio_file_path):
            os.remove(audio_file_path)
        raise HTTPException(status_code=500, detail=f"Mistral AI Failed: {str(e)}")
