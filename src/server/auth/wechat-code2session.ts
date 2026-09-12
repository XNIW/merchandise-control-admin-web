import "server-only";

import { createHmac } from "node:crypto";
import { request } from "node:https";
import type { MiniDirectConfig } from "./wechat-mini-direct-config";

// node:https avoids Next's cache/fetch URL instrumentation. Worker traces must
// remain disabled for credential-bearing upstream requests (deployment gate).
// Never log request/error objects or accept an upstream URL from configuration.
export type Code2SessionTransport = (
  query: URLSearchParams,
) => Promise<unknown>;

const transport: Code2SessionTransport = (query) =>
  new Promise((resolve) => {
    let settled = false;
    const finish = (value: unknown) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    try {
      const req = request(
        {
          hostname: "api.weixin.qq.com",
          port: 443,
          path: `/sns/jscode2session?${query.toString()}`,
          method: "GET",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(5_000),
        },
        (res) => {
          if (res.statusCode !== 200) {
            res.destroy();
            finish(null);
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > 4_096) {
              res.destroy();
              finish(null);
            } else chunks.push(chunk);
          });
          res.on("error", () => finish(null));
          res.on("end", () => {
            try {
              finish(
                JSON.parse(
                  new TextDecoder("utf-8", { fatal: true }).decode(
                    Buffer.concat(chunks),
                  ),
                ) as unknown,
              );
            } catch {
              finish(null);
            }
          });
        },
      );
      req.on("error", () => finish(null));
      req.end();
    } catch {
      finish(null);
    }
  });

export async function verifyWeChatMiniCode(
  code: string,
  config: MiniDirectConfig,
  send: Code2SessionTransport = transport,
) {
  if (!config.configured || !/^[A-Za-z0-9_-]{1,512}$/.test(code)) return null;
  try {
    const value = await send(
      new URLSearchParams({
        appid: config.appId,
        secret: config.appSecret,
        js_code: code,
        grant_type: "authorization_code",
      }),
    );
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const body = value as Record<string, unknown>;
    if (
      (body.errcode !== undefined && body.errcode !== 0) ||
      typeof body.openid !== "string" ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(body.openid) ||
      typeof body.session_key !== "string" ||
      !/^[A-Za-z0-9+/]{22}==$/.test(body.session_key)
    )
      return null;
    // Discard session_key and UnionID. Nothing upstream is returned to the Mini.
    return `v1:${createHmac("sha256", config.identityKey)
      .update(
        JSON.stringify([
          "wechat-mini-code2session-v1",
          config.appId,
          body.openid,
        ]),
      )
      .digest("hex")}`;
  } catch {
    return null;
  }
}
