document.addEventListener('DOMContentLoaded', () => {
    const statusIndicator = document.getElementById('status-indicator');
    const canvas = document.getElementById('live-chart');
    const ctx = canvas.getContext('2d');

    // Basic chart placeholder
    ctx.fillStyle = '#f0f2f5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#aaa';
    ctx.textAlign = 'center';
    ctx.font = '20px Arial';
    ctx.fillText('Waiting for data...', canvas.width / 2, canvas.height / 2);


    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const socket = new WebSocket(`${protocol}//${host}/ws/realtime-data`);

    socket.onopen = () => {
        statusIndicator.textContent = 'Status: Connected';
        statusIndicator.style.color = '#28a745';
        console.log('WebSocket connection established.');

        // Send a dummy subscription message
        const subscriptionMessage = {
            action: 'subscribe',
            channel: 'live-updates'
        };
        socket.send(JSON.stringify(subscriptionMessage));
        console.log('Sent subscription request:', subscriptionMessage);
    };

    socket.onmessage = (event) => {
        console.log('Received data from server:', event.data);
        // In a real chart, you would parse the data and update the canvas here.
        // For this decoy, we just log it.
    };

    socket.onclose = (event) => {
        statusIndicator.textContent = `Status: Disconnected (${event.code})`;
        statusIndicator.style.color = '#dc3545';
        console.log('WebSocket connection closed:', event);
    };

    socket.onerror = (error) => {
        statusIndicator.textContent = 'Status: Connection Error';
        statusIndicator.style.color = '#dc3545';
        console.error('WebSocket error:', error);
    };
});