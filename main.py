import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import yt_dlp
from mistralai import Mistral

app = FastAPI()

# Get the Mistral API key from environment variables
api_key = os.environ.get("MISTRAL_API_KEY")
if not api_key:
    raise ValueError("MISTRAL_API_KEY is not set in the environment")

# Initialize the Mistral client
client = Mistral(api_key=api_key)

class URLRequest(BaseModel):
    url: str

@app.post("/get-lyrics")
async def generate_lyrics(request: URLRequest):
    audio_file_path = "temp_audio.m4a"
    
    # Download audio via yt-dlp
    ydl_opts = {'format': 'm4a/bestaudio/best', 'outtmpl': audio_file_path, 'quiet': True}
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([request.url])
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Download failed: {str(e)}")

    try:
        # Open the downloaded file and send it to Mistral
        with open(audio_file_path, "rb") as audio_file:
            response = client.audio.transcriptions.complete(
                file=audio_file,
                model="voxtral-mini-transcribe-v2" # Mistral's dedicated transcription model
            )
        
        # Cleanup temporary file
        os.remove(audio_file_path)
        
        # Return the transcription text
        return {"lyrics": response.text}
        
    except Exception as e:
        if os.path.exists(audio_file_path):
            os.remove(audio_file_path)
        raise HTTPException(status_code=500, detail=f"Mistral Processing failed: {str(e)}")
