import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const { input } = req.body;

  if (!input) {
    return res.status(400).json({ error: "Missing input" });
  }

  try {
    // -------------------------
    // INIT CLIENTS
    // -------------------------
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
    });

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    const prompt = `
You are a senior Product Manager.

Write a structured PRD with:
- Problem
- Users
- Goals
- Features
- Success metrics

Idea: ${input}
`;

    // -------------------------
    // RETRY HELPER
    // -------------------------
    async function retry(fn, retries = 2) {
      try {
        return await fn();
      } catch (err) {
        if (retries === 0) throw err;
        console.log("Retrying after error:", err.message);
        await new Promise(r => setTimeout(r, 1000));
        return retry(fn, retries - 1);
      }
    }

    // -------------------------
    // MODEL FALLBACK LOGIC
    // -------------------------
    async function generateWithFallback() {
      try {
        console.log("Trying model: gemini-2.5-flash");

        return await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt
        });

      } catch (err) {
        console.log("Flash failed, switching to pro...");

        return await ai.models.generateContent({
          model: "gemini-2.5-pro",
          contents: prompt
        });
      }
    }

    // -------------------------
    // GENERATE PRD
    // -------------------------
    const response = await retry(generateWithFallback);

    const prd = response.text;

    if (!prd) {
      return res.status(500).json({
        error: "No PRD generated"
      });
    }

    // -------------------------
    // SAVE TO SUPABASE
    // -------------------------
    const { error: dbError } = await supabase
      .from("prds")
      .insert([{ input, prd }]);

    if (dbError) {
      console.error("Supabase error:", dbError);
    }

    // -------------------------
    // RETURN RESPONSE
    // -------------------------
    return res.status(200).json({
      prd,
      saved: !dbError,
      model_used: response?.model || "gemini-2.5-flash/pro"
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
}
