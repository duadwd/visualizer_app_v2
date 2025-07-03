import { httpRequestHandler } from './request_handler.js';
import { handleChartConnection } from './stream_handler.js';

const port = Deno.env.get("PORT") || 8080;

console.log(`Data visualization server starting on http://localhost:${port}`);

Deno.serve({ port: parseInt(port, 10) }, async (request) => {
    const url = new URL(request.url);
    console.log(`Received request for: ${url.pathname}`);

    if (url.pathname === "/ws") {
        console.log("WebSocket upgrade request received. Upgrading connection...");
        try {
            const { socket, response } = Deno.upgradeWebSocket(request);
            handleChartConnection(socket);
            return response;
        } catch (error) {
            console.error("WebSocket upgrade failed:", error);
            return new Response("WebSocket upgrade failed", { status: 400 });
        }
    } else if (url.pathname === "/") {
        console.log("Root path request received. Serving index.html...");
        try {
            return await httpRequestHandler(request);
        } catch (error) {
            console.error("Error serving index.html:", error);
            return new Response("Internal Server Error", { status: 500 });
        }
    } else {
        console.log(`Unhandled path: ${url.pathname}. Returning 404.`);
        return new Response("Not Found", { status: 404 });
    }
});