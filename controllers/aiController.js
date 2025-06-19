// server/controllers/aiController.js

// Load guidelines from file
const fs = require('fs');
const path = require('path');
const guidelinesFilePath = path.join(__dirname, '../data/agent-guidelines.txt');
const { OpenAI } = require('openai');
const dotenv = require('dotenv');
dotenv.config();

// Initialize OpenAI client with API key from environment variables
let openai = null;

if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your-openai-api-key-here') {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  console.log('OpenAI client initialized');
} else {
  console.log('OpenAI API key not configured, will use fallback responses');
}

let agentGuidelines = '';

try {
  // Load guidelines from file
  agentGuidelines = fs.readFileSync(guidelinesFilePath, 'utf8');
  console.log('Agent guidelines loaded successfully, length:', agentGuidelines.length);
} catch (error) {
  console.error('Failed to load agent guidelines:', error);
  agentGuidelines = 'Be professional, clear, and helpful in all communications.';
}

// Fallback function for when OpenAI is not available
const fallbackImprovement = (originalText, improvements) => {
  if (!originalText) return 'Please provide original text to improve.';
  
  let transformedText = originalText;
  
  // Simple transformations based on improvement type
  const lowerImprovements = improvements.toLowerCase();
  
  if (lowerImprovements.includes('formal')) {
    transformedText = transformedText
      .replace(/hi|hey|hello/gi, 'Dear Customer,')
      .replace(/thanks/gi, 'Thank you')
      .replace(/bye/gi, 'Best regards')
      .replace(/guys/gi, 'everyone');
      
    if (!transformedText.toLowerCase().includes('dear')) {
      transformedText = "Dear Valued Customer,\n\n" + transformedText;
    }
    
    if (!transformedText.toLowerCase().includes('regards')) {
      transformedText += "\n\nBest Regards,\nSupport Team";
    }
  }
  
  if (lowerImprovements.includes('friendly')) {
    transformedText = transformedText
      .replace(/dear customer/gi, 'Hey there!')
      .replace(/thank you/gi, 'Thanks so much!')
      .replace(/regards/gi, 'Cheers!');
  }
  
  if (lowerImprovements.includes('concise') || lowerImprovements.includes('short')) {
    const sentences = transformedText.match(/[^.!?]+[.!?]+/g) || [];
    if (sentences.length > 2) {
      transformedText = sentences.slice(0, 2).join(' ') + " Please let us know if you need more information.";
    }
  }
  
  // Ensure proper paragraph formatting
  transformedText = transformedText
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/([^\n])\n([^\n])/g, '$1\n\n$2')
    .trim();
  
  return transformedText + "\n\n[AI service processed this request]";
};

exports.improveResponse = async (req, res) => {
  try {
    const { originalText, improvements, systemPrompt, userPrompt } = req.body;
    const userId = req.user.email;
    
    if (!originalText) {
      return res.status(400).json({ message: 'Original text is required' });
    }
    
    if (!improvements) {
      return res.status(400).json({ message: 'Improvement requirements are required' });
    }
    
    console.log(`Processing AI improvement request for user: ${userId}`);
    
    // If OpenAI is not configured, use fallback
    if (!openai) {
      console.log('Using fallback improvement (OpenAI not configured)');
      const improvedText = fallbackImprovement(originalText, improvements);
      return res.status(200).json({ improvedText });
    }
    
    // Try OpenAI first, fallback if it fails
    try {
      const effectiveSystemPrompt = systemPrompt || 
        `You are improving customer service responses according to these guidelines:
         
         ${agentGuidelines.length > 2000 
           ? agentGuidelines.substring(0, 2000) + "...[guidelines truncated for length]"
           : agentGuidelines}
         
         Ensure paragraphs are properly separated with double line breaks.
         Always respond in English only, regardless of the input language.`;
      
      const effectiveUserPrompt = userPrompt ||
        `Original: ${originalText}\n\nImprovements needed: ${improvements}`;
      
      console.log(`Calling OpenAI for improvement...`);
      
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
      
      // Ensure proper paragraph formatting
      improvedText = improvedText
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/([^\n])\n([^\n])/g, '$1\n\n$2')
        .trim();
      
      res.status(200).json({ improvedText });
    } catch (openaiError) {
      console.error('OpenAI API error, using fallback:', openaiError.message);
      const improvedText = fallbackImprovement(originalText, improvements);
      res.status(200).json({ improvedText });
    }
  } catch (error) {
    console.error('Error in improveResponse:', error);
    res.status(500).json({ message: 'Server error processing AI request' });
  }
};