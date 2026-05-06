import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Mistral } from '@mistralai/mistralai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

// Helper function to extract just the 11-character Video ID from the link
function extractVideoId(url) {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
    const match = url.match(regex);
    return match ? match[1] : null;
}

app.post('/get-lyrics', async (req, res) => {
    // Generate a unique filename for the incoming request
    const audioFilePath = path.join(__dirname, `temp_${Date.now()}.m4a`);

    try {
        const apiKey = process.env.MISTRAL_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: "MISTRAL_API_KEY is not set in Render." });
        }
        
        const client = new Mistral({ apiKey: apiKey });
        const url = req.body.url;
        
        if (!url) {
            return res.status(400).json({ error: "No URL provided." });
        }

        const videoId = extractVideoId(url);
        if (!videoId) {
            return res.status(400).json({ error: "Invalid YouTube URL format." });
        }

        // 1. Ask the Piped Proxy API for the unblocked audio streams
        const pipedRes = await fetch(`https://pipedapi.kavin.rocks/streams/${videoId}`);
        if (!pipedRes.ok) {
            throw new Error("Could not fetch bypass stream. The proxy might be busy.");
        }
        
        const streamData = await pipedRes.json();
        
        if (!streamData.audioStreams || streamData.audioStreams.length === 0) {
            throw new Error("No audio streams found for this video.");
        }

        // Extract the best, unblocked audio stream URL
        const audioUrl = streamData.audioStreams[0].url;

        // 2. Download the audio file into memory, then save to disk
        const audioStreamRes = await fetch(audioUrl);
        if (!audioStreamRes.ok) {
            throw new Error("Failed to download audio file from proxy.");
        }

        const arrayBuffer = await audioStreamRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        fs.writeFileSync(audioFilePath, buffer);

        // 3. Send the saved audio file to Mistral AI
        const fileStream = fs.createReadStream(audioFilePath);
        const response = await client.audio.transcriptions.complete({
            file: fileStream,
            model: "voxtral-mini-transcribe-v2"
        });
        
        // 4. Cleanup the temporary file and send lyrics back to Sketchware!
        fs.unlinkSync(audioFilePath);
        res.json({ lyrics: response.text });

    } catch (e) {
        if (fs.existsSync(audioFilePath)) fs.unlinkSync(audioFilePath);
        res.status(500).json({ error: `Process Failed: ${e.message}` });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
