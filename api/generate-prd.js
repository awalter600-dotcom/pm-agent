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
    // 1. GEMINI GENERATION
    // -------------------------
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
    });
    console.log("MODEL USED: gemini-2.5-flash");
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Write a structured PRD for: ${input}`
    });

    const prd = response.text;

    // -------------------------
    // 2. SUPABASE SAVE
    // -------------------------
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    const { error } = await supabase.from("prds").insert([
      {
        input,
        prd
      }
    ]);

    if (error) {
      console.error("Supabase error:", error);
    }

    // -------------------------
    // 3. RETURN RESPONSE
    // -------------------------
    return res.status(200).json({
      prd,
      saved: !error,
      model: "gemini-2.5-flash"
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
}
