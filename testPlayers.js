const io = require('socket.io-client');

class TestPlayer {
    constructor(id) {
        this.id = id;
        this.socket = null;
        this.color = null;
    }

    connect() {
        console.log(`Test Player ${this.id} attempting to connect...`);
        this.socket = io('http://localhost:3000', {
            transports: ['websocket', 'polling']
        });

        this.socket.on('connect', () => {
            console.log(`Test Player ${this.id} connected`);
        });

        this.socket.on('matchmaking_status', (data) => {
            console.log(`Test Player ${this.id} received status:`, data);
        });

        this.socket.on('match_found', (data) => {
            console.log(`Test Player ${this.id} found match:`, data);
            // Automatically select a color
            this.selectColor();
        });

        this.socket.on('match_update', (data) => {
            console.log(`Test Player ${this.id} match update:`, data);
            // Automatically set ready if we have a color
            if (this.color && !this.ready) {
                this.setReady();
            }
        });

        this.socket.on('game_start', (data) => {
            console.log(`Test Player ${this.id} game starting:`, data);
        });
    }

    findMatch() {
        console.log(`Test Player ${this.id} searching for match`);
        this.socket.emit('find_match');
    }

    selectColor() {
        const colors = ['yellow', 'grey', 'red'];
        this.color = colors[this.id - 1]; // Assign different colors to each test player
        console.log(`Test Player ${this.id} selecting color:`, this.color);
        this.socket.emit('select_color', { color: this.color });
    }

    setReady() {
        this.ready = true;
        console.log(`Test Player ${this.id} setting ready`);
        this.socket.emit('player_ready', { ready: true });
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}

// Create and start test players
const testPlayers = [];

function startTestPlayers(count = 3) {
    console.log(`Starting ${count} test players...`);
    
    for (let i = 1; i <= count; i++) {
        const player = new TestPlayer(i);
        testPlayers.push(player);
        player.connect();
        
        // Add small delay between connections
        setTimeout(() => {
            player.findMatch();
        }, i * 1000);
    }
}

// Handle script termination
process.on('SIGINT', () => {
    console.log('Disconnecting test players...');
    testPlayers.forEach(player => player.disconnect());
    process.exit();
});

// Start the test players
startTestPlayers();

// Export for potential programmatic use
module.exports = { TestPlayer, startTestPlayers };