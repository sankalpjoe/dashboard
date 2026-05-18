import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { pathToFileURL } from "url";
import { componentTagger } from "lovable-tagger";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Convert a Node IncomingMessage + body string into a Web Standard Request. */
function toWebRequest(req: any, body: string | undefined, port: number): Request {
  const url = new URL(req.url!, `http://localhost:${port}`);
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers as Record<string, unknown>)) {
    if (typeof value === "string") headers[key] = value;
    else if (Array.isArray(value)) headers[key] = (value as string[]).join(", ");
  }
  return new Request(url.toString(), {
    method: req.method,
    headers,
    body: body || undefined,
  });
}

/** Read the full body of a Node IncomingMessage for POST/PUT/PATCH requests. */
async function readBody(req: any): Promise<string | undefined> {
  if (!["POST", "PUT", "PATCH"].includes(req.method ?? "")) return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString();
}

/**
 * Generic factory that creates a Vite dev-server middleware plugin wiring an
 * api/ handler directly into the dev server.
 *
 * @param name        Vite plugin name (used in logs)
 * @param prefix      URL prefix to intercept (e.g. "/api/route/")
 * @param importPath  Absolute path to the handler module
 */
function makeApiPlugin(name: string, prefix: string, importPath: string): Plugin {
  return {
    name,
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith(prefix)) return next();

        try {
          // Dynamic import — Node resolves relative imports inside the handler
          // correctly because they're relative to the handler file's own location.
          // On Windows, ESM dynamic import() requires a file:// URL, not a bare path
          const handlerUrl = pathToFileURL(importPath).href;
          const { default: handler } = await import(/* @vite-ignore */ handlerUrl);
          if (typeof handler !== "function") {
            throw new Error(`Handler in ${importPath} did not export a default function`);
          }

          const port = server.config.server.port ?? 5174;
          const body = await readBody(req);
          const webReq = toWebRequest(req, body, port);

          const response: Response = await handler(webReq);

          res.statusCode = response.status;
          response.headers.forEach((value: string, key: string) =>
            res.setHeader(key, value)
          );
          res.end(await response.text());
        } catch (err) {
          console.error(`[${name}] Error:`, err);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Root api/ directory (one level up from frontend/)
// ---------------------------------------------------------------------------
const API_DIR = path.resolve(__dirname, "../api");

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Inject GROQ key from .env.local into process.env so that api/ handlers
  // (which run as plain Node modules, not Vite modules) can read it.
  const env = loadEnv(mode, __dirname, "VITE_");
  if (env.VITE_GROQ_API_KEY && !process.env.GROQ_API_KEY) {
    process.env.GROQ_API_KEY = env.VITE_GROQ_API_KEY;
  }

  return {
    server: {
      host: "::",
      port: 5174,
      hmr: {
        overlay: false,
      },
      proxy: {
        "/api/pib": {
          target: "https://pib.gov.in",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/pib/, ""),
        },
        "/api/cert": {
          target: "https://www.cert-in.org.in",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/cert/, ""),
        },
        "/api/reliefweb": {
          target: "https://reliefweb.int",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/reliefweb/, ""),
        },
        "/api/reddit": {
          target: "https://www.reddit.com",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/reddit/, ""),
        },
        "/api/telegram": {
          target: "https://t.me",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/telegram/, ""),
        },
      },
    },

    plugins: [
      react(),
      mode === "development" && componentTagger(),

      // ------------------------------------------------------------------
      // API handler plugins — each one intercepts a URL prefix and
      // executes the matching api/ handler in-process.
      //
      // Order matters: more-specific prefixes before less-specific ones.
      // ------------------------------------------------------------------

      // Route planner (OSRM + incident analysis)
      makeApiPlugin(
        "route-api",
        "/api/route/",
        path.join(API_DIR, "route/alternate.js")
      ),

      // OSINT CXO intelligence / Google dorking
      makeApiPlugin(
        "osint-api",
        "/api/osint/",
        path.join(API_DIR, "osint/dork-cxo.js")
      ),

      // Sentiment analysis
      makeApiPlugin(
        "sentiment-api",
        "/api/sentiment/",
        path.join(API_DIR, "sentiment/analyze.js")
      ),

      // Reverse geocoding (more specific prefix first)
      makeApiPlugin(
        "reverse-geocode-api",
        "/api/reverse-geocode",
        path.join(API_DIR, "reverse-geocode.js")
      ),

      // Forward geocoding (Nominatim)
      makeApiPlugin(
        "geocode-api",
        "/api/geocode",
        path.join(API_DIR, "geocode.js")
      ),

      // Polymarket prediction markets proxy
      makeApiPlugin(
        "polymarket-api",
        "/api/polymarket",
        path.join(API_DIR, "polymarket.js")
      ),

      // RSS feed proxy (news feeds, think-tank feeds, etc.)
      makeApiPlugin(
        "rss-proxy",
        "/api/rss-proxy",
        path.join(API_DIR, "rss-proxy.js")
      ),

      // Unified AI Enrichment v2
      makeApiPlugin(
        "news-enrichment",
        "/api/enrichment/news-v2",
        path.join(API_DIR, "enrichment/news-v2.js")
      ),
      makeApiPlugin(
        "intel-enrichment",
        "/api/enrichment/intel-v2",
        path.join(API_DIR, "enrichment/intel-v2.js")
      ),

      // Twitter/X handle intel — Groq Llama 4 Scout powered
      makeApiPlugin(
        "twitter-intel-api",
        "/api/twitter-intel",
        path.join(API_DIR, "twitter-intel.js")
      ),
    ].filter(Boolean),

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});

