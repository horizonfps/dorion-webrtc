export interface StreamServerConfig {
  host: string;
  port: number;
  livekitPublicUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  roomSalt: string;
  accessKey: string;
  allowedOrigins: Set<string>;
  tokenTtlSeconds: number;
  rateLimitPerMinute: number;
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
) {
  const parsed = Number.parseInt(value ?? String(fallback), 10);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function required(value: string | undefined, name: string) {
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): StreamServerConfig {
  const production = env.NODE_ENV === "production";
  const livekitApiKey = env.LIVEKIT_API_KEY?.trim() || "devkey";
  const livekitApiSecret = env.LIVEKIT_API_SECRET?.trim() || "secret";
  const roomSalt =
    env.STREAM_ROOM_SALT?.trim() || "dorion-webrtc-local-development";

  if (
    production &&
    (livekitApiKey === "devkey" || livekitApiSecret === "secret")
  ) {
    throw new Error("Production requires non-default LiveKit credentials");
  }

  if (production && roomSalt === "dorion-webrtc-local-development") {
    throw new Error("Production requires STREAM_ROOM_SALT");
  }

  return {
    host: env.STREAM_HOST?.trim() || "0.0.0.0",
    port: positiveInteger(env.STREAM_PORT, 8787, "STREAM_PORT"),
    livekitPublicUrl: required(
      env.LIVEKIT_PUBLIC_URL || "ws://127.0.0.1:7880",
      "LIVEKIT_PUBLIC_URL",
    ),
    livekitApiKey,
    livekitApiSecret,
    roomSalt,
    accessKey: env.STREAM_ACCESS_KEY?.trim() || "",
    allowedOrigins: new Set(
      (env.STREAM_ALLOWED_ORIGINS || "https://discord.com")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
    tokenTtlSeconds: positiveInteger(
      env.STREAM_TOKEN_TTL_SECONDS,
      900,
      "STREAM_TOKEN_TTL_SECONDS",
    ),
    rateLimitPerMinute: positiveInteger(
      env.STREAM_RATE_LIMIT_PER_MINUTE,
      60,
      "STREAM_RATE_LIMIT_PER_MINUTE",
    ),
  };
}
