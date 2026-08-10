import { createHash } from "node:crypto";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_LOVABLE_MODEL = "google/gemini-3.6-flash";
const AI_TIMEOUT_MS = 45_000;

type AiErrorType =
  | "INVALID_API_KEY"
  | "QUOTA_EXCEEDED"
  | "RATE_LIMITED"
  | "MODEL_NOT_FOUND"
  | "PERMISSION_DENIED"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "INVALID_RESPONSE"
  | "UNKNOWN_ERROR";

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

class AiProviderRequestError extends Error {
  constructor(
    message: string,
    readonly provider: "openai" | "openrouter" | "gemini" | "lovable",
    readonly status: number | undefined,
    readonly errorType: AiErrorType,
  ) {
    super(message);
    this.name = "AiProviderRequestError";
  }
}

function providerErrorType(error: unknown, status?: number): AiErrorType {
  const detail = (error ?? {}) as ProviderError & { name?: string; message?: string };
  const message = typeof detail.message === "string" ? detail.message.toLowerCase() : "";
  if (detail.name === "AbortError" || message.includes("timeout") || message.includes("timed out")) {
    return "TIMEOUT";
  }
  if (status === 401 || message.includes("invalid api key") || message.includes("incorrect api key")) {
    return "INVALID_API_KEY";
  }
  if (status === 403 || message.includes("permission denied") || message.includes("forbidden")) {
    return "PERMISSION_DENIED";
  }
  if (status === 404 || message.includes("model") && (message.includes("not found") || message.includes("does not exist"))) {
    return "MODEL_NOT_FOUND";
  }
  if (message === "empty_model_response") return "INVALID_RESPONSE";
  if (status === 429 || message.includes("rate limit") || message.includes("resource exhausted")) {
    return message.includes("quota") || message.includes("resource exhausted")
      ? "QUOTA_EXCEEDED"
      : "RATE_LIMITED";
  }
  if (
    detail.name === "TypeError" ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("econnreset")
  ) {
    return "NETWORK_ERROR";
  }
  return "UNKNOWN_ERROR";
}

function requestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(AI_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function fallbackAllowed(errorType: AiErrorType): boolean {
  return [
    "INVALID_API_KEY",
    "QUOTA_EXCEEDED",
    "RATE_LIMITED",
    "PERMISSION_DENIED",
    "TIMEOUT",
    "NETWORK_ERROR",
  ].includes(errorType);
}

function cleanEnv(name: string): string {
  return (process.env[name] ?? "").trim().replace(/^['"]|['"]$/g, "").trim();
}

function safetyIdentifier(userId?: string): string | undefined {
  if (!userId) return undefined;
  return createHash("sha256").update(userId).digest("hex");
}

function throwProviderError(provider: "openai" | "openrouter" | "gemini" | "lovable", error: unknown): never {
  const detail = (error ?? {}) as ProviderError;
  const status = detail.status ?? detail.statusCode;
  const code = typeof detail.code === "string" ? detail.code : undefined;
  const type = typeof detail.type === "string" ? detail.type : undefined;
  const requestId = detail.request_id ?? detail.requestID;

  // Do not log prompts, model output, response bodies, headers, or credentials.
  const errorType = providerErrorType(error, status);
  console.error("[AI_PROVIDER]", {
    AI_PROVIDER: provider,
    AI_RESULT: "failed",
    AI_ERROR_TYPE: errorType,
    status,
    code,
    type,
    requestId,
  });

  if (errorType === "QUOTA_EXCEEDED") {
    throw new AiProviderRequestError(
      "AI is rate limited or has reached its quota. Try again shortly.",
      provider,
      status,
      errorType,
    );
  }
  if (errorType === "RATE_LIMITED") {
    throw new AiProviderRequestError("AI is rate limited. Try again shortly.", provider, status, errorType);
  }
  if (errorType === "INVALID_API_KEY") {
    throw new AiProviderRequestError(
      "AI credentials or model access are not valid. Update the server secret.",
      provider,
      status,
      errorType,
    );
  }
  if (errorType === "PERMISSION_DENIED") {
    throw new AiProviderRequestError("AI provider access is not permitted for this key.", provider, status, errorType);
  }
  if (errorType === "MODEL_NOT_FOUND") {
    throw new AiProviderRequestError("The configured AI model is not available to this provider.", provider, status, errorType);
  }
  if (errorType === "TIMEOUT") {
    throw new AiProviderRequestError("The AI provider timed out. Try again.", provider, status, errorType);
  }
  if (errorType === "INVALID_RESPONSE") {
    throw new AiProviderRequestError("The AI provider returned an invalid response.", provider, status, errorType);
  }
  throw new AiProviderRequestError("The AI writer could not be reached. Try again.", provider, status, errorType);
}

async function generateWithOpenAI(
  apiKey: string,
  options: GenerateAiTextOptions,
): Promise<string> {
  try {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey });
    const signal = requestSignal(options.signal);
    const response = await client.responses.create(
      {
        model: cleanEnv("OPENAI_MODEL") || DEFAULT_OPENAI_MODEL,
        instructions: options.system,
        input: options.prompt,
        max_output_tokens: options.maxOutputTokens ?? 8_000,
        safety_identifier: safetyIdentifier(options.userId),
        store: false,
      },
      { signal },
    );
    const text = response.output_text?.trim();
    if (!text) throw new Error("empty_model_response");
    console.info("[AI_PROVIDER]", { AI_PROVIDER: "openai", AI_RESULT: "success" });
    return text;
  } catch (error) {
    throwProviderError("openai", error);
  }
}

async function generateWithOpenRouter(
  apiKey: string,
  options: GenerateAiTextOptions,
): Promise<string> {
  try {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": cleanEnv("POSTFLOW_APP_URL") || "https://postflow.app",
        "X-Title": "PostFlow AI Writer",
      },
    });
    const response = await client.chat.completions.create({
      model: cleanEnv("OPENROUTER_MODEL") || DEFAULT_OPENROUTER_MODEL,
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: options.prompt },
      ],
      max_tokens: options.maxOutputTokens ?? 8_000,
    }, { signal: requestSignal(options.signal) });
    const text = response.choices[0]?.message?.content?.trim();
    if (!text) throw new Error("empty_model_response");
    console.info("[AI_PROVIDER]", { AI_PROVIDER: "openrouter", AI_RESULT: "success" });
    return text;
  } catch (error) {
    throwProviderError("openrouter", error);
  }
}

