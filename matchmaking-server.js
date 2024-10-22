const socketIO = require('socket.io');
const { v4: uuidv4 } = require('uuid');

class MatchmakingServer {
    constructor(server) {
        this.io = socketIO(server);
        this.queues = new Map(); // Players searching for matches
        this.matches = new Map(); // Active matches
        this.setupSocketServer();
    }

    setupSocketServer() {
        this.io.on('connection', (socket) => {
            console.log('Player connected:', socket.id);

            socket.on('find_match', () => this.handleFindMatch(socket));
            socket.on('cancel_match', () => this.handleCancelMatch(socket));
            socket.on('select_color', (data) => this.handleColorSelection(socket, data));
            socket.on('player_ready', (data) => this.handlePlayerReady(socket, data));
            socket.on('disconnect', () => this.handleDisconnect(socket));
        });
    }

    handleFindMatch(socket) {
        // Add player to queue
        this.queues.set(socket.id, {
            socket,
            joinTime: Date.now()
        });

        // Update all searching players
        this.broadcastQueueStatus();

        // Check if we can create a match
        if (this.queues.size >= 4) {
            this.createMatch([...this.queues.values()].slice(0, 4));
        }
    }

    handleCancelMatch(socket) {
        this.queues.delete(socket.id);
        this.broadcastQueueStatus();
    }

    createMatch(players) {
        const matchId = uuidv4();
        const match = {
            id: matchId,
            players: players.map(({ socket }) => ({
                id: socket.id,
                socket,
                color: null,
                ready: false
            })),
            state: 'color_selection'
        };

        this.matches.set(matchId, match);

        // Remove players from queue
        players.forEach(({ socket }) => {
            this.queues.delete(socket.id);
            socket.matchId = matchId;
        });

        // Notify players
        match.players.forEach(player => {
            player.socket.emit('match_found', {
                matchId,
                players: match.players.map(p => ({ id: p.id }))
            });
        });
    }

    handleColorSelection(socket, { color }) {
        const match = this.matches.get(socket.matchId);
        if (match) {
            const player = match.players.find(p => p.id === socket.id);
            if (player) {
                // Check if color is already taken
                const colorTaken = match.players.some(p => p.id !== socket.id && p.color === color);
                if (!colorTaken) {
                    player.color = color;
                    this.broadcastMatchUpdate(match);
                }
            }
        }
    }

    handlePlayerReady(socket, { ready }) {
        const match = this.matches.get(socket.matchId);
        if (match) {
            const player = match.players.find(p => p.id === socket.id);
            if (player) {
                player.ready = ready;
                this.broadcastMatchUpdate(match);
                this.checkMatchStart(match);
            }
        }
    }

    broadcastQueueStatus() {
        const status = {
            searching: true,
            playersInQueue: this.queues.size,
            estimatedWaitTime: this.calculateWaitTime()
        };

        this.queues.forEach(({ socket }) => {
            socket.emit('matchmaking_status', status);
        });
    }

    broadcastMatchUpdate(match) {
        const update = {
            players: match.players.map(p => ({
                id: p.id,
                color: p.color,
                ready: p.ready
            }))
        };

        match.players.forEach(player => {
            player.socket.emit('color_selection_update', update);
        });
    }

    checkMatchStart(match) {
        const allReady = match.players.every(p => p.ready && p.color);
        if (allReady) {
            const gameConfig = {
                players: match.players.map(p => ({
                    id: p.id,
                    color: p.color
                }))
            };

            match.players.forEach(player => {
                player.socket.emit('game_start', gameConfig);
            });

            // Clean up match
            this.matches.delete(match.id);
        }
    }

    handleDisconnect(socket) {
        // Remove from queue if searching
        this.handleCancelMatch(socket);

        // Handle disconnect from match
        const match = this.matches.get(socket.matchId);
        if (match) {
            match.players.forEach(player => {
                if (player.id !== socket.id) {
                    player.socket.emit('player_disconnected', {
                        playerId: socket.id
                    });
                }
            });
            // Clean up match
            this.matches.delete(socket.matchId);
        }
    }

    calculateWaitTime() {
        const baseTime = 30; // Base wait time in seconds
        const playersNeeded = 4 - this.queues.size;
        return Math.max(baseTime * playersNeeded, 10);
    }
}

module.exports = MatchmakingServer;