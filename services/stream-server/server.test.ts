import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { TokenVerifier } from "livekit-server-sdk";
import { afterEach, describe, expect, it } from "vitest";
import type { StreamServerConfig } from "./config.js";
import { createStreamServer } from "./server.js";

const servers: ReturnType<typeof createStreamServer>[] = [];

const config: StreamServerConfig = {
  accessKey: "client-access",
  allowedOrigins: new Set(["https://discord.com"]),
  host: "127.0.0.1",
  livekitApiKey: "test-key",
  livekitApiSecret: "test-secret-with-enough-entropy",
  livekitPublicUrl: "ws://127.0.0.1:7880",
  port: 8787,
  rateLimitPerMinute: 20,
  roomSalt: "test-room-salt",
  tokenTtlSeconds: 900,
};

async function startServer() {
  const server = createStreamServer(config);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  servers.push(server);
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

const validBody = {
  context: {
    channelId: "123456789012345678",
    guildId: "223456789012345678",
  },
  participant: {
    displayName: "Viewer",
    sessionId: "session_12345678",
    userId: "323456789012345678",
  },
};

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

describe("stream token server", () => {
  it("reports health", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("rejects missing access credentials", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/v1/token`, {
      body: JSON.stringify(validBody),
      method: "POST",
    });

    expect(response.status).toBe(401);
  });

  it("issues a scoped room token", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/v1/token`, {
      body: JSON.stringify(validBody),
      headers: {
        authorization: "Bearer client-access",
        "content-type": "application/json",
        origin: "https://discord.com",
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://discord.com",
    );

    const body = (await response.json()) as {
      livekitUrl: string;
      token: string;
    };
    const claims = await new TokenVerifier(
      config.livekitApiKey,
      config.livekitApiSecret,
    ).verify(body.token);

    expect(body.livekitUrl).toBe(config.livekitPublicUrl);
    expect(claims.sub).toBe("323456789012345678-session_12345678");
    expect(claims.video?.room).toMatch(/^dorion-/);
    expect(claims.video?.roomJoin).toBe(true);
    expect(claims.video?.canPublish).toBe(true);
    expect(claims.video?.canSubscribe).toBe(true);
  });

  it("maps the same Discord channel to the same private room", async () => {
    const baseUrl = await startServer();
    const verifier = new TokenVerifier(
      config.livekitApiKey,
      config.livekitApiSecret,
    );
    const requestToken = async (channelId: string) => {
      const response = await fetch(`${baseUrl}/v1/token`, {
        body: JSON.stringify({
          ...validBody,
          context: { ...validBody.context, channelId },
        }),
        headers: { authorization: "Bearer client-access" },
        method: "POST",
      });
      const body = (await response.json()) as { token: string };
      return (await verifier.verify(body.token)).video?.room;
    };

    const firstRoom = await requestToken(validBody.context.channelId);
    const secondRoom = await requestToken(validBody.context.channelId);
    const otherRoom = await requestToken("423456789012345678");

    expect(firstRoom).toBe(secondRoom);
    expect(firstRoom).not.toBe(otherRoom);
  });

  it("rejects malformed Discord context", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/v1/token`, {
      body: JSON.stringify({
        ...validBody,
        context: { channelId: "not-a-snowflake" },
      }),
      headers: { authorization: "Bearer client-access" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid channelId",
    });
  });
});
