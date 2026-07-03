export interface ToolOutput {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export function textResult(text: string, structuredContent?: Record<string, unknown>): ToolOutput {
  return { content: [{ type: "text", text }], structuredContent };
}

export function errorResult(message: string): ToolOutput {
  return { content: [{ type: "text", text: message }], isError: true };
}
