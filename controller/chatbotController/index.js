/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 */

const axios = require('axios');

/**
 * Handle chat requests by forwarding to Together AI API
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.handleChat = async (req, res) => {
    const { message } = req.body;
    console.log('get reply from bot for: ', message)

    if (!message) {
        return res.status(400).json({ error: 'Please provide a message' });
    }

    try {
        const response = await axios.post(
            'https://api.together.xyz/v1/chat/completions',
            {
                model: 'deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free',
                messages: [
                    { role: 'user', content: message }
                ],
                temperature: 0.7,
                max_tokens: 500
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        console.log('response', response.data);

        // Extract the response text from Together API
        const reply = response.data.choices[0].message.content;
        res.json({ reply });
    } catch (err) {
        console.error('Together API Error:', err.response?.data || err.message);
        res.status(500).json({ error: 'Error talking to Together API' });
    }
};