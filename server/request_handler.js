import { handleChartConnection } from './stream_handler.js';

const CHART_DATA_ENDPOINT = '/ws/realtime-data'; // Formerly WEBSOCKET_PATH

// Fallback data sources for non-WebSocket requests, disguised as a redirect.
const FALLBACK_DATA_SOURCES = [
    'bilibili.com',
    'weibo.com',
    'douyin.com',
    'huya.com',
    'cloudflare.com',
    'v2ex.com'
];

async function serveStaticFile(pathname) {
    const publicDir = new URL('../public/', import.meta.url);
    let filePath;

    // Security: Prevent directory traversal
    if (pathname.includes('..')) {
        return new Response("Not Found", { status: 404 });
    }

    if (pathname === '/') {
        filePath = new URL('index.html', publicDir).pathname;
    } else {
        filePath = new URL(pathname.substring(1), publicDir).pathname;
    }

    // On Windows, URL pathnames start with a slash, remove it.
    const correctedPath = Deno.build.os === "windows" ? filePath.substring(1) : filePath;

    try {
        const file = await Deno.open(correctedPath, { read: true });
        const readableStream = file.readable;
        
        // Determine content type based on file extension
        let contentType = "application/octet-stream";
        if (correctedPath.endsWith(".html")) contentType = "text/html";
        if (correctedPath.endsWith(".css")) contentType = "text/css";
        if (correctedPath.endsWith(".js")) contentType = "application/javascript";

        return new Response(readableStream, {
            headers: { "Content-Type": contentType }
        });
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            return new Response("Not Found", { status: 404 });
        }
        return new Response("Internal Server Error", { status: 500 });
    }
}


export function httpRequestHandler(request) {
    const url = new URL(request.url);
    const upgradeHeader = request.headers.get('Upgrade');

    // Route 1: WebSocket upgrade for the chart data
    if (url.pathname === CHART_DATA_ENDPOINT && upgradeHeader && upgradeHeader.toLowerCase() === 'websocket') {
        try {
            const { socket, response } = Deno.upgradeWebSocket(request);
            handleChartConnection(socket);
            return response;
        } catch (e) {
            return new Response("WebSocket upgrade failed", { status: 500 });
        }
    }

    // Route 2: Serve static files from the public directory
    if (url.pathname.startsWith('/') && (
        url.pathname === '/' ||
        url.pathname.startsWith('/css/') ||
        url.pathname.startsWith('/js/')
    )) {
        return serveStaticFile(url.pathname);
    }

    // Route 3: All other requests are redirected as a fallback
    const randomIndex = Math.floor(Math.random() * FALLBACK_DATA_SOURCES.length);
    const targetDomain = FALLBACK_DATA_SOURCES[randomIndex];
    const proxyUrl = `https://${targetDomain}${url.pathname}${url.search}`;
    return Response.redirect(proxyUrl, 302);
}