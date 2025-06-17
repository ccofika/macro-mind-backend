const { OpenAI } = require('openai');
const dotenv = require('dotenv');

dotenv.config();

// Initialize OpenAI client with API key from environment variables
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Improves text using OpenAI
 * @param {string} originalText - The original text to improve
 * @param {string} improvements - Description of improvements needed
 * @returns {Promise<string>} - The improved text
 */
exports.improveText = async (originalText, improvements) => {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-nano-2025-04-14", // Use nano version or change to available model
      messages: [
        {
          role: "system",
          content: "You are improving customer service macro responses. Keep the same structure and tone. Distinct any part in the final answer which should be logically distincted using (\\n\\n)"
        },
        {
          role: "user",
          content: `Original: ${originalText}\n\nImprovements needed: ${improvements}`
        }
      ],
      temperature: 0.3,
      max_tokens: 500
    });
    
    return response.choices[0].message.content;
  } catch (error) {
    console.error('OpenAI API error:', error);
    throw new Error('Failed to improve text with AI');
  }
};