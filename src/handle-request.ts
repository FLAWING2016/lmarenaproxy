const pickHeaders = (headers: Headers, keys: (string | RegExp)[]): Headers => {
  const picked = new Headers();
  for (const key of headers.keys()) {
    if (keys.some((k) => (typeof k === "string" ? k === key : k.test(key)))) {
      const value = headers.get(key);
      if (typeof value === "string") {
        picked.set(key, value);
      }
    }
  }
  return picked;
};

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
  "access-control-allow-headers": "Content-Type, Authorization, Accept, X-Requested-With, OpenAI-Organization, OpenAI-Project",
  "access-control-expose-headers": "content-type, x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset, openai-model, openai-processing-ms",
  "access-control-max-age": "86400",
};

export default async function handleRequest(req: Request & { nextUrl?: URL }) {
  if (req.method === "OPTIONS") {
    const reqMethod = req.headers.get("access-control-request-method");
    const reqHeaders = req.headers.get("access-control-request-headers");
    const headers = {
      ...CORS_HEADERS,
      ...(reqMethod ? { "access-control-allow-methods": reqMethod } : {}),
      ...(reqHeaders ? { "access-control-allow-headers": reqHeaders } : {}),
    };
    return new Response(null, { headers });
  }

  try {
    const { pathname, search } = req.nextUrl ? req.nextUrl : new URL(req.url);
    const forwardPath = pathname.startsWith("/api/proxy")
      ? pathname.slice("/api/proxy".length) || "/"
      : pathname;
    const targetUrl = new URL(forwardPath + search, "https://lmarena.ai");
    const headers = pickHeaders(req.headers, [
      "content-type",
      "authorization",
      "accept",
      "user-agent",
      "accept-language",
      "referer",
      "cookie",
      "sec-ch-ua",
      "sec-ch-ua-mobile",
      "sec-ch-ua-platform",
      "sec-fetch-site",
      "sec-fetch-mode",
      "sec-fetch-dest",
      "upgrade-insecure-requests",
      /^openai-/,
      /^x-openai-/,
    ]);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("timeout"), 30000);
    const res = await fetch(targetUrl.href, {
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
      method: req.method,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timer);

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("text/html")) {
      const preview = await res.clone().text();
      if (
        preview.includes("无法验证您的浏览器") ||
        preview.includes("Vercel 安全检查点") ||
        preview.toLowerCase().includes("unable to verify your browser")
      ) {
        return new Response(null, {
          status: 307,
          headers: { ...CORS_HEADERS, Location: targetUrl.href },
        });
      }
    }

    const resHeaders = {
      ...CORS_HEADERS,
      ...Object.fromEntries(
        pickHeaders(res.headers, ["content-type", /^x-ratelimit-/, /^openai-/])
      ),
    };

    return new Response(res.body, {
      headers: resHeaders,
      status: res.status,
      statusText: res.statusText,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "upstream_error" }), {
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
      status: 502,
    });
  }
}
