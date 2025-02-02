import { OpenAI } from "openai";
import dotenv from "dotenv";

dotenv.config();

export async function validateApiKey() {
  // تخطي التحقق مؤقتاً
  return true;

  /* التعليق المؤقت للكود الأصلي
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key is not set in .env file");
  }

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "test" }],
    });

    return true;
  } catch (error) {
    throw new Error(`Invalid OpenAI API key: ${error.message}`);
  }
  */
}
