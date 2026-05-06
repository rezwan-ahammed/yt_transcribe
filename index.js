import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import { Mistral } from '@mistralai/mistralai';

const app = express();
const upload = multer({ dest: 'uploads/' }); // Files will be saved here temporarily

app.use(cors());
app.use(express.json());

app.post('/get-lyrics', upload.single('audio'), async (req, res) => {
    try {
        const apiKey = process.env.MISTRAL_API_KEY;
        const client = new Mistral({ apiKey: apiKey });

        if (!req.file) return res.status(400).json({ error: "No audio file uploaded." });

        // Send the file directly from the 'uploads' folder to Mistral
        const response = await client.audio.transcriptions.complete({
            file: fs.createReadStream(req.file.path),
            model: "voxtral-mini-transcribe-v2"
        });

        // Cleanup: Delete the file after processing
        fs.unlinkSync(req.file.path);

        res.json({ lyrics: response.text });

    } catch (e) {
        if (req.file) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: e.message });
    }
});

app.listen(process.env.PORT || 10000);
