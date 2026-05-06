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

const PIPED_INSTANCES = [
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.tokhmi.xyz",
    "https://pipedapi.syncpundit.io"
];

app.post('/get-lyrics', async (req, res) => {
    const audioFilePath = path.join(__dirname, `temp_${Date.now()}.mp3`);

    try {
        const apiKey = process.env.MISTRAL_API_KEY;
        const client = new Mistral({ apiKey: apiKey });
        const url = req.body.url;
        
        if (!url) return res.status(400).json({ error: "No URL provided." });

        let audioUrl = null;

        // --- STRATEGY 1: COBALT API (The strongest bypass) ---
        try {
            console.log("Trying Cobalt...");
            const cobaltRes = await fetch('https://api.cobalt.tools/api/json', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    url: url,
                    downloadMode: 'audio',
                    audioFormat: 'mp3',
                    audioBitrate: '128'
                })
            });

            const cobaltData = await cobaltRes.json();
            if (cobaltData.status === 'stream' || cobaltData.status === 'picker') {
                audioUrl = cobaltData.url || cobaltData.picker[0].url;
            }
        } catch (e) {
            console.log("Cobalt failed, falling back to Piped...");
        }

        // --- STRATEGY 2: PIPED FALLBACK (If Cobalt fails) ---
        if (!audioUrl) {
            for (const proxy of PIPED_INSTANCES) {
                try {
                    const videoId = url.match(/(?:youtu\.be\/|youtube\.com\/(?:.*v=|.*\/|.*embed\/))([^"&?\/\s]{11})/)?.[1];
                    const pipedRes = await fetch(`${proxy}/streams/${videoId}`);
                    if (pipedRes.ok) {
                        const streamData = await pipedRes.json();
                        if (streamData.audioStreams?.length > 0) {
                            audioUrl = streamData.audioStreams[0].url;
                            break;
                        }
                    }
                } catch (err) { continue; }
            }
        }

        if (!audioUrl) throw new Error("YouTube blocked all extraction attempts. Try a different video link.");

        // --- DOWNLOAD & TRANSCRIBE ---
        const audioStreamRes = await fetch(audioUrl);
        const arrayBuffer = await audioStreamRes.arrayBuffer();
        fs.writeFileSync(audioFilePath, Buffer.from(arrayBuffer));

        const response = await client.audio.transcriptions.complete({
            file: fs.createReadStream(audioFilePath),
            model: "voxtral-mini-transcribe-v2"
        });
        
        fs.unlinkSync(audioFilePath);
        res.json({ lyrics: response.text });

    } catch (e) {
        if (fs.existsSync(audioFilePath)) fs.unlinkSync(audioFilePath);
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
