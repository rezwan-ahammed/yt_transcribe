import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ytdl from '@distube/ytdl-core';
import { Mistral } from '@mistralai/mistralai';

// Setup for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json()); // Allows the server to read the JSON sent from Sketchware

// Render provides a dynamic PORT, or we default to 10000
const PORT = process.env.PORT || 10000;

app.post('/get-lyrics', async (req, res) => {
    try {
        // 1. Safe API Key Check
        const apiKey = process.env.MISTRAL_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: "ERROR: MISTRAL_API_KEY is not set." });
        }
        
        const client = new Mistral({ apiKey: apiKey });
        const url = req.body.url;
        
        if (!url) {
            return res.status(400).json({ error: "No YouTube URL provided" });
        }

        const audioFilePath = path.join(__dirname, 'temp_audio.mp3');

        // 2. Download Audio safely using native Node tools
        const stream = ytdl(url, { quality: 'highestaudio', filter: 'audioonly' });
        const writeStream = fs.createWriteStream(audioFilePath);
        
        stream.pipe(writeStream);

        // 3. Process the audio once the download finishes
        writeStream.on('finish', async () => {
            try {
                const fileStream = fs.createReadStream(audioFilePath);
                
                // Send to Mistral's transcription model
                const response = await client.audio.transcriptions.complete({
                    file: fileStream,
                    model: "voxtral-mini-transcribe-v2"
                });
                
                // Cleanup temp file and send lyrics back to app
                fs.unlinkSync(audioFilePath);
                res.json({ lyrics: response.text });
                
            } catch (err) {
                if (fs.existsSync(audioFilePath)) fs.unlinkSync(audioFilePath);
                res.status(500).json({ error: `Mistral AI Failed: ${err.message}` });
            }
        });

        // Handle download errors gracefully
        stream.on('error', (err) => {
            res.status(400).json({ error: `YouTube Download Failed: ${err.message}` });
        });

    } catch (e) {
        res.status(500).json({ error: `Server Error: ${e.message}` });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
