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
};

export default async function handleRequest(req: Request & { nextUrl?: URL }) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: CORS_HEADERS,
    });
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
      /^openai-/,
      /^x-openai-/,
    ]);

    const res = await fetch(targetUrl.href, {
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
      method: req.method,
      headers,
    });

    const resHeaders = {
      ...CORS_HEADERS,
      ...Object.fromEntries(
        pickHeaders(res.headers, [
          "content-type",
          /^x-ratelimit-/,
          /^openai-/,
        ])
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
