class SocketManager {
    constructor() {
        this.socket = null;
        this.gameCallbacks = {};
        this.matchData = {
            players: [],
            searching: false
        };
        this.reconnectionAttempts = 0;
        this.maxReconnectionAttempts = 5;
        this.playerId = null; // Add tracking for player ID
        this.selectedColor = null; // Add tracking for selected color
    }

    connect() {
        return new Promise((resolve, reject) => {
            try {
                const serverUrl = 'http://localhost:3000';

                this.socket = io(serverUrl, {
                    transports: ['websocket', 'polling'],
                    reconnection: true,
                    reconnectionAttempts: 5,
                    reconnectionDelay: 1000,
                    timeout: 10000,
                    autoConnect: true,
                    forceNew: true
                });

                this.socket.on('connect', () => {
                    console.log('Connected to game server with ID:', this.socket.id);
                    this.playerId = this.socket.id; // Store the socket ID
                    localStorage.setItem('socketId', this.socket.id); // Save for game scene
                    this.setupEventListeners();
                    resolve();
                });

                this.socket.on('connect_error', (error) => {
                    console.log('Connection error:', error);
                    this.reconnectionAttempts++;
                    if (this.reconnectionAttempts >= this.maxReconnectionAttempts) {
                        reject(error);
                    }
                });

            } catch (error) {
                console.error('Socket initialization error:', error);
                reject(error);
            }
        });
    }

    
setupEventListeners() {
    this.socket.on('matchmaking_status', (data) => {
        console.log('Matchmaking status update:', data);
        if (this.gameCallbacks.onMatchmakingUpdate) {
            this.gameCallbacks.onMatchmakingUpdate(data);
        }
    });

    this.socket.on('match_found', (data) => {
        console.log('Match found:', data);
        if (this.gameCallbacks.onMatchFound) {
            this.gameCallbacks.onMatchFound(data);
        }
    });

    this.socket.on('match_update', (data) => {
        console.log('Match update:', data);
        this.matchData.players = data.players;
        
        if (this.gameCallbacks.onMatchUpdate) {
            this.gameCallbacks.onMatchUpdate(data);
        }
        
        const allReady = data.players.every(p => p.ready && p.color);
        console.log('All players ready?', allReady);
        if (allReady) {
            console.log('All players are ready!');
            // Randomly select a map when all players are ready
            const maps = ['desert', 'city', 'space'];
            const randomMap = maps[Math.floor(Math.random() * maps.length)];
            console.log('Selected random map:', randomMap);
            
            this.socket.emit('check_game_start', { 
                matchId: data.matchId,
                playerId: this.playerId,
                selectedColor: this.selectedColor,
                selectedMap: randomMap
            });
        }
    });

    this.socket.on('game_start', (gameConfig) => {
        console.log('Game start event received:', gameConfig);
        if (this.gameCallbacks.onGameStart) {
            const enhancedConfig = {
                ...gameConfig,
                isOnlineGame: true,
                map: gameConfig.selectedMap || 'desert', // Use the randomly selected map or fallback to desert
                playerId: this.playerId,
                players: this.matchData.players
            };
            console.log('Starting game with config:', enhancedConfig);
            this.gameCallbacks.onGameStart(enhancedConfig);
        }
    });

    this.socket.on('player_disconnected', (data) => {
        console.log('Player disconnected:', data);
        if (this.gameCallbacks.onPlayerDisconnected) {
            this.gameCallbacks.onPlayerDisconnected(data);
        }
    });

    setInterval(() => {
        if (this.socket && this.socket.connected) {
            this.socket.emit('ping');
        }
    }, 25000);
}

    findMatch() {
        console.log('Finding match...');
        if (this.socket && this.socket.connected) {
            this.socket.emit('find_match');
        }
    }

    cancelMatch() {
        console.log('Cancelling match search...');
        if (this.socket && this.socket.connected) {
            this.socket.emit('cancel_match');
        }
    }

    selectColor(color) {
        console.log('Selecting color:', color);
        this.selectedColor = color; // Store selected color
        localStorage.setItem('selectedRabbitColor', color); // Save for game scene
        if (this.socket && this.socket.connected) {
            this.socket.emit('select_color', { 
                color,
                playerId: this.playerId
            });
        }
    }

    setReady(ready) {
        console.log('Setting ready state:', ready);
        if (this.socket && this.socket.connected) {
            this.socket.emit('player_ready', { 
                ready,
                playerId: this.playerId,
                selectedColor: this.selectedColor
            });
        }
    }

    onMatchmakingUpdate(callback) {
        this.gameCallbacks.onMatchmakingUpdate = callback;
    }

    onMatchFound(callback) {
        this.gameCallbacks.onMatchFound = callback;
    }

    onMatchUpdate(callback) {
        this.gameCallbacks.onMatchUpdate = callback;
    }

    onGameStart(callback) {
        this.gameCallbacks.onGameStart = callback;
    }

    onPlayerDisconnected(callback) {
        this.gameCallbacks.onPlayerDisconnected = callback;
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.gameCallbacks = {};
        this.reconnectionAttempts = 0;
        this.playerId = null;
        this.selectedColor = null;
        localStorage.removeItem('socketId');
    }
}

export default SocketManager;