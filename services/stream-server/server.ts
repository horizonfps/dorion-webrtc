import { createHmac, timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { AccessToken } from "livekit-server-sdk";
import type { StreamServerConfig } from "./config.js";
import { parseTokenRequest, type TokenResponse } from "./protocol.js";

const maxRequestBytes = 16 * 1024;

class RateLimiter {
  private readonly clients = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(private readonly limit: number) {}

  allow(key: string, now = Date.now()) {
    const current = this.clients.get(key);

    if (!current || current.resetAt <= now) {
      this.clients.set(key, { count: 1, resetAt: now + 60_000 });
      return true;
    }

    current.count += 1;
    return current.count <= this.limit;
  }
}

function writeJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function applyCors(
  request: IncomingMessage,
  response: ServerResponse,
  config: StreamServerConfig,
) {
  const origin = request.headers.origin;

  if (origin && config.allowedOrigins.has(origin)) {
    response.setHeader("access-control-allow-origin", origin);
    response.setHeader(
      "access-control-allow-headers",
      "authorization, content-type",
    );
    response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    response.setHeader("vary", "origin");
  }
}

function hasAccess(request: IncomingMessage, accessKey: string) {
  if (!accessKey) return true;

  const supplied =
    request.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
  const expectedBuffer = Buffer.from(accessKey);
  const suppliedBuffer = Buffer.from(supplied);

  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;

    if (size > maxRequestBytes) throw new Error("Request body is too large");
    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function roomName(
  config: StreamServerConfig,
  guildId: string | undefined,
  channelId: string,
) {
  const context = `${guildId || "dm"}:${channelId}`;
  const digest = createHmac("sha256", config.roomSalt)
    .update(context)
    .digest("base64url");
  return `dorion-${digest}`;
}

async function issueToken(
  config: StreamServerConfig,
  value: unknown,
): Promise<TokenResponse> {
  const request = parseTokenRequest(value);
  const room = roomName(
    config,
    request.context.guildId,
    request.context.channelId,
  );
  const identity = `${request.participant.userId}-${request.participant.sessionId}`;
  const token = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
    identity,
    metadata: JSON.stringify({ userId: request.participant.userId }),
    name: request.participant.displayName,
    ttl: config.tokenTtlSeconds,
  });

  token.addGrant({
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
    room,
    roomJoin: true,
  });

  return {
    livekitUrl: config.livekitPublicUrl,
    token: await token.toJwt(),
  };
}

export function createStreamServer(config: StreamServerConfig) {
  const limiter = new RateLimiter(config.rateLimitPerMinute);

  return createServer(async (request, response) => {
    applyCors(request, response, config);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method === "GET" && request.url === "/health") {
      writeJson(response, 200, { status: "ok" });
      return;
    }

    if (request.method !== "POST" || request.url !== "/v1/token") {
      writeJson(response, 404, { error: "Not found" });
      return;
    }

    if (!hasAccess(request, config.accessKey)) {
      writeJson(response, 401, { error: "Unauthorized" });
      return;
    }

    const clientAddress = request.socket.remoteAddress || "unknown";

    if (!limiter.allow(clientAddress)) {
      writeJson(response, 429, { error: "Rate limit exceeded" });
      return;
    }

    try {
      const body = await readJson(request);
      writeJson(response, 200, await issueToken(config, body));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid request";
      writeJson(response, 400, { error: message });
    }
  });
}
