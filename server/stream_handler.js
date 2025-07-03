// --- Configuration Loader ---
// Load settings from environment variables for Deno Deploy compatibility.
const getConfig = () => {
    // console.log("Loading configuration from environment variables...");
    const datasetId = Deno.env.get("datasetId");
    const apiKey = Deno.env.get("apiKey");

    if (!datasetId) {
        // console.error("错误：环境变量 datasetId 未设置。请在启动前设置该变量。");
        Deno.exit(1);
    }

    if (!apiKey) {
        // console.error("错误：环境变量 apiKey 未设置。请在启动前设置该变量。");
        Deno.exit(1);
    }

    return {
        datasetId,
        apiKey,
    };
};

// --- API Virtualization (unchanged) ---
const API_MAP = {
    connect: Deno.connect,
    digest: crypto.subtle.digest.bind(crypto.subtle),
};

// --- Helper Functions (mostly unchanged, for parsing) ---
function generateUUID(data) {
    const toHex = byte => byte.toString(16).padStart(2, '0');
    let uuid = '';
    for (let i = 0; i < 16; i++) {
        uuid += toHex(data[i]);
        if (i === 3 || i === 5 || i === 7 || i === 9) uuid += '-';
    }
    return uuid;
}

async function parseVlessData(data, config) {
    if (data.length < 18 || generateUUID(data.slice(1, 17)).toLowerCase() !== config.datasetId.toLowerCase()) {
        throw new Error(`Invalid VLESS datasetId. Expected: ${config.datasetId}`);
    }
    let offset = 17; // Skip version + UUID

    // Correctly parse and skip the VLESS addon section.
    const addonsLength = data[offset];
    offset += 1; // Move past the addon length byte.

    // Boundary check to ensure the addon data is fully contained.
    if (data.length < offset + addonsLength) {
        throw new Error(`Incomplete VLESS packet: addon data is missing.`);
    }
    offset += addonsLength; // Skip the addon data itself.

    if (data.length < offset + 4 || data[offset++] !== 1) throw new Error("Invalid VLESS command/structure after addons");
    const port = (data[offset] << 8) | data[offset + 1];
    offset += 2;
    const addrType = data[offset++];
    let address;
    switch (addrType) {
        case 1: address = Array.from(data.slice(offset, offset + 4)).join('.'); offset += 4; break;
        case 2: const len = data[offset++]; address = new TextDecoder().decode(data.slice(offset, offset + len)); offset += len; break;
        case 3: const ipv6Bytes = []; for (let i = 0; i < 8; i++) ipv6Bytes.push(data.slice(offset + i * 2, offset + (i + 1) * 2).map(b => b.toString(16).padStart(2, '0')).join('')); address = ipv6Bytes.join(':'); offset += 16; break;
        default: throw new Error(`Unsupported VLESS address type: ${addrType}`);
    }
    return { address, port, payload: data.slice(offset), protocol: 'VLESS' };
}

