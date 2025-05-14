import { GoogleGenerativeAI } from "@google/generative-ai";
import config from "../config/env.js";

const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);

const geminiService = async (message) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const prompt = `Eres un asistente de atención a clientes. Responde de forma clara y directa como si fuera por WhatsApp. No saludes, responde solo la duda: ${message}`;


    const result = await model.generateContentStream([prompt]);
    let fullResponse = '';
    for await (const chunk of result.stream) {
      const part = await chunk.text();
      fullResponse += part;
    }
    return fullResponse;
  } catch (error) {
    console.error("Error al generar respuesta con Gemini:", error);
    return "Ocurrió un error procesando tu pregunta. Intenta más tarde.";
  }
};

export default geminiService;


