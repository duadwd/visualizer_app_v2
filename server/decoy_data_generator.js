// --- Session-based "Hyper-realistic" Decoy Data Generator ---

// Each connection will have its own timer and session state.
// We use a Map to track timers for multiple concurrent connections.
const connectionTimers = new Map();

const SessionState = {
    IDLE: 'idle',       // Simulates a user being inactive or between sessions.
    ACTIVE: 'active',   // Simulates a user actively "browsing" the application.
};

const Events = {
    USER_LOGIN: 'user.login.success',
    PAGE_VIEW: 'page.view',
    API_LATENCY: 'api.request.latency',
    DB_QUERY: 'database.query.time',
    SESSION_END: 'user.session.end',
};

// Creates a new session object for a connection.
function createNewSession() {
    return {
        state: SessionState.IDLE,
        userId: `user-${Math.floor(Math.random() * 9000) + 1000}`,
        lastEvent: null,
        sessionTimeoutId: null, // Timer to end an active session.
    };
}

// Generates the next logical event based on the current session state.
function generateDecoyEvent(session) {
    // State transition: An idle user "starts a new session".
    if (session.state === SessionState.IDLE) {
        session.state = SessionState.ACTIVE;
        session.lastEvent = Events.USER_LOGIN;
        
        // Set a timer to automatically end this "active session".
        if (session.sessionTimeoutId) clearTimeout(session.sessionTimeoutId);
        session.sessionTimeoutId = setTimeout(() => {
            session.state = SessionState.IDLE;
            session.lastEvent = Events.SESSION_END;
        }, Math.random() * 20000 + 15000); // Active session lasts 15-35 seconds.
        
        return { event: Events.USER_LOGIN, value: { success: true, userId: session.userId } };
    }

    // Event generation for an "active" user.
    if (session.state === SessionState.ACTIVE) {
        const possibleEvents = [Events.PAGE_VIEW, Events.API_LATENCY, Events.DB_QUERY];
        // After logging in, a page view is highly likely.
        if (session.lastEvent === Events.USER_LOGIN) {
            possibleEvents.push(Events.PAGE_VIEW, Events.PAGE_VIEW, Events.PAGE_VIEW);
        }
        const eventType = possibleEvents[Math.floor(Math.random() * possibleEvents.length)];
        session.lastEvent = eventType;

        let value;
        let packetSize; // To simulate dynamic packet sizes.
        switch (eventType) {
            case Events.PAGE_VIEW:
                const paths = ['/dashboard', '/settings/profile', '/data/visuals', '/docs/api', '/billing'];
                value = { path: paths[Math.floor(Math.random() * paths.length)], referrer: 'internal' };
                packetSize = Math.floor(Math.random() * 150) + 100; // Larger payload
                break;
            case Events.API_LATENCY:
                value = Math.floor(Math.random() * 250) + 50; // 50-300ms
                packetSize = Math.floor(Math.random() * 50) + 40; // Medium payload
                break;
            case Events.DB_QUERY:
                value = (Math.random() * 15).toFixed(4); // 0-15ms
                packetSize = Math.floor(Math.random() * 40) + 30; // Small payload
                break;
        }
        // Pad the value to simulate different packet sizes.
        value.padding = ' '.repeat(Math.max(0, packetSize - JSON.stringify(value).length));
        return { event: eventType, value };
    }
    
    // Fallback for any unexpected state.
    return { event: 'system.heartbeat', value: 'ok' };
}

function scheduleNextDecoy(socket, session, forcedInterval) {
    const timerId = connectionTimers.get(socket);
    if (timerId) clearTimeout(timerId);
    if (socket.readyState !== WebSocket.OPEN) {
        stopSendingDecoyData(socket);
        return;
    }

    let nextInterval;
    if (forcedInterval) {
        // Used during the WarmUp phase to gradually increase the interval.
        nextInterval = forcedInterval;
    } else if (session.state === SessionState.ACTIVE) {
        // Active user: frequent, smaller, variable intervals.
        nextInterval = Math.random() * 2500 + 500; // 0.5s to 3s
    } else { // IDLE
        // Idle user: long, variable pauses between sessions.
        nextInterval = Math.random() * 6000 + 7000; // 7s to 13s
    }
    
    const newTimerId = setTimeout(() => {
        if (socket.readyState === WebSocket.OPEN) {
            const payload = generateDecoyEvent(session);
            socket.send(JSON.stringify({
                timestamp: new Date().toISOString(),
                metric: payload.event,
                value: payload.value,
                // Make data appear more dynamic.
                region: Math.random() > 0.5 ? 'us-east-1' : 'eu-west-1', 
                source: `backend-worker-${Math.floor(Math.random() * 5)}`
            }));
            // Reschedule the next event.
            scheduleNextDecoy(socket, session); 
        }
    }, nextInterval);
    connectionTimers.set(socket, newTimerId);
}

function startSendingDecoyData(socket) {
    const session = createNewSession();
    
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            status: "connected",
            message: "Live data feed established. Waiting for data points..."
        }));
    }
    
    scheduleNextDecoy(socket, session);
    return session; // Return the session to be managed by the stream_handler.
}

function updateDecoyInterval(socket, session, newInterval) {
    // This will reschedule the next decoy with the new, specified interval.
    scheduleNextDecoy(socket, session, newInterval);
}

function stopSendingDecoyData(socket) {
    const timerId = connectionTimers.get(socket);
    if (timerId) {
        clearTimeout(timerId);
        connectionTimers.delete(socket);
    }
    // The session object itself is managed and cleared in stream_handler.
}

export { startSendingDecoyData, stopSendingDecoyData, updateDecoyInterval };