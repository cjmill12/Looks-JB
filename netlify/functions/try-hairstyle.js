import { GoogleGenAI } from '@google/genai';

// Initialize the GoogleGenAI client.
// The API key is securely retrieved from the Netlify environment variable GEMINI_API_KEY.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Image generation model used for hair try-on
// *** FIX: Changed from 'imagen-4.0-generate-001' to the supported multimodal model 'gemini-2.5-flash' ***
const MODEL_NAME = 'gemini-2.5-flash';

/**
 * Netlify Function handler.
 * @param {object} event - The Netlify event object.
 * @returns {object} - The HTTP response object.
 */
exports.handler = async (event, context) => {
    // Define headers to allow cross-origin requests (CORS) from any domain
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // Allows requests from GoDaddy or your local file
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight request (browser sends OPTIONS before POST)
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ message: 'CORS Preflight successful.' }),
        };
    }

    // 1. Basic checks
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method Not Allowed. Use POST.' }),
            headers,
        };
    }

    if (!process.env.GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY environment variable is not set.");
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Server configuration error: GEMINI_API_KEY not set.' }),
            headers,
        };
    }

    // *** NEW LOG ADDED HERE ***
    console.log("LOG 1: API Key Check Passed. Starting main process.");

    try {
        // Netlify Lambda functions provide the body as a JSON string
        const { image_data: imageData, prompt } = JSON.parse(event.body);
        
        // *** NEW LOG ADDED HERE ***
        console.log(`LOG 2: Received Image Data (Length: ${imageData.length}) and Prompt: ${prompt.substring(0, 50)}...`);


        if (!imageData || !prompt) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing required fields: image_data or prompt.' }),
                headers,
            };
        }

        // 2. Construct the full generation prompt
        const fullPrompt = `Change the hairstyle and color of the person in the input image to: "${prompt}". Preserve the person's face, features, lighting, and clothing exactly as they are. This is a high-quality, realistic photo manipulation.`;
        
        // 3. Define the image data structure for the API call
        const imagePart = {
            inlineData: {
                data: imageData,
                mimeType: 'image/png' // Assuming frontend provides PNG data
            }
        };

        // 4. Call the image generation API
        // *** FIX: Combine text and image into the 'contents' array ***
        const apiResponse = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: [
                {
                    parts: [
                        { text: fullPrompt }, // The text prompt
                        imagePart           // The image data
                    ]
                }
            ],
            // Remove generationConfig.prompt as it's now in contents
            generationConfig: {
                // The structure for gemini-2.5-flash is different; it doesn't take numberOfImages, 
                // outputMimeType, or aspectRatio in generationConfig for content generation.
                // We trust the model to return the manipulated image based on the prompt.
            }
        });
        
        // 5. Extract the base64 image data from the response
        // Note: The response structure for the Gemini model is different from the Imagen structure.
        const candidate = apiResponse.candidates?.[0];
        const generatedPart = candidate?.content?.parts?.find(p => p.inlineData && p.inlineData.mimeType.startsWith('image/'));

        if (!generatedPart || !generatedPart.inlineData || !generatedPart.inlineData.data) {
            console.error("LOG 3: AI failed to return an image or response was malformed.");
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'AI failed to return an image. Try a different prompt, or ensure the image is clear.' }),
                headers,
            };
        }

        const base64Image = generatedPart.inlineData.data;

        // *** NEW LOG ADDED HERE ***
        console.log("LOG 4: Image generated successfully. Returning data.");
        
        // 6. Return the raw base64 data to the frontend
        return {
            statusCode: 200,
            body: JSON.stringify({ image_data: base64Image }),
            headers,
        };

    } catch (error) {
        console.error("LOG 5: Internal Server Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: `Internal Server Error: ${error.message}` }),
            headers,
        };
    }
};
