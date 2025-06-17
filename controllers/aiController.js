// server/controllers/aiController.js

// Load guidelines from file
const fs = require('fs');
const path = require('path');
const guidelinesFilePath = path.join(__dirname, '../data/agent-guidelines.txt');
const { OpenAI } = require('openai');
const dotenv = require('dotenv');
dotenv.config();

// Initialize OpenAI client with API key from environment variables
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

let agentGuidelines = '';

try {
  // Load guidelines from file
  agentGuidelines = fs.readFileSync(guidelinesFilePath, 'utf8');
  console.log('Agent guidelines loaded successfully, length:', agentGuidelines.length);
} catch (error) {
  console.error('Failed to load agent guidelines:', error);
  agentGuidelines = 'Be professional, clear, and helpful in all communications.';
}

exports.improveResponse = async (req, res) => {
  try {
    const { originalText, improvements, systemPrompt, userPrompt } = req.body;
    const userId = req.user.email; // Get the user ID from the authenticated request
    
    if (!originalText) {
      return res.status(400).json({ message: 'Original text is required' });
    }
    
    if (!improvements) {
      return res.status(400).json({ message: 'Improvement requirements are required' });
    }
    
    // Use the loaded guidelines in the system prompt
    try {
      // If we have a system prompt from the client, use it
      // Otherwise use the server guidelines
      const effectiveSystemPrompt = systemPrompt || 
        `You are improving customer service responses according to these guidelines:
         
         ${agentGuidelines.length > 2000 
           ? agentGuidelines.substring(0, 2000) + "...[guidelines truncated for length]"
           : agentGuidelines}
         
         Ensure paragraphs are properly separated with double line breaks.`;
      
      // Use the user prompt from the client or create a standard one
      const effectiveUserPrompt = userPrompt ||
        `Original: ${originalText}\n\nImprovements needed: ${improvements}`;
      
      console.log(`Processing AI improvement with ${effectiveSystemPrompt.length} chars system prompt for user: ${userId}`);
      
      const response = await openai.chat.completions.create({
        model: "gpt-4.1-nano-2025-04-14",
        messages: [
          {
            role: "system",
            content: effectiveSystemPrompt
          },
          {
            role: "user",
            content: effectiveUserPrompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      });
      
      let improvedText = response.choices[0].message.content;
      
      // Ensure proper paragraph formatting with \n\n
      improvedText = improvedText
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/([^\n])\n([^\n])/g, '$1\n\n$2')
        .trim();
      
      res.status(200).json({ improvedText });
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error('Failed to improve text with AI');
    }
  } catch (error) {
    console.error('Error in improveResponse:', error);
    res.status(500).json({ message: 'Server error processing AI request' });
  }
};