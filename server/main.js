import { httpRequestHandler } from './request_handler.js';

const port = Deno.env.get("PORT") || 8080;

console.log(`Data visualization server starting on http://localhost:${port}`);

Deno.serve({ port: parseInt(port, 10) }, async (request) => {
    try {
        return await httpRequestHandler(request);
    } catch (error) {
        console.error("Unhandled error in main handler:", error);
        return new Response("Internal Server Error", { status: 500 });
    }
});