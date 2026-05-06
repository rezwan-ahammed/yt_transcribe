import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import youtubedl from 'youtube-dl-exec';
import { Mistral } from '@mistralai/mistralai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

app.post('/get-lyrics', async (req, res) => {
    try {
        const apiKey = process.env.MISTRAL_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: "ERROR: MISTRAL_API_KEY is not set." });
        }
        
        const client = new Mistral({ apiKey: apiKey });
        const url = req.body.url;
        
        if (!url) {
            return res.status(400).json({ error: "No YouTube URL provided" });
        }

        // Create a unique audio file name
        const audioFilePath = path.join(__dirname, `temp_audio_${Date.now()}.mp3`);

        try {
            // 1. Download using youtube-dl-exec 
            // We tell it to pretend to be an Android client to bypass bot checks
            await youtubedl(url, {
                extractAudio: true,
                audioFormat: 'mp3',
                output: audioFilePath,
                extractorArgs: 'youtube:player_client=android'
            });

            // 2. Send the downloaded file to Mistral
            const fileStream = fs.createReadStream(audioFilePath);
            const response = await client.audio.transcriptions.complete({
                file: fileStream,
                model: "voxtral-mini-transcribe-v2"
            });
            
            // 3. Cleanup temp file and send lyrics back to your app
            fs.unlinkSync(audioFilePath);
            res.json({ lyrics: response.text });

        } catch (err) {
            if (fs.existsSync(audioFilePath)) fs.unlinkSync(audioFilePath);
            
            // Send back a clean error message
            res.status(400).json({ error: `Download or AI Failed: ${err.message.split('\n')[0]}` });
        }

    } catch (e) {
        res.status(500).json({ error: `Server Error: ${e.message}` });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
