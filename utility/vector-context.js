const { Index } = require("@upstash/vector");

const vectorIndex = new Index({
    url: process.env.UPSTASH_VECTOR_REST_URL,
    token: process.env.UPSTASH_VECTOR_REST_TOKEN, // This was likely a typo before
});

const searchSimilarDocs = async (data, topK) => {
    const results = await vectorIndex.query({
        data,
        topK: topK || 5,
        includeMetadata: true,
        includeData: true,
    });
    const context = results.map(doc => doc.data).join("\n");
    return context;
};

module.exports = { searchSimilarDocs };
