import Groq from "groq-sdk";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  const startTime = Date.now();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const { input } = req.body;

  if (!input) {
    return res.status(400).json({ error: "Missing input" });
  }

  // -------------------------
  // CLIENTS
  // -------------------------
  const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
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
  // GROQ GENERATION
  // -------------------------
  async function generatePRD() {
    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content: "You are a senior Product Manager who writes clear PRDs."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });

    const text = response?.choices?.[0]?.message?.content;

    if (!text) {
      throw new Error("No response from Groq");
    }

    return {
      text,
      modelUsed: "llama-3.1-8b-instant"
    };
  }

  // -------------------------
  // MAIN LOGIC
  // -------------------------
  try {
    const result = await generatePRD();
    const latency_ms = Date.now() - startTime;

    const { error: dbError } = await supabase
      .from("prd_outputs")
      .insert([
        {
          idea: input,
          prd: result.text,
          model_used: result.modelUsed,
          latency_ms,
          success: true
        }
      ]);

    return res.status(200).json({
      prd: result.text,
      model_used: result.modelUsed,
      latency_ms,
      success: true,
      saved: !dbError
    });

  } catch (err) {
    const latency_ms = Date.now() - startTime;

    await supabase.from("prd_outputs").insert([
      {
        idea: input,
        prd: err.message || "FAILED",
        model_used: "groq-failed",
        latency_ms,
        success: false
      }
    ]);

    return res.status(500).json({
      error: err.message,
      success: false,
      latency_ms
    });
  }
}
