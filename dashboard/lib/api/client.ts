export const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

function messageFromErrorBody(parsedBody: unknown): string | null {
  if (!parsedBody || typeof parsedBody !== "object") {
    return null;
  }
  const record = parsedBody as { error?: unknown; detail?: unknown };
  const main = record.error != null ? String(record.error) : "";
  const detail = record.detail != null ? String(record.detail) : "";
  if (main && detail) {
    return `${main} (${detail})`;
  }
  return main || detail || null;
}

/**
 * Helper central para consumo de la API de ARI.
 * Maneja errores de red y HTTP en un solo lugar.
 */
export async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
      ...options,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error de red desconocido";
    throw new Error(`No se pudo conectar con el servidor: ${message}`);
  }

  const rawText = await response.text();
  let parsedBody: unknown = null;
  try {
    parsedBody = rawText ? (JSON.parse(rawText) as unknown) : null;
  } catch {
    throw new Error(
      response.ok
        ? "Respuesta inválida del servidor."
        : `Error HTTP ${response.status}: respuesta no JSON`
    );
  }

  if (!response.ok) {
    const fromBody = messageFromErrorBody(parsedBody);
    throw new Error(fromBody ?? `Error HTTP ${response.status}`);
  }

  return parsedBody as T;
}