async function generateWithGemini(
  apiKey: string,
  options: GenerateAiTextOptions,
): Promise<string> {
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const client = new GoogleGenAI({ vertexai: true, apiKey });
    const response = await client.models.generateContent({
      model: cleanEnv("GEMINI_MODEL") || DEFAULT_GEMINI_MODEL,
      contents: options.prompt,
      config: {
        systemInstruction: options.system,
        maxOutputTokens: options.maxOutputTokens ?? 8_000,
        abortSignal: requestSignal(options.signal),
      },
    });
    const text = response.text?.trim();
    if (!text) throw new Error("empty_model_response");
    console.info("[AI_PROVIDER]", { AI_PROVIDER: "gemini", AI_RESULT: "success" });
    return text;
  } catch (error) {
    throwProviderError("gemini", error);
  }
}

async function generateWithLovable(
  apiKey: string,
  options: GenerateAiTextOptions,
): Promise<string> {
  try {
    const { streamText } = await import("ai");
    const gateway = createLovableAiGatewayProvider(apiKey);
    const result = streamText({
      model: gateway(DEFAULT_LOVABLE_MODEL),
      system: options.system,
      prompt: options.prompt,
      abortSignal: requestSignal(options.signal),
    });
    const text = (await result.text).trim();
    if (!text) throw new Error("empty_model_response");
    console.info("[AI_PROVIDER]", { AI_PROVIDER: "lovable", AI_RESULT: "success" });
    return text;
  } catch (error) {
    throwProviderError("lovable", error);
  }
}

/**
 * Server-only text generation. Gemini is primary when configured, with OpenAI
 * and the existing Lovable AI gateway retained as deployment-compatible fallbacks.
 */
export async function generateAiText(options: GenerateAiTextOptions): Promise<string> {
  const geminiKey = cleanEnv("GEMINI_API_KEY");
  const openAiKey = cleanEnv("OPENAI_API_KEY");
  const lovableKey = cleanEnv("LOVABLE_API_KEY");
  const openRouterKey = cleanEnv("OPENROUTER_API_KEY");
  console.info("[AI_CONFIG]", {
    GEMINI_API_KEY: geminiKey ? "PRESENT" : "MISSING",
    OPENAI_API_KEY: openAiKey ? "PRESENT" : "MISSING",
    OPENROUTER_API_KEY: openRouterKey ? "PRESENT" : "MISSING",
    LOVABLE_API_KEY: lovableKey ? "PRESENT" : "MISSING",
    GEMINI_MODEL: cleanEnv("GEMINI_MODEL") || DEFAULT_GEMINI_MODEL,
    OPENAI_MODEL: cleanEnv("OPENAI_MODEL") || DEFAULT_OPENAI_MODEL,
    OPENROUTER_MODEL: cleanEnv("OPENROUTER_MODEL") || DEFAULT_OPENROUTER_MODEL,
  });

  const providers: Array<{ name: "gemini" | "openai" | "openrouter" | "lovable"; run: () => Promise<string> }> = [];
  if (geminiKey) providers.push({ name: "gemini", run: () => generateWithGemini(geminiKey, options) });
  if (openAiKey) providers.push({ name: "openai", run: () => generateWithOpenAI(openAiKey, options) });
  if (openRouterKey) providers.push({ name: "openrouter", run: () => generateWithOpenRouter(openRouterKey, options) });
  if (lovableKey) providers.push({ name: "lovable", run: () => generateWithLovable(lovableKey, options) });

  if (providers.length === 0) {
    throw new Error(
      "AI is not configured. Add GEMINI_API_KEY or OPENAI_API_KEY to the server environment, then restart the app.",
    );
  }

  const failures: Array<{ provider: string; errorType: AiErrorType }> = [];
  for (const candidate of providers) {
    try {
      return await candidate.run();
    } catch (error) {
      if (!(error instanceof AiProviderRequestError)) throw error;
      failures.push({ provider: candidate.name, errorType: error.errorType });
      if (!fallbackAllowed(error.errorType)) throw error;
    }
  }

  console.error("[AI_PROVIDER]", { AI_RESULT: "all_failed", failures });
  throw new Error("All configured AI providers failed. Check the server AI provider logs and try again.");
}
