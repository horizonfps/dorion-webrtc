export interface TokenRequest {
  context: {
    channelId: string;
    guildId?: string;
  };
  participant: {
    displayName: string;
    sessionId: string;
    userId: string;
  };
}

export interface TokenResponse {
  livekitUrl: string;
  token: string;
}

const snowflakePattern = /^\d{16,22}$/;
const sessionPattern = /^[A-Za-z0-9_-]{8,64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseTokenRequest(value: unknown): TokenRequest {
  if (
    !isRecord(value) ||
    !isRecord(value.context) ||
    !isRecord(value.participant)
  ) {
    throw new Error("Invalid request body");
  }

  const channelId = value.context.channelId;
  const guildId = value.context.guildId;
  const displayName = value.participant.displayName;
  const sessionId = value.participant.sessionId;
  const userId = value.participant.userId;

  if (typeof channelId !== "string" || !snowflakePattern.test(channelId)) {
    throw new Error("Invalid channelId");
  }

  if (
    guildId !== undefined &&
    (typeof guildId !== "string" || !snowflakePattern.test(guildId))
  ) {
    throw new Error("Invalid guildId");
  }

  if (typeof userId !== "string" || !snowflakePattern.test(userId)) {
    throw new Error("Invalid userId");
  }

  if (typeof sessionId !== "string" || !sessionPattern.test(sessionId)) {
    throw new Error("Invalid sessionId");
  }

  if (
    typeof displayName !== "string" ||
    displayName.trim().length < 1 ||
    displayName.trim().length > 80
  ) {
    throw new Error("Invalid displayName");
  }

  return {
    context: {
      channelId,
      ...(guildId ? { guildId } : {}),
    },
    participant: {
      displayName: displayName.trim(),
      sessionId,
      userId,
    },
  };
}
