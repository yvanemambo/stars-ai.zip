const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Route pour le chat (Texte)
app.post('/chat', async (req, res) => {
    try {
        const { message } = req.body;
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: message }]
            },
            {
                headers: {
                    'Authorization': Bearer ${process.env.OPENAI_API_KEY},
                    'Content-Type': 'application/json'
                }
            }
        );
        res.json({ reply: response.data.choices[0].message.content });
    } catch (error) {
        res.status(500).json({ error: "Erreur lors de la réponse texte" });
    }
});

// Route pour la génération d'images
app.post('/generate-image', async (req, res) => {
    try {
        const { prompt } = req.body;
        const response = await axios.post(
            'https://api.openai.com/v1/images/generations',
            {
                prompt: prompt,
                n: 1,
                size: "1024x1024"
            },
            {
                headers: {
                    'Authorization': Bearer ${process.env.OPENAI_API_KEY},
                    'Content-Type': 'application/json'
                }
            }
        );
        res.json({ imageUrl: response.data.data[0].url });
    } catch (error) {
        res.status(500).json({ error: "Erreur lors de la génération d'image" });
    }
});

app.listen(PORT, () => {
    console.log(Serveur lancé sur le port ${PORT});
});
