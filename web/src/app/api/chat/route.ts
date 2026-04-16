import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.API_KEY || "");

export async function POST(req: Request) {
  try {
    const { messages, model = "gemma-4-26b-a4b-it" } = await req.json();

    // Map roles: 'user' -> 'user', 'model' -> 'model' (GenAI uses 'model')
    const contents = messages.map((m: any) => ({
      role: m.role === "assistant" ? "model" : m.role,
      parts: [{ text: m.content }],
    }));

    // In Node SDK, thinking is slightly different if it's experimental.
    // However, I'll use the standard generateContentStream.
    const generativeModel = genAI.getGenerativeModel({ 
      model,
    });

    // Note: Streaming needs to be handled on the client side properly.
    // For simplicity, we'll return a streaming response.
    const result = await generativeModel.generateContentStream({
      contents,
    });

    const stream = new ReadableStream({
        async start(controller) {
            for await (const chunk of result.stream) {
                const text = chunk.text();
                controller.enqueue(text);
            }
            controller.close();
        },
    });

    return new Response(stream);
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
