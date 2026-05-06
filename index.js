import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import { Mistral } from '@mistralai/mistralai';

const app = express();
const upload = multer({ dest: 'uploads/' }); // Temporary folder for incoming audio

app.use(cors());
app.use(express.json());

app.post('/get-lyrics', upload.single('audio'), async (req, res) => {
    const filePath = req.file?.path;
    try {
        const apiKey = process.env.MISTRAL_API_KEY;
        const client = new Mistral({ apiKey: apiKey });

        if (!req.file) throw new Error("No audio file received from phone.");

        // Hand the file directly to Mistral
        const response = await client.audio.transcriptions.complete({
            file: fs.createReadStream(filePath),
            model: "voxtral-mini-transcribe-v2"
        });

        fs.unlinkSync(filePath); // Delete temp file
        res.json({ lyrics: response.text });

    } catch (e) {
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.status(500).json({ error: e.message });
    }
});

app.listen(process.env.PORT || 10000);