async function parseTrojanData(data, config) {
    if (data.length < 56 + 2 + 1 + 1 + 2) throw new Error(`Invalid Trojan data length: ${data.length}`);
    const passwordHash = Array.from(new Uint8Array(data.slice(0, 56))).map(b => b.toString(16).padStart(2, '0')).join('');
    const passwordData = new TextEncoder().encode(config.apiKey);
    const expectedHashBuffer = await API_MAP.digest('SHA-224', passwordData);
    const expectedHash = Array.from(new Uint8Array(expectedHashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    if (passwordHash !== expectedHash.slice(0, 56)) throw new Error("Invalid Trojan apiKey (password)");
    if (data[56] !== 13 || data[57] !== 10) throw new Error("Invalid Trojan CRLF");
    let offset = 58;
    const addrType = data[offset++];
    let address;
    switch (addrType) {
        case 1: address = Array.from(data.slice(offset, offset + 4)).join('.'); offset += 4; break;
        case 3: const len = data[offset++]; address = new TextDecoder().decode(data.slice(offset, offset + len)); offset += len; break;
        case 4: const ipv6Bytes = []; for (let i = 0; i < 8; i++) ipv6Bytes.push(data.slice(offset + i * 2, offset + (i + 1) * 2).map(b => b.toString(16).padStart(2, '0')).join('')); address = ipv6Bytes.join(':'); offset += 16; break;
        default: throw new Error(`Unsupported Trojan address type: ${addrType}`);
    }
    const port = (data[offset] << 8) | data[offset + 1];
    offset += 2;
    if (data[offset] !== 13 || data[offset + 1] !== 10) throw new Error("Invalid Trojan Port CRLF");
    offset += 2;
    return { address, port, payload: data.slice(offset), protocol: 'Trojan' };
}

async function parseDataPacket(data, config) {
    // console.log("Attempting to parse data packet...");
    try {
        // console.log("Trying to parse as VLESS...");
        return await parseVlessData(data, config);
    } catch (vlessError) {
        // console.log(`VLESS parsing failed: ${vlessError.message}`);
    }
    try {
        // console.log("Trying to parse as Trojan...");
        return await parseTrojanData(data, config);
    } catch (trojanError) {
        // console.log(`Trojan parsing failed: ${trojanError.message}`);
    }
    throw new Error("Unknown data packet format. Both VLESS and Trojan parsing failed.");
}

// --- Main Connection Handler (Simplified) ---
export async function handleChartConnection(socket) {
    // console.log("New client connection received. Initializing simplified handler.");
    const config = getConfig();
    let upstreamConnection = null;
    let isProxyStarted = false;

    const cleanUp = () => {
        // console.log("Cleaning up connection.");
        if (upstreamConnection) {
            const conn = upstreamConnection;
            upstreamConnection = null; // Prevent re-entry and future close attempts.
            try {
                conn.close();
            } catch (e) {
                // A "Bad resource ID" error is expected if the connection was already
                // closed by the other end. We can safely ignore it.
                if (!e.message.includes("Bad resource ID")) {
                    // console.error("Error closing upstream connection:", e.message);
                }
            }
        }
    };

    const startProxyPipeline = async (parsedRequest) => {
        const { address, port, payload, protocol } = parsedRequest;
        // console.log(`Attempting to start proxy pipeline for ${protocol} to ${address}:${port}`);

        try {
            upstreamConnection = await API_MAP.connect({ hostname: address, port });
            // console.log(`Successfully connected to upstream: ${address}:${port}`);
        } catch (err) {
            // console.error(`Upstream connection to ${address}:${port} failed:`, err);
            if (socket.readyState === WebSocket.OPEN) {
                socket.close(1011, "Upstream connection failed");
            }
            return;
        }

        // For VLESS, send the standard response immediately after connecting.
        if (protocol === 'VLESS' && socket.readyState === WebSocket.OPEN) {
            // console.log("Sending VLESS handshake response.");
            socket.send(new Uint8Array([0, 0]));
        }

        isProxyStarted = true;

        const wsReadable = new ReadableStream({
            start(controller) {
                // Enqueue the initial payload that was buffered.
                if (payload && payload.length > 0) {
                    controller.enqueue(payload);
                }
                // Re-assign onmessage to pipe subsequent data directly to the upstream.
                socket.onmessage = (msgEvent) => controller.enqueue(new Uint8Array(msgEvent.data));
                socket.onclose = () => {
                    try {
                        controller.close();
                    } catch (e) { /* ignore */ }
                };
                socket.onerror = (err) => controller.error(err);
            },
            cancel() {
                cleanUp();
            }
        });

        const wsWritable = new WritableStream({
            write(chunk) {
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(chunk);
                }
            },
            close() { }
        });

        try {
            await Promise.all([
                wsReadable.pipeTo(upstreamConnection.writable, { preventClose: true }),
                upstreamConnection.readable.pipeTo(wsWritable, { preventClose: true })
            ]);
        } catch (error) {
            // console.log("Pipe closed.", error.message);
        } finally {
            cleanUp();
            if (socket.readyState === WebSocket.OPEN) {
                socket.close();
            }
        }
    };

    // Handle only the first message to set up the proxy.
    socket.onmessage = async (event) => {
        // Prevent this handler from running more than once.
        if (isProxyStarted) {
            return;
        }

        const data = new Uint8Array(event.data);

        try {
            const parsedRequest = await parseDataPacket(data, config);
            // Once the first packet is successfully parsed, start the proxy.
            // The onmessage handler will be reassigned inside the pipeline stream.
            await startProxyPipeline(parsedRequest);
        } catch (error) {
            // console.error("Failed to parse initial data packet:", error.message);
            socket.close(1002, "Invalid data format");
        }
    };

    socket.onclose = cleanUp;
    socket.onerror = (e) => {
        // console.error("WebSocket error:", e.message);
        cleanUp();
    };
}