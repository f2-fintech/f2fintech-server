/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 */

const axios = require('axios');
const { searchSimilarDocs } = require('../../utility/vector-context');

/**
 * Handle chat requests by forwarding to Together AI API
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.handleChat = async (req, res) => {
    const { message } = req.body;
    console.log('get reply from bot for: ', message)

    const context = await searchSimilarDocs(message, 5)

    const systemPrompt = `
You are a helpful AI finance assistant. Use the following context extracted from a PDF to answer the user’s question.
Only use the provided context. If the context does not contain the answer, say you don't know.
Context: ${context}
`;

    if (!message) {
        return res.status(400).json({ error: 'Please provide a message' });
    }

    try {
        const response = await axios.post(
            'https://api.together.xyz/v1/chat/completions',
            {
                model: 'deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free',
                stream: true,
                messages: [
                    { role: 'user', content: `${systemPrompt}\n\n question: ${message}` }
                ],
                // temperature: 0.7,
                // max_tokens: 500
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