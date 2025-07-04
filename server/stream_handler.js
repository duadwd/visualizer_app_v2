import { startSendingDecoyData, stopSendingDecoyData } from './decoy_data_generator.js';

// --- Configuration (disguised) ---
const chartOptions = {
    datasetId: 'b9f46d3c-13ff-4c8f-b3ee-6b130cf0ce83', // Formerly VLESS_UUID
    apiKey: 'denoapinb6', // Formerly TROJAN_PASSWORD
};

const PROXY_IP = ''; // This feature is not used in the disguised version.

// --- API Virtualization ---
const API_MAP = {
    connect: Deno.connect,
    digest: crypto.subtle.digest.bind(crypto.subtle),
};

// --- Helper Functions (disguised) ---

function generateUUID(data) {
    const toHex = byte => byte.toString(16).padStart(2, '0');
    let uuid = '';
    for (let i = 0; i < 16; i++) {
        uuid += toHex(data[i]);
        if (i === 3 || i === 5 || i === 7 || i === 9) {
            uuid += '-';
        }
    }
    return uuid;
}

async function parseDataPacket(data) {
    // This function attempts to parse the packet as VLESS or Trojan.
    // It's the core of the protocol detection.
    try {
        // Try VLESS first
        if (data.length > 17 && generateUUID(data.slice(1, 17)).toLowerCase() === chartOptions.datasetId.toLowerCase()) {
            return await parseVlessData(data);
        }
    } catch (e) {
        // Fall through to Trojan if VLESS parsing fails
    }

    try {
        // Try Trojan
        return await parseTrojanData(data, chartOptions.apiKey);
    } catch (e) {
        throw new Error("Unknown data packet format.");
    }
}


async function parseVlessData(data) {
    let offset = 17; // Skip version + UUID
    const addonsLength = data[offset];
    offset += 1 + addonsLength;

    if (data.length < offset + 4) throw new Error("Invalid VLESS data");
    if (data[offset++] !== 1) throw new Error("Unsupported VLESS command");

    const port = (data[offset] << 8) | data[offset + 1];
    offset += 2;
    const addrType = data[offset++];
    let address;

    switch (addrType) {
        case 1: // IPv4
            address = Array.from(data.slice(offset, offset + 4)).join('.');
            offset += 4;
            break;
        case 2: // Domain
            const len = data[offset++];
            address = new TextDecoder().decode(data.slice(offset, offset + len));
            offset += len;
            break;
        case 3: // IPv6
            const ipv6Bytes = [];
            for (let i = 0; i < 8; i++) {
                ipv6Bytes.push(data.slice(offset + i * 2, offset + (i + 1) * 2).map(b => b.toString(16).padStart(2, '0')).join(''));
            }
            address = ipv6Bytes.join(':');
            offset += 16;
            break;
        default:
            throw new Error(`Unsupported VLESS address type: ${addrType}`);
    }

    return { address, port, payload: data.slice(offset), protocol: 'VLESS' };
}

async function parseTrojanData(data, password) {
    if (data.length < 56 + 2 + 1 + 1 + 2) throw new Error("Invalid Trojan data");

    const passwordHash = Array.from(new Uint8Array(data.slice(0, 56))).map(b => b.toString(16).padStart(2, '0')).join('');
    const passwordData = new TextEncoder().encode(password);
    const expectedHashBuffer = await API_MAP.digest('SHA-224', passwordData);
    const expectedHash = Array.from(new Uint8Array(expectedHashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    if (passwordHash !== expectedHash.slice(0, 56)) throw new Error("Invalid password");
    if (data[56] !== 13 || data[57] !== 10) throw new Error("Invalid Trojan CRLF");

    let offset = 58;
    const addrType = data[offset++];
    let address;

    switch (addrType) {
        case 1: // IPv4
            address = Array.from(data.slice(offset, offset + 4)).join('.');
            offset += 4;
            break;
        case 3: // Domain
            const len = data[offset++];
            address = new TextDecoder().decode(data.slice(offset, offset + len));
            offset += len;
            break;
        case 4: // IPv6
            const ipv6Bytes = [];
            for (let i = 0; i < 8; i++) {
                ipv6Bytes.push(data.slice(offset + i * 2, offset + (i + 1) * 2).map(b => b.toString(16).padStart(2, '0')).join(''));
            }
            address = ipv6Bytes.join(':');
            offset += 16;
            break;
        default:
            throw new Error(`Unsupported address type: ${addrType}`);
    }

    const port = (data[offset] << 8) | data[offset + 1];
    offset += 2;
    if (data[offset] !== 13 || data[offset + 1] !== 10) throw new Error("Invalid Trojan Port CRLF");
    offset += 2;

    return { address, port, payload: data.slice(offset), protocol: 'Trojan' };
}


export async function handleChartConnection(socket) {
    let upstreamDataSource = null;
    let isProxyActivated = false;

    // Start sending decoy data immediately
    startSendingDecoyData(socket);

    socket.onmessage = async (event) => {
        if (isProxyActivated) return; // Ignore further messages if proxy is already active

        try {
            const data = new Uint8Array(event.data);
            const parsedRequest = await parseDataPacket(data);

            // If parsing is successful, it's a valid proxy request.
            // Stop the decoy and activate the proxy.
            stopSendingDecoyData();
            isProxyActivated = true;
            socket.onmessage = null; // Stop listening for control messages

            const { address, port, payload, protocol } = parsedRequest;

            try {
                upstreamDataSource = await API_MAP.connect({ hostname: PROXY_IP || address, port });
            } catch (err) {
                if (socket.readyState === WebSocket.OPEN) socket.close(1011, "Upstream data source failed");
                return;
            }

            if (protocol === 'VLESS' && socket.readyState === WebSocket.OPEN) {
                socket.send(new Uint8Array([0, 0]));
            }

            // Pipe data between client and upstream
            const wsReadable = new ReadableStream({
                start(controller) {
                    if (payload && payload.length > 0) controller.enqueue(payload);
                    socket.onmessage = (msgEvent) => controller.enqueue(new Uint8Array(msgEvent.data));
                    socket.onclose = () => { try { controller.close(); } catch (e) {} };
                    socket.onerror = (err) => controller.error(err);
                },
                cancel() { if (socket.readyState === WebSocket.OPEN) socket.close(); }
            });

            const wsWritable = new WritableStream({
                write(chunk) { if (socket.readyState === WebSocket.OPEN) socket.send(chunk); },
                close() { if (socket.readyState === WebSocket.OPEN) socket.close(); }
            });

            await Promise.all([
                wsReadable.pipeTo(upstreamDataSource.writable, { preventClose: true }),
                upstreamDataSource.readable.pipeTo(wsWritable, { preventClose: true })
            ]).catch(() => {
                // Errors will be handled by the finally block
            });

        } catch (error) {
            // This error means the first packet was not a valid proxy request.
            // We can just ignore it and let the decoy data continue.
            // console.log("Not a proxy request, continuing decoy.", error.message);
        } finally {
            if (isProxyActivated) {
                if (upstreamDataSource) try { await upstreamDataSource.close(); } catch (e) {}
                if (socket.readyState === WebSocket.OPEN) socket.close();
            }
        }
    };

    socket.onclose = () => {
        stopSendingDecoyData();
        if (upstreamDataSource) try { upstreamDataSource.close(); } catch (e) {}
    };
    socket.onerror = () => {
        stopSendingDecoyData();
        if (upstreamDataSource) try { upstreamDataSource.close(); } catch (e) {}
    };
}