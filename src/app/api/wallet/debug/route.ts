export const dynamic = "force-dynamic";

/**
 * Debug helper endpoint.
 *
 * Note: Browser extension injected providers (like Kibisis) are NOT visible on the server,
 * so we return a helpful explanation for debugging.
 */
export async function GET() {
  return Response.json({
    ok: true,
    message:
      "Wallet providers injected by browser extensions (Kibisis) only exist in the browser window and cannot be detected from a Next.js server route. Use the in-app debug panel (coming from client side) to inspect window injections.",
  });
}
