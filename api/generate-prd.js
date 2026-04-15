import Groq from "groq-sdk";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  const startTime = Date.now();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  try {
    const {
      input,
      level = "standard",
      stage = "idea",
      answers = []
    } = req.body || {};

    if (!input || typeof input !== "string") {
      return res.status(400).json({
        error: "Missing or invalid input",
        success: false
      });
    }

    // -------------------------
    // INIT CLIENTS
    // -------------------------
    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY
    });

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    // -------------------------
    // REFINEMENT CONTEXT
    // -------------------------
    const refinementContext =
      answers?.length > 0
        ? `\n\nUSER REFINEMENTS:\n${answers
            .map((a, i) => `${i + 1}. ${a}`)
            .join("\n")}`
        : "";

    // -------------------------
    // PROMPT
    // -------------------------
    const prompt = `
You are a Principal Product Manager AND Product Coach.

Your job:
1) Generate a high-quality PRD
2) Educate the user as you go (light coaching)
3) Push toward outcome-driven thinking (not feature-driven)
4) Help refine the product through questions

----------------------------------

PRD LEVEL: ${level.toUpperCase()}
PRODUCT STAGE: ${stage.toUpperCase()}

----------------------------------

LEVEL GUIDELINES:

SIMPLE:
- Very concise
- High-level only
- Minimal detail

STANDARD:
- Balanced detail and structure

DETAILED:
- Deep, execution-ready PRD

----------------------------------

STAGE GUIDELINES:

IDEA:
- Focus on problem clarity and validation
- MVP mindset only

MVP:
- Focus on core functionality and usability

GROWTH:
- Focus on scaling, retention, optimization

----------------------------------

OUTPUT STRUCTURE (STRICT):

Return clean markdown with these sections:

**Product Definition**

- What the product is
- Who it is for
- What problem it solves
- Keep it simple and clear

**Problem**

- Clearly define the user problem
- Explain why it matters

**Users**

- Primary users
- Secondary users
- Be specific (avoid vague personas)

**Goals (Outcomes)**

- MUST be outcome-driven (not features)
- Focus on measurable impact
- Example: “Increase retention by 15%”
- NOT: “Build a dashboard”

**Features**

- Only include features that support goals
- Align with stage (Idea/MVP/Growth)

**Success Metrics**

- Define measurable success criteria
- Tie directly to outcomes

**Next Steps**

- Ask EXACTLY 3 questions
- Must improve clarity, scope, or outcomes
- Be specific and actionable

----------------------------------

EDUCATION / COACHING RULES:

- Subtly guide the user toward better product thinking
- If goals are feature-based → convert to outcomes
- If users are vague → clarify them
- If scope is too broad → narrow it
- Do NOT be overly verbose or preachy

----------------------------------

FORMATTING RULES:

- Add TWO line breaks after section headers
- Add ONE line break between bullets
- Keep spacing clean and readable

----------------------------------

PRODUCT IDEA:
${input}

${refinementContext}
`;

    // -------------------------
    // GENERATE PRD
    // -------------------------
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7
    });

    const text = completion?.choices?.[0]?.message?.content;

    if (!text) {
      throw new Error("Empty response from Groq");
    }

    const latency_ms = Date.now() - startTime;

    // -------------------------
    // CLEAN FORMATTING
    // -------------------------
    const formattedText = text
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // -------------------------
    // SUPABASE INSERT (SUCCESS)
    // -------------------------
    const { error: dbError } = await supabase
      .from("prd_outputs")
      .insert([
        {
          idea: input,
          prd: formattedText,
          model_used: "llama-3.1-8b-instant",
          latency_ms,
          success: true,
          product_stage: stage,
          product_level: level
        }
      ]);

    if (dbError) {
      console.error("Supabase insert error:", dbError);
    }

    // -------------------------
    // RESPONSE
    // -------------------------
    return res.status(200).json({
      prd: formattedText,
      model_used: "llama-3.1-8b-instant",
      latency_ms,
      success: true,
      saved: !dbError,
      product_stage: stage,
      product_level: level
    });

  } catch (err) {
    const latency_ms = Date.now() - startTime;

    console.error("FINAL ERROR:", err);

    // -------------------------
    // FAIL LOGGING
    // -------------------------
    try {
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
      );

      await supabase.from("prd_outputs").insert([
        {
          idea: "FAILED",
          prd: err.message || "error",
          model_used: "none",
          latency_ms,
          success: false,
          product_stage: null,
          product_level: null
        }
      ]);
    } catch (e) {
      console.error("Supabase logging failed:", e);
    }

    return res.status(500).json({
      error: err.message,
      latency_ms,
      success: false,
      saved: false
    });
  }
}
