let decoyInterval = null;

function startSendingDecoyData(socket) {
    if (decoyInterval) {
        clearInterval(decoyInterval);
    }

    // Immediately send a connection status message
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            status: "connected",
            message: "Live data feed established. Waiting for data points..."
        }));
    }

    decoyInterval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
            const decoyData = {
                timestamp: new Date().toISOString(),
                value: (Math.random() * 100).toFixed(2),
                metric: 'system.cpu.usage',
                region: 'us-east-1'
            };
            socket.send(JSON.stringify(decoyData));
        } else {
            // Stop if the socket is no longer open
            stopSendingDecoyData();
        }
    }, Math.random() * 2000 + 1000); // Send every 1-3 seconds
}

function stopSendingDecoyData() {
    if (decoyInterval) {
        clearInterval(decoyInterval);
        decoyInterval = null;
    }
}

export { startSendingDecoyData, stopSendingDecoyData };