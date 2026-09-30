# Security

## Secret handling

`DEEPSEEK_API_KEY` must exist only as a Cloudflare Worker Secret. Never store it in:

- frontend source code
- `VITE_*` environment variables
- `wrangler.toml`
- GitHub Pages build output
- committed `.env` files

## Document privacy

The browser reads and rewrites the DOCX package locally. The AI proxy receives only extracted paragraph text and weak formatting metadata; it does not receive the DOCX binary, images, embedded files, or OOXML package.

## Abuse controls

The Worker currently enforces:

- exact Origin allowlist
- maximum paragraph count
- maximum total text size
- maximum request body size
- `Cache-Control: no-store`

Before public promotion, configure Cloudflare Rate Limiting for `/v1/structure`. If stronger public abuse protection is required, add Cloudflare Turnstile and verify its token in the Worker before calling DeepSeek.
