// vite.config.ts
import { defineConfig } from "file:///C:/Users/sanka/OneDrive/Desktop/dashboard_int/frontend/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/sanka/OneDrive/Desktop/dashboard_int/frontend/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";
import { pathToFileURL } from "url";
import { componentTagger } from "file:///C:/Users/sanka/OneDrive/Desktop/dashboard_int/frontend/node_modules/lovable-tagger/dist/index.js";
var __vite_injected_original_dirname = "C:\\Users\\sanka\\OneDrive\\Desktop\\dashboard_int\\frontend";
function toWebRequest(req, body, port) {
  const url = new URL(req.url, `http://localhost:${port}`);
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers[key] = value;
    else if (Array.isArray(value)) headers[key] = value.join(", ");
  }
  return new Request(url.toString(), {
    method: req.method,
    headers,
    body: body || void 0
  });
}
async function readBody(req) {
  if (!["POST", "PUT", "PATCH"].includes(req.method ?? "")) return void 0;
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString();
}
function makeApiPlugin(name, prefix, importPath) {
  return {
    name,
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith(prefix)) return next();
        try {
          const handlerUrl = pathToFileURL(importPath).href;
          const { default: handler } = await import(
            /* @vite-ignore */
            handlerUrl
          );
          if (typeof handler !== "function") {
            throw new Error(`Handler in ${importPath} did not export a default function`);
          }
          const port = server.config.server.port ?? 5174;
          const body = await readBody(req);
          const webReq = toWebRequest(req, body, port);
          const response = await handler(webReq);
          res.statusCode = response.status;
          response.headers.forEach(
            (value, key) => res.setHeader(key, value)
          );
          res.end(await response.text());
        } catch (err) {
          console.error(`[${name}] Error:`, err);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
      });
    }
  };
}
var API_DIR = path.resolve(__vite_injected_original_dirname, "../api");
var vite_config_default = defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 5174,
    hmr: {
      overlay: false
    },
    proxy: {
      "/api/pib": {
        target: "https://pib.gov.in",
        changeOrigin: true,
        rewrite: (path2) => path2.replace(/^\/api\/pib/, "")
      },
      "/api/cert": {
        target: "https://www.cert-in.org.in",
        changeOrigin: true,
        rewrite: (path2) => path2.replace(/^\/api\/cert/, "")
      },
      "/api/reliefweb": {
        target: "https://reliefweb.int",
        changeOrigin: true,
        rewrite: (path2) => path2.replace(/^\/api\/reliefweb/, "")
      },
      "/api/reddit": {
        target: "https://www.reddit.com",
        changeOrigin: true,
        rewrite: (path2) => path2.replace(/^\/api\/reddit/, "")
      },
      "/api/telegram": {
        target: "https://t.me",
        changeOrigin: true,
        rewrite: (path2) => path2.replace(/^\/api\/telegram/, "")
      }
    }
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
    )
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    }
  }
}));
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxzYW5rYVxcXFxPbmVEcml2ZVxcXFxEZXNrdG9wXFxcXGRhc2hib2FyZF9pbnRcXFxcZnJvbnRlbmRcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXHNhbmthXFxcXE9uZURyaXZlXFxcXERlc2t0b3BcXFxcZGFzaGJvYXJkX2ludFxcXFxmcm9udGVuZFxcXFx2aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvc2Fua2EvT25lRHJpdmUvRGVza3RvcC9kYXNoYm9hcmRfaW50L2Zyb250ZW5kL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnLCB0eXBlIFBsdWdpbiB9IGZyb20gXCJ2aXRlXCI7XG5pbXBvcnQgcmVhY3QgZnJvbSBcIkB2aXRlanMvcGx1Z2luLXJlYWN0LXN3Y1wiO1xuaW1wb3J0IHBhdGggZnJvbSBcInBhdGhcIjtcbmltcG9ydCB7IHBhdGhUb0ZpbGVVUkwgfSBmcm9tIFwidXJsXCI7XG5pbXBvcnQgeyBjb21wb25lbnRUYWdnZXIgfSBmcm9tIFwibG92YWJsZS10YWdnZXJcIjtcblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBTaGFyZWQgaGVscGVyc1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKiBDb252ZXJ0IGEgTm9kZSBJbmNvbWluZ01lc3NhZ2UgKyBib2R5IHN0cmluZyBpbnRvIGEgV2ViIFN0YW5kYXJkIFJlcXVlc3QuICovXG5mdW5jdGlvbiB0b1dlYlJlcXVlc3QocmVxOiBhbnksIGJvZHk6IHN0cmluZyB8IHVuZGVmaW5lZCwgcG9ydDogbnVtYmVyKTogUmVxdWVzdCB7XG4gIGNvbnN0IHVybCA9IG5ldyBVUkwocmVxLnVybCEsIGBodHRwOi8vbG9jYWxob3N0OiR7cG9ydH1gKTtcbiAgY29uc3QgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhyZXEuaGVhZGVycyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSBcInN0cmluZ1wiKSBoZWFkZXJzW2tleV0gPSB2YWx1ZTtcbiAgICBlbHNlIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkgaGVhZGVyc1trZXldID0gKHZhbHVlIGFzIHN0cmluZ1tdKS5qb2luKFwiLCBcIik7XG4gIH1cbiAgcmV0dXJuIG5ldyBSZXF1ZXN0KHVybC50b1N0cmluZygpLCB7XG4gICAgbWV0aG9kOiByZXEubWV0aG9kLFxuICAgIGhlYWRlcnMsXG4gICAgYm9keTogYm9keSB8fCB1bmRlZmluZWQsXG4gIH0pO1xufVxuXG4vKiogUmVhZCB0aGUgZnVsbCBib2R5IG9mIGEgTm9kZSBJbmNvbWluZ01lc3NhZ2UgZm9yIFBPU1QvUFVUL1BBVENIIHJlcXVlc3RzLiAqL1xuYXN5bmMgZnVuY3Rpb24gcmVhZEJvZHkocmVxOiBhbnkpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuICBpZiAoIVtcIlBPU1RcIiwgXCJQVVRcIiwgXCJQQVRDSFwiXS5pbmNsdWRlcyhyZXEubWV0aG9kID8/IFwiXCIpKSByZXR1cm4gdW5kZWZpbmVkO1xuICBjb25zdCBjaHVua3M6IEJ1ZmZlcltdID0gW107XG4gIGZvciBhd2FpdCAoY29uc3QgY2h1bmsgb2YgcmVxKSB7XG4gICAgY2h1bmtzLnB1c2godHlwZW9mIGNodW5rID09PSBcInN0cmluZ1wiID8gQnVmZmVyLmZyb20oY2h1bmspIDogY2h1bmspO1xuICB9XG4gIHJldHVybiBCdWZmZXIuY29uY2F0KGNodW5rcykudG9TdHJpbmcoKTtcbn1cblxuLyoqXG4gKiBHZW5lcmljIGZhY3RvcnkgdGhhdCBjcmVhdGVzIGEgVml0ZSBkZXYtc2VydmVyIG1pZGRsZXdhcmUgcGx1Z2luIHdpcmluZyBhblxuICogYXBpLyBoYW5kbGVyIGRpcmVjdGx5IGludG8gdGhlIGRldiBzZXJ2ZXIuXG4gKlxuICogQHBhcmFtIG5hbWUgICAgICAgIFZpdGUgcGx1Z2luIG5hbWUgKHVzZWQgaW4gbG9ncylcbiAqIEBwYXJhbSBwcmVmaXggICAgICBVUkwgcHJlZml4IHRvIGludGVyY2VwdCAoZS5nLiBcIi9hcGkvcm91dGUvXCIpXG4gKiBAcGFyYW0gaW1wb3J0UGF0aCAgQWJzb2x1dGUgcGF0aCB0byB0aGUgaGFuZGxlciBtb2R1bGVcbiAqL1xuZnVuY3Rpb24gbWFrZUFwaVBsdWdpbihuYW1lOiBzdHJpbmcsIHByZWZpeDogc3RyaW5nLCBpbXBvcnRQYXRoOiBzdHJpbmcpOiBQbHVnaW4ge1xuICByZXR1cm4ge1xuICAgIG5hbWUsXG4gICAgY29uZmlndXJlU2VydmVyKHNlcnZlcikge1xuICAgICAgc2VydmVyLm1pZGRsZXdhcmVzLnVzZShhc3luYyAocmVxLCByZXMsIG5leHQpID0+IHtcbiAgICAgICAgaWYgKCFyZXEudXJsPy5zdGFydHNXaXRoKHByZWZpeCkpIHJldHVybiBuZXh0KCk7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAvLyBEeW5hbWljIGltcG9ydCBcdTIwMTQgTm9kZSByZXNvbHZlcyByZWxhdGl2ZSBpbXBvcnRzIGluc2lkZSB0aGUgaGFuZGxlclxuICAgICAgICAgIC8vIGNvcnJlY3RseSBiZWNhdXNlIHRoZXkncmUgcmVsYXRpdmUgdG8gdGhlIGhhbmRsZXIgZmlsZSdzIG93biBsb2NhdGlvbi5cbiAgICAgICAgICAvLyBPbiBXaW5kb3dzLCBFU00gZHluYW1pYyBpbXBvcnQoKSByZXF1aXJlcyBhIGZpbGU6Ly8gVVJMLCBub3QgYSBiYXJlIHBhdGhcbiAgICAgICAgICBjb25zdCBoYW5kbGVyVXJsID0gcGF0aFRvRmlsZVVSTChpbXBvcnRQYXRoKS5ocmVmO1xuICAgICAgICAgIGNvbnN0IHsgZGVmYXVsdDogaGFuZGxlciB9ID0gYXdhaXQgaW1wb3J0KC8qIEB2aXRlLWlnbm9yZSAqLyBoYW5kbGVyVXJsKTtcbiAgICAgICAgICBpZiAodHlwZW9mIGhhbmRsZXIgIT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBIYW5kbGVyIGluICR7aW1wb3J0UGF0aH0gZGlkIG5vdCBleHBvcnQgYSBkZWZhdWx0IGZ1bmN0aW9uYCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgcG9ydCA9IHNlcnZlci5jb25maWcuc2VydmVyLnBvcnQgPz8gNTE3NDtcbiAgICAgICAgICBjb25zdCBib2R5ID0gYXdhaXQgcmVhZEJvZHkocmVxKTtcbiAgICAgICAgICBjb25zdCB3ZWJSZXEgPSB0b1dlYlJlcXVlc3QocmVxLCBib2R5LCBwb3J0KTtcblxuICAgICAgICAgIGNvbnN0IHJlc3BvbnNlOiBSZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIod2ViUmVxKTtcblxuICAgICAgICAgIHJlcy5zdGF0dXNDb2RlID0gcmVzcG9uc2Uuc3RhdHVzO1xuICAgICAgICAgIHJlc3BvbnNlLmhlYWRlcnMuZm9yRWFjaCgodmFsdWU6IHN0cmluZywga2V5OiBzdHJpbmcpID0+XG4gICAgICAgICAgICByZXMuc2V0SGVhZGVyKGtleSwgdmFsdWUpXG4gICAgICAgICAgKTtcbiAgICAgICAgICByZXMuZW5kKGF3YWl0IHJlc3BvbnNlLnRleHQoKSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYFske25hbWV9XSBFcnJvcjpgLCBlcnIpO1xuICAgICAgICAgIHJlcy5zdGF0dXNDb2RlID0gNTAwO1xuICAgICAgICAgIHJlcy5zZXRIZWFkZXIoXCJDb250ZW50LVR5cGVcIiwgXCJhcHBsaWNhdGlvbi9qc29uXCIpO1xuICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogXCJJbnRlcm5hbCBzZXJ2ZXIgZXJyb3JcIiB9KSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0sXG4gIH07XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gUm9vdCBhcGkvIGRpcmVjdG9yeSAob25lIGxldmVsIHVwIGZyb20gZnJvbnRlbmQvKVxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5jb25zdCBBUElfRElSID0gcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCIuLi9hcGlcIik7XG5cbi8vIGh0dHBzOi8vdml0ZWpzLmRldi9jb25maWcvXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoKHsgbW9kZSB9KSA9PiAoe1xuICBzZXJ2ZXI6IHtcbiAgICBob3N0OiBcIjo6XCIsXG4gICAgcG9ydDogNTE3NCxcbiAgICBobXI6IHtcbiAgICAgIG92ZXJsYXk6IGZhbHNlLFxuICAgIH0sXG4gICAgcHJveHk6IHtcbiAgICAgIFwiL2FwaS9waWJcIjoge1xuICAgICAgICB0YXJnZXQ6IFwiaHR0cHM6Ly9waWIuZ292LmluXCIsXG4gICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcbiAgICAgICAgcmV3cml0ZTogKHBhdGgpID0+IHBhdGgucmVwbGFjZSgvXlxcL2FwaVxcL3BpYi8sIFwiXCIpLFxuICAgICAgfSxcbiAgICAgIFwiL2FwaS9jZXJ0XCI6IHtcbiAgICAgICAgdGFyZ2V0OiBcImh0dHBzOi8vd3d3LmNlcnQtaW4ub3JnLmluXCIsXG4gICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcbiAgICAgICAgcmV3cml0ZTogKHBhdGgpID0+IHBhdGgucmVwbGFjZSgvXlxcL2FwaVxcL2NlcnQvLCBcIlwiKSxcbiAgICAgIH0sXG4gICAgICBcIi9hcGkvcmVsaWVmd2ViXCI6IHtcbiAgICAgICAgdGFyZ2V0OiBcImh0dHBzOi8vcmVsaWVmd2ViLmludFwiLFxuICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXG4gICAgICAgIHJld3JpdGU6IChwYXRoKSA9PiBwYXRoLnJlcGxhY2UoL15cXC9hcGlcXC9yZWxpZWZ3ZWIvLCBcIlwiKSxcbiAgICAgIH0sXG4gICAgICBcIi9hcGkvcmVkZGl0XCI6IHtcbiAgICAgICAgdGFyZ2V0OiBcImh0dHBzOi8vd3d3LnJlZGRpdC5jb21cIixcbiAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxuICAgICAgICByZXdyaXRlOiAocGF0aCkgPT4gcGF0aC5yZXBsYWNlKC9eXFwvYXBpXFwvcmVkZGl0LywgXCJcIiksXG4gICAgICB9LFxuICAgICAgXCIvYXBpL3RlbGVncmFtXCI6IHtcbiAgICAgICAgdGFyZ2V0OiBcImh0dHBzOi8vdC5tZVwiLFxuICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXG4gICAgICAgIHJld3JpdGU6IChwYXRoKSA9PiBwYXRoLnJlcGxhY2UoL15cXC9hcGlcXC90ZWxlZ3JhbS8sIFwiXCIpLFxuICAgICAgfSxcbiAgICB9LFxuICB9LFxuXG4gIHBsdWdpbnM6IFtcbiAgICByZWFjdCgpLFxuICAgIG1vZGUgPT09IFwiZGV2ZWxvcG1lbnRcIiAmJiBjb21wb25lbnRUYWdnZXIoKSxcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIEFQSSBoYW5kbGVyIHBsdWdpbnMgXHUyMDE0IGVhY2ggb25lIGludGVyY2VwdHMgYSBVUkwgcHJlZml4IGFuZFxuICAgIC8vIGV4ZWN1dGVzIHRoZSBtYXRjaGluZyBhcGkvIGhhbmRsZXIgaW4tcHJvY2Vzcy5cbiAgICAvL1xuICAgIC8vIE9yZGVyIG1hdHRlcnM6IG1vcmUtc3BlY2lmaWMgcHJlZml4ZXMgYmVmb3JlIGxlc3Mtc3BlY2lmaWMgb25lcy5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAgIC8vIFJvdXRlIHBsYW5uZXIgKE9TUk0gKyBpbmNpZGVudCBhbmFseXNpcylcbiAgICBtYWtlQXBpUGx1Z2luKFxuICAgICAgXCJyb3V0ZS1hcGlcIixcbiAgICAgIFwiL2FwaS9yb3V0ZS9cIixcbiAgICAgIHBhdGguam9pbihBUElfRElSLCBcInJvdXRlL2FsdGVybmF0ZS5qc1wiKVxuICAgICksXG5cbiAgICAvLyBPU0lOVCBDWE8gaW50ZWxsaWdlbmNlIC8gR29vZ2xlIGRvcmtpbmdcbiAgICBtYWtlQXBpUGx1Z2luKFxuICAgICAgXCJvc2ludC1hcGlcIixcbiAgICAgIFwiL2FwaS9vc2ludC9cIixcbiAgICAgIHBhdGguam9pbihBUElfRElSLCBcIm9zaW50L2RvcmstY3hvLmpzXCIpXG4gICAgKSxcblxuICAgIC8vIFNlbnRpbWVudCBhbmFseXNpc1xuICAgIG1ha2VBcGlQbHVnaW4oXG4gICAgICBcInNlbnRpbWVudC1hcGlcIixcbiAgICAgIFwiL2FwaS9zZW50aW1lbnQvXCIsXG4gICAgICBwYXRoLmpvaW4oQVBJX0RJUiwgXCJzZW50aW1lbnQvYW5hbHl6ZS5qc1wiKVxuICAgICksXG5cbiAgICAvLyBSZXZlcnNlIGdlb2NvZGluZyAobW9yZSBzcGVjaWZpYyBwcmVmaXggZmlyc3QpXG4gICAgbWFrZUFwaVBsdWdpbihcbiAgICAgIFwicmV2ZXJzZS1nZW9jb2RlLWFwaVwiLFxuICAgICAgXCIvYXBpL3JldmVyc2UtZ2VvY29kZVwiLFxuICAgICAgcGF0aC5qb2luKEFQSV9ESVIsIFwicmV2ZXJzZS1nZW9jb2RlLmpzXCIpXG4gICAgKSxcblxuICAgIC8vIEZvcndhcmQgZ2VvY29kaW5nIChOb21pbmF0aW0pXG4gICAgbWFrZUFwaVBsdWdpbihcbiAgICAgIFwiZ2VvY29kZS1hcGlcIixcbiAgICAgIFwiL2FwaS9nZW9jb2RlXCIsXG4gICAgICBwYXRoLmpvaW4oQVBJX0RJUiwgXCJnZW9jb2RlLmpzXCIpXG4gICAgKSxcblxuICAgIC8vIFBvbHltYXJrZXQgcHJlZGljdGlvbiBtYXJrZXRzIHByb3h5XG4gICAgbWFrZUFwaVBsdWdpbihcbiAgICAgIFwicG9seW1hcmtldC1hcGlcIixcbiAgICAgIFwiL2FwaS9wb2x5bWFya2V0XCIsXG4gICAgICBwYXRoLmpvaW4oQVBJX0RJUiwgXCJwb2x5bWFya2V0LmpzXCIpXG4gICAgKSxcblxuICAgIC8vIFJTUyBmZWVkIHByb3h5IChuZXdzIGZlZWRzLCB0aGluay10YW5rIGZlZWRzLCBldGMuKVxuICAgIG1ha2VBcGlQbHVnaW4oXG4gICAgICBcInJzcy1wcm94eVwiLFxuICAgICAgXCIvYXBpL3Jzcy1wcm94eVwiLFxuICAgICAgcGF0aC5qb2luKEFQSV9ESVIsIFwicnNzLXByb3h5LmpzXCIpXG4gICAgKSxcblxuICAgIC8vIFVuaWZpZWQgQUkgRW5yaWNobWVudCB2MlxuICAgIG1ha2VBcGlQbHVnaW4oXG4gICAgICBcIm5ld3MtZW5yaWNobWVudFwiLFxuICAgICAgXCIvYXBpL2VucmljaG1lbnQvbmV3cy12MlwiLFxuICAgICAgcGF0aC5qb2luKEFQSV9ESVIsIFwiZW5yaWNobWVudC9uZXdzLXYyLmpzXCIpXG4gICAgKSxcbiAgICBtYWtlQXBpUGx1Z2luKFxuICAgICAgXCJpbnRlbC1lbnJpY2htZW50XCIsXG4gICAgICBcIi9hcGkvZW5yaWNobWVudC9pbnRlbC12MlwiLFxuICAgICAgcGF0aC5qb2luKEFQSV9ESVIsIFwiZW5yaWNobWVudC9pbnRlbC12Mi5qc1wiKVxuICAgICksXG4gIF0uZmlsdGVyKEJvb2xlYW4pLFxuXG4gIHJlc29sdmU6IHtcbiAgICBhbGlhczoge1xuICAgICAgXCJAXCI6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIFwiLi9zcmNcIiksXG4gICAgfSxcbiAgfSxcbn0pKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBa1csU0FBUyxvQkFBaUM7QUFDNVksT0FBTyxXQUFXO0FBQ2xCLE9BQU8sVUFBVTtBQUNqQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHVCQUF1QjtBQUpoQyxJQUFNLG1DQUFtQztBQVd6QyxTQUFTLGFBQWEsS0FBVSxNQUEwQixNQUF1QjtBQUMvRSxRQUFNLE1BQU0sSUFBSSxJQUFJLElBQUksS0FBTSxvQkFBb0IsSUFBSSxFQUFFO0FBQ3hELFFBQU0sVUFBa0MsQ0FBQztBQUN6QyxhQUFXLENBQUMsS0FBSyxLQUFLLEtBQUssT0FBTyxRQUFRLElBQUksT0FBa0MsR0FBRztBQUNqRixRQUFJLE9BQU8sVUFBVSxTQUFVLFNBQVEsR0FBRyxJQUFJO0FBQUEsYUFDckMsTUFBTSxRQUFRLEtBQUssRUFBRyxTQUFRLEdBQUcsSUFBSyxNQUFtQixLQUFLLElBQUk7QUFBQSxFQUM3RTtBQUNBLFNBQU8sSUFBSSxRQUFRLElBQUksU0FBUyxHQUFHO0FBQUEsSUFDakMsUUFBUSxJQUFJO0FBQUEsSUFDWjtBQUFBLElBQ0EsTUFBTSxRQUFRO0FBQUEsRUFDaEIsQ0FBQztBQUNIO0FBR0EsZUFBZSxTQUFTLEtBQXVDO0FBQzdELE1BQUksQ0FBQyxDQUFDLFFBQVEsT0FBTyxPQUFPLEVBQUUsU0FBUyxJQUFJLFVBQVUsRUFBRSxFQUFHLFFBQU87QUFDakUsUUFBTSxTQUFtQixDQUFDO0FBQzFCLG1CQUFpQixTQUFTLEtBQUs7QUFDN0IsV0FBTyxLQUFLLE9BQU8sVUFBVSxXQUFXLE9BQU8sS0FBSyxLQUFLLElBQUksS0FBSztBQUFBLEVBQ3BFO0FBQ0EsU0FBTyxPQUFPLE9BQU8sTUFBTSxFQUFFLFNBQVM7QUFDeEM7QUFVQSxTQUFTLGNBQWMsTUFBYyxRQUFnQixZQUE0QjtBQUMvRSxTQUFPO0FBQUEsSUFDTDtBQUFBLElBQ0EsZ0JB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
