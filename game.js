const CONSTANTS = {
    PLAYER_JUMP_VELOCITY: -880,
    JUMP_OFF_VELOCITY: -800,
    BOT_MOVE_DELAY: 1000,
    RESPAWN_DELAY: 3000,
    HITBOX_SIZE: { width: 16, height: 5 },
    WIN_SCORE: 10,
    GAME_DURATION: 3 * 60 * 1000
};


class LoginScene extends Phaser.Scene {
    constructor() {
        super('LoginScene');
        this.users = [];
        this.music = null;
        this.musicReady = false;
        this.debugText = null;
        this.audioEnabled = true;
    }

    preload() {
        this.load.html('loginform', 'assets/loginform.html');
        this.load.image('loginBackground', 'assets/login_background.png');
        this.load.audio('loginSoundtrack', 'assets/login_soundtrack.mp3');
        
        const loadingText = this.add.text(400, 300, 'Loading...', { fontSize: '32px', fill: '#fff' });
        loadingText.setOrigin(0.5);

        this.load.on('complete', () => {
            loadingText.destroy();
            this.setupMusic();
        });
    }

    create() {
        this.loadUsers();
        this.add.image(400, 300, 'loginBackground');

        const loginForm = this.add.dom(400, 300).createFromCache('loginform');
        loginForm.setVisible(true).setScale(1.35).setOrigin(0.5);  

        loginForm.addListener('click');
        loginForm.on('click', (event) => {
            if (event.target.name === 'loginButton') {
                this.login(loginForm.getChildByName('email').value, loginForm.getChildByName('password').value);
            } else if (event.target.name === 'registerButton') {
                this.register(loginForm.getChildByName('email').value, loginForm.getChildByName('password').value);
            } else if (event.target.name === 'deleteButton') {
                this.deleteUser(loginForm.getChildByName('email').value);
            }
        });

        this.updateUserList();

        this.createAudioToggle();

        this.debugText = this.add.text(10, 40, 'Debug Info', { fontSize: '16px', fill: '#fff' });
        this.updateDebugText();

        // Add listener for any click on the game
        this.input.on('pointerdown', () => this.handleUserInteraction());
    }

    createAudioToggle() {
        const toggleText = this.audioEnabled ? 'Disable Audio' : 'Enable Audio';
        this.audioToggle = this.add.text(10, 10, toggleText, { 
            fontSize: '18px', 
            fill: '#fff', 
            backgroundColor: '#333', 
            padding: { x: 10, y: 5 } 
        })
        .setInteractive();

        this.audioToggle.on('pointerdown', () => {
            this.toggleAudio();
        });
    }

    setupMusic() {
        this.music = this.sound.add('loginSoundtrack', { loop: true, volume: 0.5 });
        this.musicReady = true;
        this.updateDebugText("Music setup complete");
    }

    handleUserInteraction() {
        this.tryPlayMusic();
    }

    tryPlayMusic() {
        if (this.musicReady && this.audioEnabled && this.music && !this.music.isPlaying) {
            this.music.play();
            this.updateDebugText("Music started playing");
        } else if (!this.musicReady) {
            this.updateDebugText("Music not ready yet");
        } else if (!this.audioEnabled) {
            this.updateDebugText("Audio is disabled");
        } else if (this.music && this.music.isPlaying) {
            this.updateDebugText("Music is already playing");
        }
    }

    stopMusic() {
        if (this.music && this.music.isPlaying) {
            this.music.stop();
            this.updateDebugText("Music stopped");
        }
    }

    toggleAudio() {
        this.audioEnabled = !this.audioEnabled;
        this.audioToggle.setText(this.audioEnabled ? 'Disable Audio' : 'Enable Audio');
        if (this.audioEnabled) {
            this.tryPlayMusic();
        } else {
            this.stopMusic();
        }
        this.updateDebugText(`Audio ${this.audioEnabled ? 'enabled' : 'disabled'}`);
    }

    updateDebugText(message) {
        if (this.debugText) {
            this.debugText.setText([
                `Music Ready: ${this.musicReady}`,
                `Music Playing: ${this.music ? this.music.isPlaying : 'N/A'}`,
                `Audio Enabled: ${this.audioEnabled}`,
                `Last Action: ${message || 'None'}`
            ]);
        }
    }

