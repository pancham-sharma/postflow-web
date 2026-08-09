import { createHash } from "node:crypto";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const DEFAULT_OPENAI_MODEL = "gpt-5.6-terra";
const DEFAULT_LOVABLE_MODEL = "google/gemini-3.6-flash";

type GenerateAiTextOptions = {
  system: string;
  prompt: string;
  userId?: string;
  signal?: AbortSignal;
  maxOutputTokens?: number;
};

type ProviderError = {
  status?: number;
  statusCode?: number;
  code?: string;
  type?: string;
  request_id?: string;
  requestID?: string;
};

function cleanEnv(name: string): string {
  return (process.env[name] ?? "").trim().replace(/^['"]|['"]$/g, "").trim();
}

function safetyIdentifier(userId?: string): string | undefined {
  if (!userId) return undefined;
  return createHash("sha256").update(userId).digest("hex");
}

function throwProviderError(provider: "openai" | "lovable", error: unknown): never {
  const detail = (error ?? {}) as ProviderError;
  const status = detail.status ?? detail.statusCode;
  const code = typeof detail.code === "string" ? detail.code : undefined;
  const type = typeof detail.type === "string" ? detail.type : undefined;
  const requestId = detail.request_id ?? detail.requestID;

  // Do not log prompts, model output, response bodies, headers, or credentials.
  console.error("[AI_PROVIDER_ERROR]", { provider, status, code, type, requestId });

  if (status === 429) {
    throw new Error("AI is rate limited or has reached its quota. Try again shortly.");
  }
  if (status === 401 || status === 403) {
    throw new Error("AI credentials or model access are not valid. Update the server secret.");
  }
  if (status === 402) {
    throw new Error("AI credits are exhausted for this workspace.");
  }
  throw new Error("The AI writer could not be reached. Try again.");
}

async function generateWithOpenAI(
  apiKey: string,
  options: GenerateAiTextOptions,
): Promise<string> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });

  try {
    const response = await client.responses.create(
      {
        model: cleanEnv("OPENAI_MODEL") || DEFAULT_OPENAI_MODEL,
        instructions: options.system,
        input: options.prompt,
        max_output_tokens: options.maxOutputTokens ?? 8_000,
        safety_identifier: safetyIdentifier(options.userId),
        store: false,
      },
      options.signal ? { signal: options.signal } : undefined,
    );
    const text = response.output_text?.trim();
    if (!text) throw new Error("empty_model_response");
    return text;
  } catch (error) {
    throwProviderError("openai", error);
  }
}

async function generateWithLovable(
  apiKey: string,
  options: GenerateAiTextOptions,
): Promise<string> {
  const { streamText } = await import("ai");
  const gateway = createLovableAiGatewayProvider(apiKey);
  try {
    const result = streamText({
      model: gateway(DEFAULT_LOVABLE_MODEL),
      system: options.system,
      prompt: options.prompt,
      ...(options.signal ? { abortSignal: options.signal } : {}),
    });
    const text = (await result.text).trim();
    if (!text) throw new Error("empty_model_response");
    return text;
  } catch (error) {
    throwProviderError("lovable", error);
  }
}

/**
 * Server-only text generation. OpenAI is primary; the existing Lovable AI
 * gateway remains a deployment-compatible fallback when no OpenAI key exists.
 */
export async function generateAiText(options: GenerateAiTextOptions): Promise<string> {
  const openAiKey = cleanEnv("OPENAI_API_KEY");
  if (openAiKey) return generateWithOpenAI(openAiKey, options);

  const lovableKey = cleanEnv("LOVABLE_API_KEY");
  if (lovableKey) return generateWithLovable(lovableKey, options);

  throw new Error(
    "AI is not configured. Add OPENAI_API_KEY to the server environment, then restart the app.",
  );
}
