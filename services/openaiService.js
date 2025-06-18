const { OpenAI } = require('openai');
const dotenv = require('dotenv');

dotenv.config();

// Initialize OpenAI client with API key from environment variables
let openai = null;

if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your-openai-api-key-here') {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  console.log('OpenAI service initialized');
} else {
  console.log('OpenAI API key not configured in service, will use fallback');
}

// Fallback function for local text improvement
const fallbackImprovement = (originalText, improvements) => {
  if (!originalText) return 'Please provide original text to improve.';
  
  let transformedText = originalText;
  const lowerImprovements = improvements.toLowerCase();
  
  if (lowerImprovements.includes('formal')) {
    transformedText = transformedText
      .replace(/hi|hey|hello/gi, 'Dear Customer,')
      .replace(/thanks/gi, 'Thank you')
      .replace(/bye/gi, 'Best regards');
    
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
      .replace(/thank you/gi, 'Thanks so much!');
  }
  
  // Ensure proper formatting
  transformedText = transformedText
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/([^\n])\n([^\n])/g, '$1\n\n$2')
    .trim();
  
  return transformedText + "\n\n[Processed by fallback service]";
};

/**
 * Improves text using OpenAI
 * @param {string} originalText - The original text to improve
 * @param {string} improvements - Description of improvements needed
 * @returns {Promise<string>} - The improved text
 */
exports.improveText = async (originalText, improvements) => {
  // If OpenAI is not configured, use fallback
  if (!openai) {
    console.log('Using fallback improvement (OpenAI not configured)');
    return fallbackImprovement(originalText, improvements);
  }
  
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are improving customer service macro responses. You always write your responses in English only, regardless of the input language. Keep the same structure and tone. Distinct any part in the final answer which should be logically distincted using (\\n\\n)"
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
    console.error('OpenAI API error, using fallback:', error.message);
    return fallbackImprovement(originalText, improvements);
  }
};