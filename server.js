const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const path = require('path');
const http = require('http');
const socketIO = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const AVAILABLE_MAPS = ['desert', 'city', 'space'];

//io initialization
const io = socketIO(server, {
    pingTimeout: 60000,
    pingInterval: 25000,
    cors: {
        origin: ["http://localhost:3000", "app://*", "file://*"],  // Allow Electron origins
        methods: ["GET", "POST", "OPTIONS"],
        credentials: true,
        allowedHeaders: ["*"]
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    perMessageDeflate: false  // Important for Electron
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected successfully to hopperzdb'))
    .catch(err => console.error('MongoDB connection error:', err));

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Enable CORS for Express routes
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', '*');
    next();
});

// User model
const User = mongoose.model('User', {
    email: String,
    password: String,
    carrots: { type: Number, default: 0 },
    purchasedItems: [String],
    volume: { type: Number, default: 50 }
});

// Matchmaking state
const matchmakingQueue = new Map();
const activeMatches = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Keep-alive ping handler
    socket.on('ping', () => {
        socket.emit('pong');
    });

    socket.on('find_match', async () => {
        try {
            console.log('Player searching for match:', socket.id);
            
            // Add player to queue
            matchmakingQueue.set(socket.id, {
                socket: socket,
                timestamp: Date.now()
            });

            // Update all searching players with current queue status
            broadcastQueueStatus();

            // Check if we can create a match (4 players)
            if (matchmakingQueue.size >= 4) {
                createMatch([...matchmakingQueue.entries()].slice(0, 4));
            }
        } catch (error) {
            console.error('Error in find_match:', error);
            socket.emit('error', { message: 'Failed to join matchmaking' });
        }
    });

    socket.on('cancel_match', () => {
        try {
            console.log('Player cancelled matchmaking:', socket.id);
            matchmakingQueue.delete(socket.id);
            broadcastQueueStatus();
        } catch (error) {
            console.error('Error in cancel_match:', error);
        }
    });

    socket.on('select_color', (data) => {
        try {
            console.log('Player selecting color:', socket.id, data);
            const match = findMatchByPlayerId(socket.id);
            if (match) {
                const colorTaken = match.players.some(p => p.id !== socket.id && p.color === data.color);
                if (!colorTaken) {
                    const player = match.players.find(p => p.id === socket.id);
                    if (player) {
                        player.color = data.color;
                        broadcastMatchUpdate(match);
                    }
                } else {
                    socket.emit('color_taken');
                }
            }
        } catch (error) {
            console.error('Error in select_color:', error);
            socket.emit('error', { message: 'Failed to select color' });
        }
    });

    socket.on('player_ready', (data) => {
        try {
            console.log('Player ready status:', socket.id, data);
            const match = findMatchByPlayerId(socket.id);
            if (match) {
                const player = match.players.find(p => p.id === socket.id);
                if (player) {
                    player.ready = data.ready;
                    broadcastMatchUpdate(match);
                    checkMatchStart(match);
                }
            }
        } catch (error) {
            console.error('Error in player_ready:', error);
            socket.emit('error', { message: 'Failed to update ready status' });
        }
    });

    socket.on('disconnect', () => {
        try {
            console.log('Client disconnected:', socket.id);
            handlePlayerDisconnect(socket.id);
        } catch (error) {
            console.error('Error in disconnect handler:', error);
        }
    });
});

// Helper functions
function broadcastQueueStatus() {
    const status = {
        playersInQueue: matchmakingQueue.size,
        estimatedWaitTime: calculateWaitTime()
    };

    matchmakingQueue.forEach((data) => {
        try {
            data.socket.emit('matchmaking_status', status);
        } catch (error) {
            console.error('Error broadcasting queue status:', error);
        }
    });
}

function createMatch(players) {
    const matchId = Math.random().toString(36).substring(7);
    const match = {
        id: matchId,
        players: players.map(([id, data]) => ({
            id: id,
            socket: data.socket,
            color: null,
            ready: false
        })),
        state: 'color_selection'
    };

    // Remove players from queue
    players.forEach(([id]) => matchmakingQueue.delete(id));

    // Store match
    activeMatches.set(matchId, match);

    // Notify players
    match.players.forEach(player => {
        try {
            player.socket.emit('match_found', {
                matchId,
                players: match.players.map(p => ({ id: p.id }))
            });
        } catch (error) {
            console.error('Error notifying player of match:', error);
        }
    });
}

function broadcastMatchUpdate(match) {
    const update = {
        matchId: match.id,
        players: match.players.map(p => ({
            id: p.id,
            color: p.color,
            ready: p.ready
        }))
    };

    console.log('Broadcasting match update:', update);
    match.players.forEach(player => {
        try {
            player.socket.emit('match_update', update);
        } catch (error) {
            console.error('Error broadcasting match update:', error);
        }
    });

    // Check if all players are ready after each update
    checkMatchStart(match);
}

function checkMatchStart(match) {
    console.log('Checking match start...');
    console.log('Players state:', match.players.map(p => ({
        id: p.id,
        color: p.color,
        ready: p.ready
    })));

    const allReady = match.players.every(p => p.ready && p.color);
    console.log('All players ready?', allReady);

    if (allReady) {
        console.log('All players ready! Starting game...');
        
        // Select random map
        const randomMap = AVAILABLE_MAPS[Math.floor(Math.random() * AVAILABLE_MAPS.length)];
        console.log('Selected map:', randomMap);

        const gameConfig = {
            isOnlineGame: true,
            players: match.players.map(p => ({
                id: p.id,
                color: p.color
            })),
            map: randomMap,
            matchId: match.id
        };

        // Send game start event to all players
        match.players.forEach(player => {
            console.log(`Sending game start to player ${player.id}`);
            player.socket.emit('game_start', gameConfig);
        });

        // Clean up the match
        activeMatches.delete(match.id);
    }
}

