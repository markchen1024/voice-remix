import { createAiTransaction } from "../../ai-planner";
import type { Project } from "../../edit-transactions";

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ code: "ai_unavailable", message: "OPENAI_API_KEY is not configured" }, { status: 503 });
  }

  try {
    const body = await request.json() as { request?: unknown; project?: unknown };
    if (typeof body.request !== "string" || body.request.trim().length < 2 || !body.project || typeof body.project !== "object") {
      return Response.json({ code: "invalid_request" }, { status: 400 });
    }
    const transaction = await createAiTransaction(body.request.trim().slice(0, 500), body.project as Project);
    if (!transaction) return Response.json({ code: "no_supported_edits" }, { status: 422 });
    return Response.json({ transaction });
  } catch (error) {
    console.error("AI edit planning failed", error);
    return Response.json({ code: "planning_failed" }, { status: 502 });
  }
}
