import OpenAI from "openai";
import { NextResponse } from "next/server";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      temperature: 0,

      input: [
        {
          role: "system",
          content: `
You are an AI email security engine.
You MUST answer ONLY with valid JSON.
No markdown. No explanation. JSON only.
          `,
        },
        {
          role: "user",
          content: `
Analyze this email and return:

{
  "risk_level": "safe | suspicious | dangerous",
  "confidence": number between 0 and 100,
  "summary": "short explanation"
}

EMAIL:
${email}
          `,
        },
      ],
    });

    let text = response.output_text.trim();

    // Nettoyage ultra robuste si le modèle ajoute des ```json
    if (text.startsWith("```")) {
      text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    }

    const result = JSON.parse(text);

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Request failed";
    return NextResponse.json({ error: message });
  }
}