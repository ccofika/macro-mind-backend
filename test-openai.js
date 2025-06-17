const { OpenAI } = require('openai');
require('dotenv').config();

async function testOpenAI() {
  try {
    console.log("Testing OpenAI API configuration...");
    
    // Provera da li postoji API ključ
    if (!process.env.OPENAI_API_KEY) {
      console.error("ERROR: OPENAI_API_KEY not found in environment variables");
      console.error("Make sure you have created a .env file with your OpenAI API key");
      process.exit(1);
    }
    
    console.log("API Key found:", process.env.OPENAI_API_KEY.substring(0, 5) + "...");
    
    // Inicijalizacija OpenAI klijenta
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    console.log("Sending test request to OpenAI API...");
    
    // Model koji koristimo u aplikaciji
    const modelToTest = "gpt-4.1-nano-2025-04-14";
    console.log(`Using model: ${modelToTest}`);
    
    // Pokušaj poziva API-ja
    const response = await openai.chat.completions.create({
      model: modelToTest,
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Say hello!" }
      ],
      max_tokens: 50
    });
    
    // Provera odgovora
    if (response && response.choices && response.choices[0]) {
      console.log("\n✅ SUCCESS: OpenAI API is working correctly!");
      console.log("Response:", response.choices[0].message.content);
      console.log("\nThis confirms that your OpenAI API key is valid and the specified model is available.");
      process.exit(0);
    } else {
      console.error("\n⚠️ WARNING: Received an empty response from OpenAI");
      console.log("Response object:", JSON.stringify(response, null, 2));
      process.exit(1);
    }
  } catch (error) {
    console.error("\n❌ ERROR: Failed to connect to OpenAI API");
    
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Error message: ${error.response.data.error.message || "Unknown error"}`);
      
      // Dodatne provere za specifične greške
      if (error.response.status === 404) {
        console.error("\nModel not found. Check if you're using a valid model name.");
        console.error("Common models: gpt-3.5-turbo, gpt-4-turbo, gpt-4o");
      } else if (error.response.status === 401) {
        console.error("\nAuthentication error. Your API key is invalid or expired.");
      }
    } else {
      console.error(`Error: ${error.message || "Unknown error"}`);
    }
    
    console.error("\nPlease check your OpenAI API key and model configuration.");
    process.exit(1);
  }
}

testOpenAI();