function findMatchByPlayerId(playerId) {
    for (const [matchId, match] of activeMatches) {
        if (match.players.some(p => p.id === playerId)) {
            return match;
        }
    }
    return null;
}

function handlePlayerDisconnect(playerId) {
    matchmakingQueue.delete(playerId);
    broadcastQueueStatus();

    const match = findMatchByPlayerId(playerId);
    if (match) {
        match.players.forEach(player => {
            if (player.id !== playerId) {
                try {
                    player.socket.emit('player_disconnected', { playerId });
                } catch (error) {
                    console.error('Error notifying player of disconnect:', error);
                }
            }
        });
        activeMatches.delete(match.id);
    }
}

function calculateWaitTime() {
    return Math.max(30 * (4 - matchmakingQueue.size), 10);
}

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'hopz.html'));
});

app.post('/api/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check if a user with this email already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, error: 'Email already registered' });
        }

        // If no existing user, proceed with registration
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ email, password: hashedPassword, purchasedItems: [] });
        await user.save();
        res.json({ success: true });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (user && await bcrypt.compare(password, user.password)) {
            res.json({ 
                success: true, 
                carrots: user.carrots, 
                purchasedItems: user.purchasedItems 
            });
        } else {
            res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/updateCarrots', async (req, res) => {
    try {
        const { email, carrotsToAdd } = req.body;
        const user = await User.findOne({ email });
        if (user) {
            user.carrots += carrotsToAdd;
            await user.save();
            res.json({ success: true, newCarrotCount: user.carrots });
        } else {
            res.status(404).json({ success: false, error: 'User not found' });
        }
    } catch (error) {
        console.error('Update carrots error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/getCarrotCount', async (req, res) => {
    console.log('Received request to /api/getCarrotCount');
    console.log('Request body:', req.body);
    try {
        const { email } = req.body;
        if (!email) {
            console.log('No email provided in request');
            return res.status(400).json({ success: false, error: 'Email is required' });
        }
        console.log('Fetching carrot count for email:', email);
        const user = await User.findOne({ email });
        if (user) {
            console.log('User found, carrot count:', user.carrots);
            const responseData = { 
                success: true, 
                carrotCount: user.carrots,
                purchasedItems: user.purchasedItems
            };
            console.log('Sending response:', responseData);
            return res.json(responseData);
        } else {
            console.log('User not found');
            return res.status(404).json({ success: false, error: 'User not found' });
        }
    } catch (error) {
        console.error('Get carrot count error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/purchaseItem', async (req, res) => {
    try {
        const { email, itemId, price } = req.body;
        const user = await User.findOne({ email });
        if (user) {
            if (user.purchasedItems.includes(itemId)) {
                return res.status(400).json({ success: false, error: 'Item already purchased' });
            }
            if (user.carrots >= price) {
                user.carrots -= price;
                user.purchasedItems.push(itemId);
                await user.save();
                res.json({ 
                    success: true, 
                    newCarrotCount: user.carrots,
                    purchasedItems: user.purchasedItems
                });
            } else {
                res.status(400).json({ success: false, error: 'Not enough carrots' });
            }
        } else {
            res.status(404).json({ success: false, error: 'User not found' });
        }
    } catch (error) {
        console.error('Purchase item error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/getVolume', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (user) {
            res.json({ success: true, volume: user.volume || 50 });
        } else {
            res.status(404).json({ success: false, error: 'User not found' });
        }
    } catch (error) {
        console.error('Get volume error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/saveVolume', async (req, res) => {
    try {
        const { email, volume } = req.body;
        const user = await User.findOne({ email });
        if (user) {
            user.volume = volume;
            await user.save();
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, error: 'User not found' });
        }
    } catch (error) {
        console.error('Save volume error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

//start the server with online matchmaking
const PORT = process.env.PORT || 3000;

// Function to check if port is in use
const checkPort = (port) => {
    return new Promise((resolve, reject) => {
        const net = require('net');
        const tester = net.createServer()
            .once('error', err => {
                if (err.code === 'EADDRINUSE') {
                    console.log(`Port ${port} is in use, retrying...`);
                    resolve(false);
                } else {
                    reject(err);
                }
            })
            .once('listening', () => {
                tester.once('close', () => resolve(true))
                    .close();
            })
            .listen(port);
    });
};

// Start server function
const startServer = async () => {
    try {
        // Check if port is available
        const portAvailable = await checkPort(PORT);
        if (!portAvailable) {
            console.error(`Port ${PORT} is in use. Please free the port and try again.`);
            process.exit(1);
        }

        // Connect to MongoDB first
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('MongoDB connected successfully to hopperzdb');

        // Start the server
        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Socket.IO server initialized`);
            console.log(`Serving files from: ${path.join(__dirname, 'public')}`);
        });

        // Handle server errors
        server.on('error', (error) => {
            console.error('Server error:', error);
            if (error.code === 'EADDRINUSE') {
                console.error(`Port ${PORT} is already in use!`);
            }
            process.exit(1);
        });

        // Graceful shutdown
        const shutdown = () => {
            console.log('Shutting down gracefully...');
            server.close(() => {
                console.log('Server closed');
                mongoose.connection.close(false, () => {
                    console.log('MongoDB connection closed');
                    process.exit(0);
                });
            });
        };

        // Handle termination signals
        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

// Start the server
startServer().catch(error => {
    console.error('Server startup error:', error);
    process.exit(1);
});