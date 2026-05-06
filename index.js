import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Mistral } from '@mistralai/mistralai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

function extractVideoId(url) {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
    const match = url.match(regex);
    return match ? match[1] : null;
}

// A list of the most reliable public Piped instances
const PIPED_INSTANCES = [
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.tokhmi.xyz",
    "https://pipedapi.syncpundit.io",
    "https://pipedapi.smnz.de",
    "https://piped-api.lunar.icu",
    "https://pipedapi.adminforge.de"
];

app.post('/get-lyrics', async (req, res) => {
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

        let audioUrl = null;

        // 1. Proxy Fallback Loop: Try servers until one successfully returns the audio
        for (const proxy of PIPED_INSTANCES) {
            try {
                const pipedRes = await fetch(`${proxy}/streams/${videoId}`);
                if (pipedRes.ok) {
                    const streamData = await pipedRes.json();
                    if (streamData.audioStreams && streamData.audioStreams.length > 0) {
                        // Success! We found a working proxy. Grab the URL and stop searching.
                        audioUrl = streamData.audioStreams[0].url;
                        console.log(`Successfully connected via: ${proxy}`);
                        break; 
                    }
                }
            } catch (err) {
                // If this proxy fails or is busy, silently move to the next one
                continue; 
            }
        }

        // If it looped through all 6 proxies and failed, throw an error
        if (!audioUrl) {
            throw new Error("All global proxy servers are currently busy. Please try again in 60 seconds.");
        }

        // 2. Download the audio file into memory
        const audioStreamRes = await fetch(audioUrl);
        if (!audioStreamRes.ok) {
            throw new Error("Failed to download audio file from the selected proxy.");
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
        
        // 4. Cleanup and send lyrics
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
