const CONSTANTS = {
    PLAYER_JUMP_VELOCITY: -880,
    JUMP_OFF_VELOCITY: -800,
    BOT_MOVE_DELAY: 1000,
    RESPAWN_DELAY: 3000,
    HITBOX_SIZE: { width: 16, height: 5 },
    WIN_SCORE: 10,
    GAME_DURATION: 3 * 60 * 1000
};

class MainMenuScene extends Phaser.Scene {
    constructor() {
        super('MainMenu');
    }

    preload() {
        this.load.image('menuBackground', 'assets/menu_background.png');
        this.load.image('startButton', 'assets/start_button.png');
    }

    create() {
        this.add.image(400, 300, 'menuBackground')
        .setScale(1.28);

        const startButton = this.add.image(402, 385, 'startButton')
            .setInteractive()
            .setScale(0.85);

        startButton.on('pointerdown', () => {
            this.scene.start('GameScene');
        });
    }
}

class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    init() {
        this.gameState = {
            player: null,
            bot: null,
            platforms: null,
            cursors: null,
            playerScoreText: null,
            botScoreText: null,
            timerText: null,
            timerEvent: null,
            winText: null,
            restartButton: null,
            playerHead: null,
            botHead: null,
            playerFeet: null,
            botFeet: null,
            playerDead: false,
            botDead: false,
            playerScore: 0,
            botScore: 0,
            lastCollisionTime: 0,
            invulnerableUntil: 0
        };
    }
    
    preload() {
        this.load.image('sky', 'assets/sky.png');
        this.load.image('ground', 'assets/platform.png');
        this.load.image('cloud', 'assets/cloud.png');
        this.load.spritesheet('dude', 'assets/dude.png', { frameWidth: 32, frameHeight: 48 });
        this.load.image('button', 'assets/button.png');
    }

    create() {
        this.add.image(400, 300, 'sky');
        this.createPlatforms();
        this.createPlayer();
        this.createBot();
        this.createUI();
        this.createCloud();
        this.createColliders();
        this.createBotMovement();
        this.gameState.timerEvent = this.time.addEvent({ delay: CONSTANTS.GAME_DURATION, callback: this.onTimerEnd, callbackScope: this });
    }

    update() {
        if (!this.gameState.winText) { 
            this.handlePlayerMovement();
            this.updateHitboxes();
            this.checkBotPosition();
            this.updateTimer();
        }
    }

    createPlatforms() {
        this.gameState.platforms = this.physics.add.staticGroup();
        this.gameState.platforms.create(400, 568, 'ground').setScale(2).refreshBody();
        this.gameState.platforms.create(600, 400, 'ground');
        this.gameState.platforms.create(50, 250, 'ground');
        this.gameState.platforms.create(750, 220, 'ground');
    }

    createPlayer() {
        this.gameState.player = this.physics.add.sprite(100, 450, 'dude').setBounce(0.1).setCollideWorldBounds(true);
        this.anims.create({ key: 'left', frames: this.anims.generateFrameNumbers('dude', { start: 0, end: 3 }), frameRate: 10, repeat: -1 });
        this.anims.create({ key: 'turn', frames: [{ key: 'dude', frame: 4 }], frameRate: 20 });
        this.anims.create({ key: 'right', frames: this.anims.generateFrameNumbers('dude', { start: 5, end: 8 }), frameRate: 10, repeat: -1 });
        this.gameState.cursors = this.input.keyboard.createCursorKeys();
        this.gameState.playerHead = this.createHitbox(this.gameState.player, -this.gameState.player.height / 2);
        this.gameState.playerFeet = this.createHitbox(this.gameState.player, this.gameState.player.height / 2);
    }

    createBot() {
        this.gameState.bot = this.physics.add.sprite(400, 300, 'dude').setBounce(0.1).setCollideWorldBounds(true);
        this.gameState.botHead = this.createHitbox(this.gameState.bot, -this.gameState.bot.height / 2);
        this.gameState.botFeet = this.createHitbox(this.gameState.bot, this.gameState.bot.height / 2);
    }

    createHitbox(entity, offsetY) {
        const hitbox = this.physics.add.sprite(entity.x, entity.y + offsetY, null).setOrigin(0.5, 0.5);
        hitbox.body.setSize(CONSTANTS.HITBOX_SIZE.width, CONSTANTS.HITBOX_SIZE.height).allowGravity = false;
        hitbox.body.immovable = true;
        hitbox.setVisible(false);
        return hitbox;
    }

    createUI() {
        this.gameState.playerScoreText = this.add.text(16, 16, 'Player Score: 0', { fontSize: '32px', fill: '#000' });
        this.gameState.botScoreText = this.add.text(16, 50, 'Bot Score: 0', { fontSize: '32px', fill: '#000' });
        this.gameState.timerText = this.add.text(16, 84, 'Time: 03:00', { fontSize: '32px', fill: '#000' });
    }

    createCloud() {
        const cloud = this.add.image(420, 100, 'cloud').setAlpha(0.5);
        this.tweens.add({ targets: cloud, x: '-=50', ease: 'Linear', duration: 10000, repeat: -1, yoyo: true });
    }

    createColliders() {
        this.physics.add.collider(this.gameState.player, this.gameState.platforms);
        this.physics.add.collider(this.gameState.bot, this.gameState.platforms);
        this.physics.add.overlap(this.gameState.playerFeet, this.gameState.botHead, this.handleCollision, null, this);
        this.physics.add.overlap(this.gameState.botFeet, this.gameState.playerHead, this.handleCollision, null, this);
    }

    createBotMovement() {
        this.botMoveEvent = this.time.addEvent({ delay: CONSTANTS.BOT_MOVE_DELAY, callback: this.moveBot, callbackScope: this, loop: true });
    }

    handlePlayerMovement() {
        if (this.gameState.cursors.left.isDown) {
            this.gameState.player.setVelocityX(-300);
            this.gameState.player.anims.play('left', true);
        } else if (this.gameState.cursors.right.isDown) {
            this.gameState.player.setVelocityX(300);
            this.gameState.player.anims.play('right', true);
        } else {
            this.gameState.player.setVelocityX(0);
            this.gameState.player.anims.play('turn');
        }
        if (this.gameState.cursors.up.isDown && this.gameState.player.body.touching.down) {
            this.gameState.player.setVelocityY(CONSTANTS.PLAYER_JUMP_VELOCITY);
        }
    }

    updateHitboxes() {
        this.updateHitbox(this.gameState.playerHead, this.gameState.player, -this.gameState.player.height / 2);
        this.updateHitbox(this.gameState.botHead, this.gameState.bot, -this.gameState.bot.height / 2);
        this.updateHitbox(this.gameState.playerFeet, this.gameState.player, this.gameState.player.height / 2);
        this.updateHitbox(this.gameState.botFeet, this.gameState.bot, this.gameState.bot.height / 2);
    }

    updateHitbox(hitbox, entity, offsetY) {
        hitbox.setPosition(entity.x, entity.y + offsetY);
    }

    updateTimer() {
        const remainingTime = CONSTANTS.GAME_DURATION - this.gameState.timerEvent.getElapsed();
        const minutes = Math.floor(remainingTime / 60000);
        const seconds = Math.floor((remainingTime % 60000) / 1000);
        this.gameState.timerText.setText(`Time: ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
    }

    handleCollision(entity1, entity2) {
        const currentTime = this.time.now;
        if (currentTime < this.gameState.invulnerableUntil) {
            return; // Still invulnerable, ignore collision
        }

        let killer, victim;
        if (entity1 === this.gameState.playerFeet || entity2 === this.gameState.botHead) {
            killer = this.gameState.player;
            victim = this.gameState.bot;
        } else {
            killer = this.gameState.bot;
            victim = this.gameState.player;
        }

        // Check if either entity is dead
        if ((killer === this.gameState.player && this.gameState.playerDead) ||
            (killer === this.gameState.bot && this.gameState.botDead) ||
            (victim === this.gameState.player && this.gameState.playerDead) ||
            (victim === this.gameState.bot && this.gameState.botDead)) {
            return; // Ignore collision if either entity is dead
        }

        if (killer.y < victim.y) {
            this.handleKill(killer, victim);
        }
    }

    handleKill(killer, victim) {
        killer.setVelocityY(CONSTANTS.JUMP_OFF_VELOCITY);
        if (victim === this.gameState.player) {
            this.killPlayer(victim);
        } else {
            this.killBot(victim);
        }
        this.gameState.invulnerableUntil = this.time.now + 1000; // 1 second invulnerability
    }

    killBot(bot) {
        if (!this.gameState.botDead) {
            this.gameState.botDead = true;
            bot.setVisible(false);
            bot.body.enable = false;
            this.gameState.playerScore += 1;
            this.gameState.playerScoreText.setText('Player Score: ' + this.gameState.playerScore);
            this.checkWinCondition('Player');
            if (this.gameState.playerScore < CONSTANTS.WIN_SCORE) {
                this.time.addEvent({ 
                    delay: CONSTANTS.RESPAWN_DELAY, 
                    callback: () => this.respawnEntity(bot, 'bot'), 
                    callbackScope: this 
                });
            }
        }
    }

    killPlayer(player) {
        if (!this.gameState.playerDead) {
            this.gameState.playerDead = true;
            player.setVisible(false);
            player.body.enable = false;
            this.gameState.botScore += 1;
            this.gameState.botScoreText.setText('Bot Score: ' + this.gameState.botScore);
            this.checkWinCondition('Bot');
            if (this.gameState.botScore < CONSTANTS.WIN_SCORE) {
                this.time.addEvent({ 
                    delay: CONSTANTS.RESPAWN_DELAY, 
                    callback: () => this.respawnEntity(player, 'player'), 
                    callbackScope: this 
                });
            }
        }
    }

    respawnEntity(entity, type) {
        const MAX_ATTEMPTS = 20;
        let validPosition = false;
        for (let attempts = 0; attempts < MAX_ATTEMPTS; attempts++) {
            const newPosX = Phaser.Math.Between(50, 750);
            const newPosY = Phaser.Math.Between(50, 400); // Reduced spawn area to avoid bottom
            entity.setPosition(newPosX, newPosY);
            if (!this.physics.overlapRect(newPosX - 16, newPosY - 24, 32, 48, false, true, this.gameState.platforms)) {
                validPosition = true;
                break;
            }
        }
        if (!validPosition) {
            // If no valid position found, place at a predetermined safe spot
            entity.setPosition(400, 100);
        }
        entity.setVisible(true);
        entity.body.enable = true;
        entity.setVelocity(0, 0); // Ensure entity starts stationary
    }

    moveBot() {
        if (!this.gameState.botDead && !this.gameState.winText) {
            const directions = [-300, 300];
            this.gameState.bot.setVelocityX(directions[Math.floor(Math.random() * directions.length)]);
            if (Math.random() > 0.5 && this.gameState.bot.body.touching.down) {
                this.gameState.bot.setVelocityY(CONSTANTS.PLAYER_JUMP_VELOCITY);
            }
            this.gameState.bot.anims.play(this.gameState.bot.body.velocity.x < 0 ? 'left' : this.gameState.bot.body.velocity.x > 0 ? 'right' : 'turn', true);
        }
    }


    checkBotPosition() {
        if (this.gameState.bot.y > 568) {
            this.gameState.bot.setPosition(400, 100);
            this.gameState.bot.setVelocity(0, 0);
        }
    }

    checkWinCondition(winner) {
        if (this.gameState.playerScore >= CONSTANTS.WIN_SCORE || this.gameState.botScore >= CONSTANTS.WIN_SCORE) {
            const winMessage = winner === 'Player' ? 'Player Wins!' : 'Bot Wins!';
            this.showWinMessage(winMessage);
        }
    }

    onTimerEnd() {
        const winner = this.gameState.playerScore > this.gameState.botScore ? 'Player' : this.gameState.botScore > this.gameState.playerScore ? 'Bot' : 'No one';
        this.showWinMessage(`${winner} Wins! Time's Up`);
    }

    showWinMessage(message) {
        this.gameState.player.setVelocity(0, 0);
        this.gameState.player.body.enable = false;
        this.gameState.bot.setVelocity(0, 0);
        this.gameState.bot.body.enable = false;
        if (this.gameState.timerEvent) this.gameState.timerEvent.paused = true;
        this.gameState.winText = this.add.text(400, 250, message, { fontSize: '32px', fill: '#fff' }).setOrigin(0.5);
        this.gameState.restartButton = this.add.image(400, 350, 'button').setInteractive().setScale(0.05);
        this.gameState.restartButton.on('pointerdown', () => this.restartGame());
    }

    restartGame() {
        // Reset scores
        this.gameState.playerScore = 0;
        this.gameState.botScore = 0;
        this.gameState.playerScoreText.setText('Player Score: 0');
        this.gameState.botScoreText.setText('Bot Score: 0');

        // Clear win message and restart button
        if (this.gameState.winText) this.gameState.winText.destroy();
        if (this.gameState.restartButton) this.gameState.restartButton.destroy();
        this.gameState.winText = null;
        this.gameState.restartButton = null;

        // Reset player and bot states
        this.gameState.playerDead = false;
        this.gameState.botDead = false;

        // Respawn entities
        this.respawnEntity(this.gameState.player, 'player');
        this.respawnEntity(this.gameState.bot, 'bot');

        // Reset invulnerability
        this.gameState.invulnerableUntil = 0;

        // Reset and restart the timer
        if (this.gameState.timerEvent) this.gameState.timerEvent.remove();
        this.gameState.timerEvent = this.time.addEvent({ delay: CONSTANTS.GAME_DURATION, callback: this.onTimerEnd, callbackScope: this });

        // Ensure bot movement is restarted
        this.time.addEvent({ delay: CONSTANTS.BOT_MOVE_DELAY, callback: this.moveBot, callbackScope: this, loop: true });
    }
}
const config = {
    type: Phaser.AUTO, // Choose WebGL if available, otherwise use Canvas
    width: 800, // Game width
    height: 600, // Game height
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 2000 },
            debug: false // Set to true if you want to see the physics bodies
        }
    },
    scene: [MainMenuScene, GameScene], // Add all your scenes here
    parent: 'phaser-game' // The HTML element to inject the game canvas
};


// End of GameScene class

// This line should be outside of any class definition
const game = new Phaser.Game(config);
