import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import play from 'play-dl';
import { Mistral } from '@mistralai/mistralai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

app.post('/get-lyrics', async (req, res) => {
    // Generate a unique filename for concurrent users
    const audioFilePath = path.join(__dirname, `temp_${Date.now()}.webm`);
    
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

        // 1. Download audio using play-dl (bypasses bot protections natively)
        const info = await play.video_info(url);
        
        // Quality 2 extracts the pure audio stream
        const stream = await play.stream_from_info(info, { quality: 2 }); 
        const writeStream = fs.createWriteStream(audioFilePath);
        
        stream.stream.pipe(writeStream);

        // 2. Once the download finishes, send it to Mistral
        writeStream.on('finish', async () => {
            try {
                const fileStream = fs.createReadStream(audioFilePath);
                const response = await client.audio.transcriptions.complete({
                    file: fileStream,
                    model: "voxtral-mini-transcribe-v2"
                });
                
                // Cleanup and send lyrics to Sketchware
                fs.unlinkSync(audioFilePath);
                res.json({ lyrics: response.text });
                
            } catch (err) {
                if (fs.existsSync(audioFilePath)) fs.unlinkSync(audioFilePath);
                res.status(500).json({ error: `Mistral AI Failed: ${err.message}` });
            }
        });

    } catch (e) {
        if (fs.existsSync(audioFilePath)) fs.unlinkSync(audioFilePath);
        res.status(400).json({ error: `YouTube Extraction Failed: ${e.message}` });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