    loadUsers() {
        const savedUsers = localStorage.getItem('users');
        this.users = savedUsers ? JSON.parse(savedUsers) : [];
    }

    saveUsers() {
        localStorage.setItem('users', JSON.stringify(this.users));
    }

    login(email, password) {
        // Email validation regex
        const emailRegex = /\S+@\S+\.\S+/;
        
        // Validate email
        if (!emailRegex.test(email)) {
            alert('Invalid email format. Please use a valid email address.');
            return;
        }

        const user = this.users.find(u => u.email === email && u.password === password);
        if (user) {
            console.log('Login successful');
            this.stopMusic();  // Stop the music before changing scenes
            this.scene.start('MainMenu');
        } else {
            alert('Invalid email or password.');
        }
    }

    stopMusic() {
        if (this.music && this.music.isPlaying) {
            this.music.stop();
            this.updateDebugText("Music stopped");
        }
    }

    register(email, password) {
        // Email validation regex
        const emailRegex = /\S+@\S+\.\S+/;
        
        // Validate email
        if (!emailRegex.test(email)) {
            alert('Invalid email format. Please use a valid email address.');
            return;
        }

        // Validate password length
        if (password.length < 6) {
            alert('Password must be at least 6 characters long.');
            return;
        }

        // Check if user already exists
        if (this.users.some(u => u.email === email)) {
            alert('User already exists.');
            return;
        }

        // If all validations pass, register the user
        this.users.push({ email, password });
        this.saveUsers(); // Assuming you have a method to save users to localStorage
        alert('Registration successful. You can now log in.');
        this.updateUserList(); // Update the displayed user list
    }

    deleteUser(email) {
        const index = this.users.findIndex(u => u.email === email);
        if (index !== -1) {
            this.users.splice(index, 1);
            this.saveUsers();
            alert('User deleted successfully.');
            this.updateUserList();
        } else {
            alert('User not found.');
        }
    }

    updateUserList() {
        // Remove existing user list if it exists
        if (this.userList) {
            this.userList.destroy();
        }

        // Create a new user list
        let userListText = 'Registered Users:\n';
        this.users.forEach(user => {
            userListText += `${user.email}\n`;
        });

        this.userList = this.add.text(10, 50, userListText, { fontSize: '16px', fill: '#fff' });
    }
}


class MainMenuScene extends Phaser.Scene {
    constructor() {
        super('MainMenu');
        this.isOptionsOpen = false;
    }

    preload() {
        this.load.image('menuBackground', 'assets/menu_background.png');
        this.load.image('startButton', 'assets/start_button.png');
        this.load.audio('menuSoundtrack', 'assets/menu_soundtrack.mp3');
        this.load.image('optionsButton', 'assets/options-button.png');
    }

    create() {
        this.add.image(400, 300, 'menuBackground').setScale(1.28);

        const startButton = this.add.image(402, 385, 'startButton')
            .setInteractive()
            .setScale(0.85);

        startButton.on('pointerdown', () => {
            this.sound.stopAll();
            this.scene.start('GameScene');
        });
        const optionsButton = this.add.image(600, 385, 'optionsButton')
             .setInteractive()
             .setScale(0.10);

        optionsButton.on('pointerdown', () => {
            if (!this.isOptionsOpen) {
                this.showOptionsPage();
            }
        });
        this.sound.play('menuSoundtrack', { loop: true });
    }

