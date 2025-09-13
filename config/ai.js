// /config/ai.js
module.exports = {
  // pull secrets from env or OS keychain
  getConfig() {
    return {
      provider: process.env.AI_PROVIDER || 'openai',
      baseURL: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
      model:    process.env.AI_MODEL    || 'gpt-4o-mini',
      // DO NOT expose the key to the browser
      hasKey:   !!process.env.AI_API_KEY
    };
  }
};