    showOptionsPage() {
        if (this.isOptionsOpen) return;
        this.isOptionsOpen = true;
    
        // Create a container to hold all options elements
        const optionsContainer = this.add.container(0, 0);
    
        // Create a semi-transparent background
        const bg = this.add.rectangle(400, 300, 400, 300, 0x000000, 0.7);
        optionsContainer.add(bg);
    
        // Add a title
        const title = this.add.text(400, 200, 'Options', { fontSize: '32px', fill: '#fff' }).setOrigin(0.5);
        optionsContainer.add(title);
    
        // Get the current volume (assuming it's between 0 and 1)
        const currentVolume = Math.round(this.sound.volume * 100);
    
        // Add volume text
        const volumeText = this.add.text(250, 250, `Volume: ${currentVolume}`, { fontSize: '24px', fill: '#fff' });
        optionsContainer.add(volumeText);
    
        // Add volume slider
        const slider = this.add.rectangle(400, 300, 200, 10, 0xffffff);
        optionsContainer.add(slider);
    
        // Calculate initial slider button position based on current volume
        const initialSliderX = 300 + (currentVolume * 2);
        const sliderButton = this.add.circle(initialSliderX, 300, 15, 0xff0000)
            .setInteractive()
            .setDepth(1);
        optionsContainer.add(sliderButton);
    
        // Make the slider button draggable
        this.input.setDraggable(sliderButton);
    
        this.input.on('drag', (pointer, gameObject, dragX) => {
            dragX = Phaser.Math.Clamp(dragX, 300, 500);
            gameObject.x = dragX;
            const volume = Math.round((dragX - 300) / 2);
            volumeText.setText(`Volume: ${volume}`);
            this.sound.setVolume(volume / 100);
        });
    
        // Add a close button
        const closeButton = this.add.text(550, 170, 'X', { fontSize: '24px', fill: '#fff' })
            .setInteractive();
        optionsContainer.add(closeButton);
    
        closeButton.on('pointerdown', () => {
            optionsContainer.destroy();
            this.isOptionsOpen = false;
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
            invulnerableUntil: 0,
            botMoveEvent: null,
            gameSoundtrack: null,
            afterGameSoundtrack: null,
            shieldPowerup: null,
            shieldTimer: null,
            playerShielded: false,
            botShielded: false
        };
    }
    
    preload() {
        this.load.image('sky', 'assets/sky.png');
        this.load.image('ground', 'assets/platform.png');
        this.load.image('cloud', 'assets/cloud.png');
        this.load.spritesheet('dude', 'assets/dude.png', { frameWidth: 32, frameHeight: 48 });
        this.load.image('button', 'assets/button.png');
        this.load.image('returnMenuButton', 'assets/Return-Menu-Button.png');
        this.load.audio('gameSoundtrack', 'assets/game_soundtrack.mp3');
        this.load.audio('afterGameSoundtrack', 'assets/aftergame_soundtrack.mp3');
        this.load.image('shieldPowerup', 'assets/shield-powerup.png');
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
        this.gameState.gameSoundtrack = this.sound.add('gameSoundtrack', { loop: true });
        this.gameState.gameSoundtrack.play();
        this.gameState.afterGameSoundtrack = this.sound.add('afterGameSoundtrack', { loop: true });
        this.gameState.shieldTimer = this.time.addEvent({
            delay: 30000,
            callback: this.spawnShieldPowerup,
            callbackScope: this,
            loop: true
        });
    
        //this.spawnShieldPowerup(); // Spawn first shield immediately
    }

    update() {
        if (!this.gameState.winText) { 
            this.handlePlayerMovement();
            this.updateHitboxes();
            this.checkBotPosition();
            this.updateTimer();
        }
        if (this.gameState.playerShielded && this.gameState.playerShieldSprite) {
            this.gameState.playerShieldSprite.setPosition(this.gameState.player.x, this.gameState.player.y);
        }
        if (this.gameState.botShielded && this.gameState.botShieldSprite) {
            this.gameState.botShieldSprite.setPosition(this.gameState.bot.x, this.gameState.bot.y);
        }
        if (this.gameState.shieldPowerup && this.gameState.shieldPowerup.active) {
            const distToPlayer = Phaser.Math.Distance.Between(
                this.gameState.player.x, this.gameState.player.y,
                this.gameState.shieldPowerup.x, this.gameState.shieldPowerup.y
            );
            const distToBot = Phaser.Math.Distance.Between(
                this.gameState.bot.x, this.gameState.bot.y,
                this.gameState.shieldPowerup.x, this.gameState.shieldPowerup.y
            );
            console.log(`Distance to Player: ${distToPlayer.toFixed(2)}, Distance to Bot: ${distToBot.toFixed(2)}`);
        }
        if (this.gameState.shieldPowerup && this.gameState.shieldPowerup.active) {
            const isOverlapping = Phaser.Geom.Intersects.RectangleToRectangle(
                this.gameState.player.getBounds(),
                this.gameState.shieldPowerup.getBounds()
            );
            if (isOverlapping) {
                console.log('Player is overlapping with shield');
            }
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
        this.gameState.botMoveEvent = this.time.addEvent({
            delay: CONSTANTS.BOT_MOVE_DELAY,
            callback: this.moveBot,
            callbackScope: this,
            loop: true
        });
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
            console.log('Collision ignored due to invulnerability');
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
    
        console.log(`Collision detected. Killer: ${killer === this.gameState.player ? 'Player' : 'Bot'}, Victim: ${victim === this.gameState.player ? 'Player' : 'Bot'}`);
        console.log(`Player shielded: ${this.gameState.playerShielded}, Bot shielded: ${this.gameState.botShielded}`);
    
        // Check if either entity is dead
        if ((killer === this.gameState.player && this.gameState.playerDead) ||
            (killer === this.gameState.bot && this.gameState.botDead) ||
            (victim === this.gameState.player && this.gameState.playerDead) ||
            (victim === this.gameState.bot && this.gameState.botDead)) {
            console.log('Collision ignored due to dead entity');
            return; // Ignore collision if either entity is dead
        }
    
        if (killer.y < victim.y) {
            if (victim === this.gameState.player && this.gameState.playerShielded) {
                console.log('Player shield activated');
                // Player is shielded, remove shield and bounce
                this.removeShield(this.gameState.player);
                killer.setVelocityY(CONSTANTS.JUMP_OFF_VELOCITY);
                // Add a brief invulnerability period after shield is removed
                this.gameState.invulnerableUntil = currentTime + 150; // 150ms invulnerability
                return; // Exit the method to prevent further processing
            } else if (victim === this.gameState.bot && this.gameState.botShielded) {
                console.log('Bot shield activated');
                // Bot is shielded, remove shield and bounce
                this.removeShield(this.gameState.bot);
                killer.setVelocityY(CONSTANTS.JUMP_OFF_VELOCITY);
                // Add a brief invulnerability period after shield is removed
                this.gameState.invulnerableUntil = currentTime + 150; // 150ms invulnerability
                return; // Exit the method to prevent further processing
            }
            
            // If we reach here, the victim is not shielded
            console.log('No shield, handling kill');
            this.handleKill(killer, victim);
        }
    }
    
    removeShield(character) {
        console.log(`Removing shield from ${character === this.gameState.player ? 'Player' : 'Bot'}`);
        if (character === this.gameState.player) {
            this.gameState.playerShielded = false;
            if (this.gameState.playerShieldSprite) {
                this.gameState.playerShieldSprite.destroy();
                this.gameState.playerShieldSprite = null;
            }
        } else {
            this.gameState.botShielded = false;
            if (this.gameState.botShieldSprite) {
                this.gameState.botShieldSprite.destroy();
                this.gameState.botShieldSprite = null;
            }
        }
        console.log(`Shield removed. Player shielded: ${this.gameState.playerShielded}, Bot shielded: ${this.gameState.botShielded}`);
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
            if (this.gameState.botMoveEvent) {
                this.gameState.botMoveEvent.remove();
                this.gameState.botMoveEvent = null;
            }
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
        let newPosX, newPosY;
    
        for (let attempts = 0; attempts < MAX_ATTEMPTS; attempts++) {
            newPosX = Phaser.Math.Between(50, 750);
            newPosY = Phaser.Math.Between(50, 550);
    
            // Check if the new position overlaps with any platform
            let overlapping = false;
            this.gameState.platforms.children.entries.forEach((platform) => {
                if (Phaser.Geom.Intersects.RectangleToRectangle(
                    new Phaser.Geom.Rectangle(newPosX - 16, newPosY - 24, 32, 48),
                    platform.getBounds()
                )) {
                    overlapping = true;
                }
            });
    
            if (!overlapping) {
                validPosition = true;
                break;
            }
        }
    
        if (!validPosition) {
            // If no valid position found, place at a predetermined safe spot
            newPosX = 400;
            newPosY = 100;
        }
    
        entity.setPosition(newPosX, newPosY);
        entity.setVisible(true);
        entity.body.enable = true;
        entity.setVelocity(0, 0); // Ensure entity starts stationary
    
        if (type === 'bot') {
            this.gameState.botDead = false;
            // Immediately move the bot
            this.moveBot();
            // Restart bot movement loop
            if (this.gameState.botMoveEvent) {
                this.gameState.botMoveEvent.remove();
            }
            this.gameState.botMoveEvent = this.time.addEvent({
                delay: CONSTANTS.BOT_MOVE_DELAY,
                callback: this.moveBot,
                callbackScope: this,
                loop: true
            });
        } else if (type === 'player') {
            this.gameState.playerDead = false;
        }
    }

    moveBot() {
        if (!this.gameState.botDead && !this.gameState.winText) {
            const directions = [-300, 300];
            const newVelocityX = directions[Math.floor(Math.random() * directions.length)];
            this.gameState.bot.setVelocityX(newVelocityX);
    
            // Only jump if the bot is on the ground
            if (Math.random() > 0.5 && this.gameState.bot.body.touching.down) {
                this.gameState.bot.setVelocityY(CONSTANTS.PLAYER_JUMP_VELOCITY);
            }
    
            // Update animation based on movement
            if (newVelocityX < 0) {
                this.gameState.bot.anims.play('left', true);
            } else if (newVelocityX > 0) {
                this.gameState.bot.anims.play('right', true);
            } else {
                this.gameState.bot.anims.play('turn', true);
            }
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
        
        // Stop game soundtrack and play after-game soundtrack
        this.gameState.gameSoundtrack.stop();
        this.gameState.afterGameSoundtrack.play();
        
        this.gameState.winText = this.add.text(400, 250, message, { fontSize: '32px', fill: '#fff' }).setOrigin(0.5);
        
        // Restart button
        this.gameState.restartButton = this.add.image(300, 430, 'button').setInteractive().setScale(0.05);
        this.gameState.restartButton.on('pointerdown', () => this.restartGame());
        
        // Return to Main Menu button
        this.gameState.returnMenuButton = this.add.image(500, 430, 'returnMenuButton').setInteractive().setScale(0.15);
        this.gameState.returnMenuButton.on('pointerdown', () => this.returnToMainMenu());
        
        // Add text labels for the buttons
        this.add.text(300, 430, 'Restart', { fontSize: '20px', fill: '#fff' }).setOrigin(0.5);
    }

    spawnShieldPowerup() {
        if (this.gameState.shieldPowerup) {
            this.gameState.shieldPowerup.destroy();
        }
    
        let x, y;
        let validPosition = false;
        const powerupSize = 32; // Adjust this value based on your shield powerup size
    
        while (!validPosition) {
            x = Phaser.Math.Between(powerupSize, this.sys.game.config.width - powerupSize);
            y = Phaser.Math.Between(100, 300); // Spawn in the upper part of the screen
    
            // Check if the position is not overlapping with any platform
            validPosition = !this.isOverlappingPlatform(x, y, powerupSize);
        }
    
        this.gameState.shieldPowerup = this.physics.add.sprite(x, y, 'shieldPowerup');
        this.gameState.shieldPowerup.setScale(0.17); // Adjust scale as needed
        
        // Set a smaller circular collision body
        const collisionRadius = powerupSize / 4; // Decreased collision radius
        this.gameState.shieldPowerup.body.setCircle(collisionRadius, 
            (this.gameState.shieldPowerup.width - collisionRadius * 2) / 2, 
            (this.gameState.shieldPowerup.height - collisionRadius * 2) / 2);
        
        this.gameState.shieldPowerup.setCollideWorldBounds(true);
        this.gameState.shieldPowerup.body.allowGravity = false; // Disable gravity
    
        // Create a yoyo tween
        this.tweens.add({
            targets: this.gameState.shieldPowerup,
            y: y + 50, // Move 50 pixels down
            duration: 1000,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1 // Repeat indefinitely
        });
    
        // Use overlap for collision detection
        this.physics.add.overlap(this.gameState.player, this.gameState.shieldPowerup, this.collectShield, this.checkShieldProximity, this);
        this.physics.add.overlap(this.gameState.bot, this.gameState.shieldPowerup, this.collectShield, this.checkShieldProximity, this);
    
        console.log(`Shield powerup spawned at x: ${x}, y: ${y}`);
    }

    checkShieldProximity(character, shield) {
        const distance = Phaser.Math.Distance.Between(character.x, character.y, shield.x, shield.y);
        console.log(`Distance to shield: ${distance.toFixed(2)}`);
        return distance < 25; // Adjust this value as needed for precise collection
    }
    
    
    checkShieldCollision(character, shield) {
        const characterBounds = character.getBounds();
        const shieldBounds = shield.getBounds();
    
        if (Phaser.Geom.Intersects.RectangleToRectangle(characterBounds, shieldBounds)) {
            const intersection = Phaser.Geom.Intersects.GetRectangleIntersection(characterBounds, shieldBounds);
            if (intersection.width > 5 && intersection.height > 5) { // Adjust these values for desired precision
                this.collectShield(character, shield);
            }
        }
    }
    
    isOverlappingPlatform(x, y, size) {
        const testRect = new Phaser.Geom.Rectangle(x - size/2, y - size/2, size, size);
        return this.gameState.platforms.children.entries.some(platform => 
            Phaser.Geom.Intersects.RectangleToRectangle(testRect, platform.getBounds())
        );
    }

    collectShield(character, shield) {
    console.log(`Collision detected between character and shield`);
    console.log(`Character position: x: ${character.x}, y: ${character.y}`);
    console.log(`Shield position: x: ${shield.x}, y: ${shield.y}`);

    // Check if the character already has a shield
    if ((character === this.gameState.player && this.gameState.playerShielded) ||
        (character === this.gameState.bot && this.gameState.botShielded)) {
        console.log(`${character === this.gameState.player ? 'Player' : 'Bot'} already has a shield. Not collecting.`);
        return; // Don't collect if already shielded
    }

    shield.destroy();
    
    const shieldSprite = this.add.image(character.x, character.y, 'shieldPowerup');
    shieldSprite.setScale(0.17);
    shieldSprite.setAlpha(0.4);
    
    if (character === this.gameState.player) {
        this.gameState.playerShielded = true;
        this.gameState.playerShieldSprite = shieldSprite;
        console.log('Shield collected by Player');
    } else {
        this.gameState.botShielded = true;
        this.gameState.botShieldSprite = shieldSprite;
        console.log('Shield collected by Bot');
    }
}

    restartGame() {
        // Stop after-game soundtrack and replay game soundtrack
        this.gameState.afterGameSoundtrack.stop();
        this.gameState.gameSoundtrack.play();
    
        // Reset scores
        this.gameState.playerScore = 0;
        this.gameState.botScore = 0;
        this.gameState.playerScoreText.setText('Player Score: 0');
        this.gameState.botScoreText.setText('Bot Score: 0');
    
        // Clear win message and buttons
        if (this.gameState.winText) this.gameState.winText.destroy();
        if (this.gameState.restartButton) this.gameState.restartButton.destroy();
        if (this.gameState.returnMenuButton) this.gameState.returnMenuButton.destroy();
        this.gameState.winText = null;
        this.gameState.restartButton = null;
        this.gameState.returnMenuButton = null;
    
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
        this.createBotMovement();
    }

    returnToMainMenu() {
        // Stop any ongoing game processes
        if (this.gameState.timerEvent) this.gameState.timerEvent.remove();
        if (this.gameState.botMoveEvent) this.gameState.botMoveEvent.remove();
        

        // Stop all game sounds
        this.sound.stopAll();
        // Reset game state
        this.gameState.playerScore = 0;
        this.gameState.botScore = 0;
        this.gameState.playerDead = false;
        this.gameState.botDead = false;
        this.gameState.invulnerableUntil = 0;
        
        // Remove any existing game objects
        if (this.gameState.winText) this.gameState.winText.destroy();
        if (this.gameState.restartButton) this.gameState.restartButton.destroy();
        if (this.gameState.returnMenuButton) this.gameState.returnMenuButton.destroy();
        
        // Switch to the MainMenu scene
        this.scene.start('MainMenu');
    }

    
}
window.onload = function() {
    const config = {
        type: Phaser.AUTO,
        width: 800,
        height: 600,
        parent: 'phaser-game',
        dom: {
            createContainer: true
        },
        physics: {
            default: 'arcade',
            arcade: {
                gravity: { y: 2000 },
                debug: false
            }
        },
        scene: [LoginScene, MainMenuScene, GameScene],
        audio: {
            disableWebAudio: true
        },
        render: {
            pixelArt: false,
            antialias: true
        },
        backgroundColor: '#000000'
    };

    const game = new Phaser.Game(config);

    // Initialize sound after user interaction
    document.addEventListener('click', function() {
        if (game.sound && game.sound.context && game.sound.context.state === 'suspended') {
            game.sound.context.resume();
        }
    }, false);
}
