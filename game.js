const CONSTANTS = {
    PLAYER_JUMP_VELOCITY: -880,
    JUMP_OFF_VELOCITY: -800,
    BOT_MOVE_DELAY: 1000,
    RESPAWN_DELAY: 3000,
    HITBOX_SIZE: { width: 16, height: 5 },
    WIN_SCORE: 10,
    GAME_DURATION: 3 * 60 * 1000
};


class CollisionManager {
    constructor(scene) {
        this.scene = scene;
        this.debugText = scene.add.text(10, 10, 'Debug Info', { fontSize: '16px', fill: '#ffffff' });
    }

    setupColliders() {
        const { player, bot, platforms, shieldPowerup } = this.scene.gameState;

        this.scene.physics.add.collider(player, platforms);
        this.scene.physics.add.collider(bot, platforms);

        this.scene.physics.add.overlap(player, bot, this.handleCharacterCollision, null, this);
        this.scene.physics.add.overlap(player, shieldPowerup, this.handleShieldCollection, null, this);
        this.scene.physics.add.overlap(bot, shieldPowerup, this.handleShieldCollection, null, this);
    }

    handleCharacterCollision(entity1, entity2) {
        const currentTime = this.scene.time.now;
        if (currentTime < this.scene.gameState.invulnerableUntil) {
            this.updateDebugText('Collision ignored: Invulnerable');
            return;
        }

        const verticalDistance = entity2.y - entity1.y;
        const horizontalDistance = Math.abs(entity1.x - entity2.x);

        this.updateDebugText(`Collision detected:
        Vertical Distance: ${verticalDistance.toFixed(2)}
        Horizontal Distance: ${horizontalDistance.toFixed(2)}
        Entity1 (${entity1 === this.scene.gameState.player ? 'Player' : 'Bot'}): y=${entity1.y.toFixed(2)}, vy=${entity1.body.velocity.y.toFixed(2)}
        Entity2 (${entity2 === this.scene.gameState.player ? 'Player' : 'Bot'}): y=${entity2.y.toFixed(2)}, vy=${entity2.body.velocity.y.toFixed(2)}`);

        if (Math.abs(verticalDistance) < entity1.height * 0.25 && horizontalDistance < entity1.width * 0.8) {
            this.updateDebugText('Collision ignored: Entities too close horizontally or vertically');
            return;
        }

        let killer, victim;
        if (verticalDistance > 0 && entity1.body.velocity.y >= 0) {
            killer = entity1;
            victim = entity2;
        } else if (verticalDistance < 0 && entity2.body.velocity.y >= 0) {
            killer = entity2;
            victim = entity1;
        } else {
            this.updateDebugText('Collision ignored: No clear killer/victim');
            return;
        }

        this.updateDebugText(`Killer: ${killer === this.scene.gameState.player ? 'Player' : 'Bot'}, Victim: ${victim === this.scene.gameState.player ? 'Player' : 'Bot'}`);

        if (victim === this.scene.gameState.player && this.scene.gameState.playerShielded) {
            this.scene.removeShield(this.scene.gameState.player);
            killer.setVelocityY(CONSTANTS.JUMP_OFF_VELOCITY);
            this.updateDebugText('Player shield activated');
        } else if (victim === this.scene.gameState.bot && this.scene.gameState.botShielded) {
            this.scene.removeShield(this.scene.gameState.bot);
            killer.setVelocityY(CONSTANTS.JUMP_OFF_VELOCITY);
            this.updateDebugText('Bot shield activated');
        } else {
            this.scene.handleKill(killer, victim);
            this.updateDebugText(`Kill handled: ${killer === this.scene.gameState.player ? 'Player' : 'Bot'} killed ${victim === this.scene.gameState.player ? 'Player' : 'Bot'}`);
        }

        this.scene.gameState.invulnerableUntil = currentTime + 1000;
    }

    handleShieldCollection(character, shield) {
        const distance = Phaser.Math.Distance.Between(character.x, character.y, shield.x, shield.y);
        if (distance < 30) {
            this.scene.collectShield(character, shield);
        }
    }

    updateDebugText(message) {
        this.debugText.setText(message);
        console.log(message);  // Also log to console for easier debugging
    }
}


class BotAI {
    constructor(scene, bot, player) {
        this.scene = scene;
        this.bot = bot;
        this.player = player;
        this.difficultyLevel = this.scene.cpuDifficulty || 'normal';
        this.decisionCooldown = 0;
        this.currentAction = 'idle';
        this.targetPosition = null;
    }

    update(time, delta) {
        if (this.decisionCooldown > 0) {
            this.decisionCooldown -= delta;
            this.executeCurrentAction();
            return;
        }

        this.makeDecision();
        this.executeCurrentAction();
        this.decisionCooldown = this.getDecisionCooldown();
    }

    makeDecision() {
        const playerDistance = Phaser.Math.Distance.Between(this.bot.x, this.bot.y, this.player.x, this.player.y);
        const onSamePlatform = this.isOnSamePlatform();
        const canJumpToPlayer = this.canJumpTo(this.player.x, this.player.y);
        const powerupAvailable = this.scene.gameState.shieldPowerup && this.scene.gameState.shieldPowerup.active;

        if (powerupAvailable && Math.random() < this.getPowerupChance()) {
            this.currentAction = 'getPowerup';
            this.targetPosition = { x: this.scene.gameState.shieldPowerup.x, y: this.scene.gameState.shieldPowerup.y };
        } else if (canJumpToPlayer && Math.random() < this.getAggressionChance()) {
            this.currentAction = 'jumpAttack';
            this.targetPosition = { x: this.player.x, y: this.player.y };
        } else if (onSamePlatform && playerDistance < 200) {
            if (Math.random() < 0.7) {
                this.currentAction = 'chase';
            } else {
                this.currentAction = 'retreat';
            }
        } else {
            if (Math.random() < 0.6) {
                this.currentAction = 'moveToPlayer';
            } else {
                this.currentAction = 'randomMove';
                this.targetPosition = this.getRandomPosition();
            }
        }
    }

    executeCurrentAction() {
        switch (this.currentAction) {
            case 'idle':
                this.bot.setVelocityX(0);
                break;
            case 'chase':
            case 'moveToPlayer':
                this.moveTowards(this.player.x, this.player.y);
                break;
            case 'retreat':
                this.moveAway(this.player.x, this.player.y);
                break;
            case 'jumpAttack':
                this.moveTowards(this.targetPosition.x, this.targetPosition.y);
                if (this.bot.body.touching.down) {
                    this.bot.setVelocityY(CONSTANTS.PLAYER_JUMP_VELOCITY);
                }
                break;
            case 'getPowerup':
                this.moveTowards(this.targetPosition.x, this.targetPosition.y);
                if (Math.abs(this.bot.x - this.targetPosition.x) < 10 && this.bot.body.touching.down) {
                    this.bot.setVelocityY(CONSTANTS.PLAYER_JUMP_VELOCITY);
                }
                break;
            case 'randomMove':
                this.moveTowards(this.targetPosition.x, this.targetPosition.y);
                break;
        }

        this.avoidFallingOffPlatform();
    }

    moveTowards(x, y) {
        const direction = x < this.bot.x ? -1 : 1;
        this.bot.setVelocityX(direction * 300);
        this.updateBotAnimation(direction);
    }

    moveAway(x, y) {
        const direction = x < this.bot.x ? 1 : -1;
        this.bot.setVelocityX(direction * 300);
        this.updateBotAnimation(direction);
    }

    updateBotAnimation(direction) {
        if (direction < 0) {
            this.bot.anims.play('botLeft', true);
        } else {
            this.bot.anims.play('botRight', true);
        }
    }

    avoidFallingOffPlatform() {
        if (this.bot.body.touching.down) {
            const aheadX = this.bot.x + (this.bot.body.velocity.x > 0 ? 20 : -20);
            const groundBelow = this.scene.physics.overlapRect(aheadX, this.bot.y, 5, 50, false, true, this.scene.gameState.platforms);
            
            if (!groundBelow) {
                this.bot.setVelocityX(-this.bot.body.velocity.x);
                this.updateBotAnimation(this.bot.body.velocity.x > 0 ? 1 : -1);
            }
        }
    }

    isOnSamePlatform() {
        return Math.abs(this.bot.y - this.player.y) < 10 && this.bot.body.touching.down && this.player.body.touching.down;
    }

    canJumpTo(x, y) {
        const distance = Math.abs(this.bot.x - x);
        const heightDifference = this.bot.y - y;
        return distance < 150 && heightDifference > 0 && heightDifference < 200;
    }

    getRandomPosition() {
        const x = Phaser.Math.Between(50, this.scene.sys.game.config.width - 50);
        const y = this.bot.y;
        return { x, y };
    }

    getDecisionCooldown() {
        switch (this.difficultyLevel) {
            case 'easy': return Phaser.Math.Between(500, 1000);
            case 'normal': return Phaser.Math.Between(300, 700);
            case 'hard': return Phaser.Math.Between(100, 500);
            default: return 500;
        }
    }

    getPowerupChance() {
        switch (this.difficultyLevel) {
            case 'easy': return 0.3;
            case 'normal': return 0.5;
            case 'hard': return 0.7;
            default: return 0.5;
        }
    }

    getAggressionChance() {
        switch (this.difficultyLevel) {
            case 'easy': return 0.3;
            case 'normal': return 0.5;
            case 'hard': return 0.8;
            default: return 0.5;
        }
    }
}

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
      this.difficultyButtons = [];
      this.menuSoundtrack = null;
      this.controlSchemes = ['Arrows', 'WASD'];
      this.currentControlScheme = 'Arrows';
      this.startButton = null;
      this.optionsButton = null;
      this.selectedMap = 'sky'; // Default selected map
      this.mapSelectionActive = false;
    }
  
    preload() {
      this.load.image('menuBackground', 'assets/menu_background.png');
      this.load.image('startButton', 'assets/start_button.png');
      this.load.audio('menuSoundtrack', 'assets/menu_soundtrack.mp3');
      this.load.image('optionsButton', 'assets/options-button.png');
      this.load.image('mapSelectButton', 'assets/map-select-button.png');
      // Load map preview images
      this.load.image('sky_preview', 'assets/sky_preview.png');
      this.load.image('city_preview', 'assets/city_preview.png');
    }
  
    create() {
      this.add.image(400, 300, 'menuBackground').setScale(1.28);
  
      this.startButton = this.add.image(402, 385, 'startButton')
        .setInteractive()
        .setScale(0.85);
  
      this.startButton.on('pointerdown', () => this.showDifficultySelection());
  
      this.optionsButton = this.add.image(600, 385, 'optionsButton')
        .setInteractive()
        .setScale(0.10);
  
      this.optionsButton.on('pointerdown', () => {
        if (!this.isOptionsOpen) {
          this.showOptionsPage();
        }
      });
  
      this.mapSelectButton = this.add.image(700, 100, 'mapSelectButton')
        .setInteractive()
        .setScale(1);
  
      this.mapSelectButton.on('pointerdown', () => {
        if (!this.mapSelectionActive) {
          this.showMapSelection();
        }
      });
  
      this.mapText = this.add.text(400, 500, `Selected Map: ${this.selectedMap}`, {
        fontSize: '24px',
        fill: '#fff'
      }).setOrigin(0.5);
  
      this.menuSoundtrack = this.sound.add('menuSoundtrack', { loop: true });
      this.playMenuSoundtrack();
    }
  
    showMapSelection() {
      this.mapSelectionActive = true;
      const maps = ['sky', 'city'];
      this.mapButtons = [];
      
      const overlay = this.add.rectangle(400, 300, 800, 600, 0x000000, 0.7);
      this.mapButtons.push(overlay);
  
      const title = this.add.text(400, 100, 'Select a Map', {
        fontSize: '32px',
        fill: '#fff'
      }).setOrigin(0.5);
      this.mapButtons.push(title);
  
      maps.forEach((map, index) => {
        const x = 300 + index * 200; // Position maps side by side
        const y = 300; // Centered vertically
  
        const preview = this.add.image(x, y, `${map}_preview`)
          .setScale(0.4) // Adjust scale as needed
          .setInteractive();
        const text = this.add.text(x, y + 100, map, {
          fontSize: '24px',
          fill: '#fff'
        }).setOrigin(0.5);
  
        preview.on('pointerdown', () => this.selectMap(map));
        preview.on('pointerover', () => {
          preview.setScale(0.45); // Slightly enlarge on hover
          text.setStyle({ fill: '#ff0' });
        });
        preview.on('pointerout', () => {
          preview.setScale(0.4); // Return to original size
          text.setStyle({ fill: '#fff' });
        });
  
        this.mapButtons.push(preview, text);
      });
  
      const backButton = this.add.text(400, 500, 'Back', {
        fontSize: '24px',
        fill: '#fff',
        backgroundColor: '#000',
        padding: { x: 15, y: 8 }
      }).setOrigin(0.5).setInteractive();
  
      backButton.on('pointerdown', () => this.hideMapSelection());
      backButton.on('pointerover', () => backButton.setStyle({ fill: '#ff0' }));
      backButton.on('pointerout', () => backButton.setStyle({ fill: '#fff' }));
  
      this.mapButtons.push(backButton);
    }
  
    hideMapSelection() {
      if (this.mapButtons) {
        this.mapButtons.forEach(button => button.destroy());
        this.mapButtons = null;
      }
      this.mapSelectionActive = false;
    }
  
    selectMap(map) {
      this.selectedMap = map;
      this.mapText.setText(`Selected Map: ${this.selectedMap}`);
      this.hideMapSelection();
    }

    showDifficultySelection() {
        // Hide or disable the start and options buttons
        this.children.list.forEach(child => {
            if (child instanceof Phaser.GameObjects.Image) {
                child.setVisible(false);
            }
        });

        // Create difficulty buttons
        const difficulties = ['Easy', 'Normal', 'Hard'];
        difficulties.forEach((diff, index) => {
            const button = this.add.text(400, 250 + index * 70, diff, { 
                fontSize: '32px', 
                fill: '#fff',
                backgroundColor: '#000',
                padding: { x: 20, y: 10 }
            }).setOrigin(0.5).setInteractive();

            button.on('pointerdown', () => this.startGame(diff.toLowerCase()));
            button.on('pointerover', () => button.setStyle({ fill: '#ff0' }));
            button.on('pointerout', () => button.setStyle({ fill: '#fff' }));

            this.difficultyButtons.push(button);
        });

        // Add a back button
        const backButton = this.add.text(400, 500, 'Back', { 
            fontSize: '24px', 
            fill: '#fff',
            backgroundColor: '#000',
            padding: { x: 15, y: 8 }
        }).setOrigin(0.5).setInteractive();

        backButton.on('pointerdown', () => this.hideDifficultySelection());
        backButton.on('pointerover', () => backButton.setStyle({ fill: '#ff0' }));
        backButton.on('pointerout', () => backButton.setStyle({ fill: '#fff' }));

        this.difficultyButtons.push(backButton);
    }

    hideDifficultySelection() {
        // Show the start and options buttons again
        this.children.list.forEach(child => {
            if (child instanceof Phaser.GameObjects.Image) {
                child.setVisible(true);
            }
        });

        // Remove difficulty buttons
        this.difficultyButtons.forEach(button => button.destroy());
        this.difficultyButtons = [];
    }

    playMenuSoundtrack() {
        if (this.menuSoundtrack && !this.menuSoundtrack.isPlaying) {
            this.menuSoundtrack.play();
        }
    }

    stopMenuSoundtrack() {
        if (this.menuSoundtrack && this.menuSoundtrack.isPlaying) {
            this.menuSoundtrack.stop();
        }
    }

    startGame(difficulty) {
        this.stopMenuSoundtrack();
        this.scene.start('GameScene', { difficulty: difficulty, map: this.selectedMap });
    }

    showOptionsPage() {
        if (this.isOptionsOpen) return;
        this.isOptionsOpen = true;
    
        this.startButton.disableInteractive();
        this.optionsButton.disableInteractive();
    
        const optionsContainer = this.add.container(0, 0);
    
        const bg = this.add.rectangle(400, 300, 400, 300, 0x000000, 0.7);
        optionsContainer.add(bg);
    
        const title = this.add.text(400, 200, 'Options', { fontSize: '32px', fill: '#fff' }).setOrigin(0.5);
        optionsContainer.add(title);
    
        const currentVolume = Math.round(this.sound.volume * 100);
    
        const volumeText = this.add.text(250, 250, `Volume: ${currentVolume}`, { fontSize: '24px', fill: '#fff' });
        optionsContainer.add(volumeText);
    
        const slider = this.add.rectangle(400, 300, 200, 10, 0xffffff);
        optionsContainer.add(slider);
    
        const initialSliderX = 300 + (currentVolume * 2);
        const sliderButton = this.add.circle(initialSliderX, 300, 15, 0xff0000)
            .setInteractive()
            .setDepth(1);
        optionsContainer.add(sliderButton);
    
        this.input.setDraggable(sliderButton);
    
        this.input.on('drag', (pointer, gameObject, dragX) => {
            dragX = Phaser.Math.Clamp(dragX, 300, 500);
            gameObject.x = dragX;
            const volume = Math.round((dragX - 300) / 2);
            volumeText.setText(`Volume: ${volume}`);
            this.sound.setVolume(volume / 100);
        });
    
        // Create an interactive text for control scheme selection
        const controlText = this.add.text(400, 365, `Controls: ${this.currentControlScheme}`, { 
            fontSize: '24px', 
            fill: '#fff',
            backgroundColor: '#333',
            padding: { x: 10, y: 5 }
        }).setOrigin(0.5).setInteractive();
        optionsContainer.add(controlText);
    
        controlText.on('pointerdown', () => {
            this.changeControlScheme(controlText);
        });
    
        const closeButton = this.add.text(550, 170, 'X', { fontSize: '24px', fill: '#fff' })
            .setInteractive();
        optionsContainer.add(closeButton);
    
        closeButton.on('pointerdown', () => {
            optionsContainer.destroy();
            this.isOptionsOpen = false;
            this.startButton.setInteractive();
            this.optionsButton.setInteractive();
        });
    }

    changeControlScheme(controlText) {
        const currentIndex = this.controlSchemes.indexOf(this.currentControlScheme);
        const newIndex = (currentIndex + 1) % this.controlSchemes.length;
        this.currentControlScheme = this.controlSchemes[newIndex];
        controlText.setText(`Controls: ${this.currentControlScheme}`);
        
        localStorage.setItem('controlScheme', this.currentControlScheme);
    }
}

class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.lastTime = 0;
        this.currentMap = 'sky'; 
    }

    init(data) {
        if (data && data.difficulty) {
            this.cpuDifficulty = data.difficulty;
        }
        this.currentMap = data.map || 'sky'; 
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
        this.load.image('platform', 'assets/platform.png');
        this.load.image('cloud', 'assets/cloud.png');
        this.load.image('city', 'assets/city.png');
        this.load.image('building', 'assets/building3.png');
        this.load.image('sky_preview', 'assets/sky_preview.png');
        this.load.image('city_preview', 'assets/city_preview.png');
        this.load.image('rabbit-standing', 'assets/rabbit/white/standing.png');
        this.load.image('rabbit-jumpingstraight', 'assets/rabbit/white/jumpingstraight.png');
        this.load.image('rabbit-lookingright', 'assets/rabbit/white/lookingright.png');
        this.load.image('rabbit-walkingright1', 'assets/rabbit/white/walkingright1.png');
        this.load.image('rabbit-walkingright2', 'assets/rabbit/white/walkingright2.png');
        this.load.image('rabbit-jumpingright', 'assets/rabbit/white/jumpingright.png');
        this.load.image('rabbit-lookingleft', 'assets/rabbit//white/lookingleft.png');
        this.load.image('rabbit-walkingleft1', 'assets/rabbit/white/walkingleft1.png');
        this.load.image('rabbit-walkingleft2', 'assets/rabbit/white/walkingleft2.png');
        this.load.image('rabbit-jumpingleft', 'assets/rabbit/white/jumpingleft.png');
        this.load.image('button', 'assets/button.png');
        this.load.image('returnMenuButton', 'assets/Return-Menu-Button.png');
        this.load.audio('gameSoundtrack', 'assets/game_soundtrack.mp3');
        this.load.audio('afterGameSoundtrack', 'assets/aftergame_soundtrack.mp3');
        this.load.image('shieldPowerup', 'assets/shield-powerup.png');
    }

    create() {
        this.sound.stopAll();
        
        // Set background based on the selected map
        if (this.currentMap === 'sky') {
            this.add.image(400, 300, 'sky');
        } else if (this.currentMap === 'city') {
            this.add.image(400, 300, 'city');
        }
        
        this.createPlatforms();
        this.createPlayer();
        this.createBot();
        this.createUI();
        
        // Only create cloud for sky map
        if (this.currentMap === 'sky') {
            this.createCloud();
        }
        
        this.collisionManager = new CollisionManager(this);
        this.collisionManager.setupColliders();
        this.botAI = new BotAI(this, this.gameState.bot, this.gameState.player);
        this.lastTime = 0;
        this.gameState.player.setSize(this.gameState.player.width * 0.8, this.gameState.player.height);
        this.gameState.player.setOffset(this.gameState.player.width * 0.1, 0);


        console.log("Raycaster plugin:", this.raycasterPlugin);

        if (this.gameState.botMoveEvent) {
            this.gameState.botMoveEvent.remove();
        }
        
        if (this.raycasterPlugin) {
            this.raycaster = this.raycasterPlugin.createRaycaster();
            this.ray = this.raycaster.createRay();
            console.log("Raycaster created:", this.raycaster);
            console.log("Ray created:", this.ray);

            // Add platforms to raycaster
            this.gameState.platforms.children.entries.forEach(platform => {
                this.raycaster.mapGameObjects(platform, false);
            });
        } else {
            console.error("Raycaster plugin not found!");
        }
        // Apply the same adjustment to the bot
        this.gameState.bot.setSize(this.gameState.bot.width * 0.8, this.gameState.bot.height);
        this.gameState.bot.setOffset(this.gameState.bot.width * 0.1, 0);
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

        this.anims.create({
            key: 'botLeft',
            frames: [
                { key: 'rabbit-lookingleft' },
                { key: 'rabbit-lookingleft' },
                { key: 'rabbit-walkingleft1' },
                { key: 'rabbit-walkingleft2' },
                { key: 'rabbit-walkingleft1' }
            ],
            frameRate: 10,
            repeat: -1
        });

        this.anims.create({
            key: 'botRight',
            frames: [
                { key: 'rabbit-lookingright' },
                { key: 'rabbit-lookingright' },
                { key: 'rabbit-walkingright1' },
                { key: 'rabbit-walkingright2' },
                { key: 'rabbit-walkingright1' }
            ],
            frameRate: 10,
            repeat: -1
        });
    }

    update(time, delta) {
        if (!this.gameState.winText) { 
            this.handlePlayerMovement();
            this.updateBotAnimation();
            this.updateHitboxes();
            this.checkBotPosition();
            this.updateTimer();
            this.botShieldStrategy();
            this.botDecision();
    
            // Keep player within screen boundaries
            this.gameState.player.x = Phaser.Math.Clamp(this.gameState.player.x, 
                this.gameState.player.width / 2, 
                this.sys.game.config.width - this.gameState.player.width / 2);
    
            // Keep bot within screen boundaries
            this.gameState.bot.x = Phaser.Math.Clamp(this.gameState.bot.x, 
                this.gameState.bot.width / 2, 
                this.sys.game.config.width - this.gameState.bot.width / 2);
        }

        if (!this.gameState.botDead && !this.gameState.winText) {
            const actualDelta = this.lastTime === 0 ? delta : time - this.lastTime;
            this.botAI.update(actualDelta);
            this.lastTime = time;
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

        const platformTexture = this.currentMap === 'sky' ? 'platform' : 'building';

        // Create bottom platform (full width)
        this.createPlatform(0, 600, 800, 64, platformTexture);

        // Create upper platforms
        this.createPlatform(0, 250, 200, 32, platformTexture);
        this.createPlatform(300, 400, 300, 32, platformTexture);
        this.createPlatform(650, 250, 150, 32, platformTexture);
    }

    createPlatform(x, y, width, height, texture) {
        const platform = this.gameState.platforms.create(x, y, texture);
        platform.setOrigin(0, 1);
        platform.displayWidth = width;
        platform.displayHeight = height;
        platform.refreshBody();
    }

    createPlayer() {
        const spawnPoint = this.getRandomSpawnPoint();
        this.gameState.player = this.physics.add.sprite(spawnPoint.x, spawnPoint.y, 'rabbit-standing')
            .setBounce(0.1)
            .setCollideWorldBounds(true);
    

            this.gameState.player.setCollideWorldBounds(true);
            this.gameState.player.body.onWorldBounds = true;

        // Create animations
        this.anims.create({
            key: 'left',
            frames: [
                { key: 'rabbit-lookingleft' },
                { key: 'rabbit-lookingleft' },
                { key: 'rabbit-walkingleft1' },
                { key: 'rabbit-jumpingleft' },
                { key: 'rabbit-walkingleft2' },
                { key: 'rabbit-lookingleft' }
            ],
            frameRate: 17,
            repeat: -1
        });
    
        this.anims.create({
            key: 'right',
            frames: [
                { key: 'rabbit-lookingright' },
                { key: 'rabbit-lookingright' },
                { key: 'rabbit-walkingright1' },
                { key: 'rabbit-jumpingright' },
                { key: 'rabbit-walkingright2' },
                { key: 'rabbit-lookingright' }
            ],
            frameRate: 17,
            repeat: -1
        });
    
        this.anims.create({
            key: 'idle',
            frames: [{ key: 'rabbit-standing' }],
            frameRate: 10,
            repeat: 0
            
        });
    
        // Set up cursor keys for input
        this.gameState.cursors = this.input.keyboard.createCursorKeys();
    
        // Create hitboxes for the player
        this.gameState.playerHead = this.createHitbox(this.gameState.player, -this.gameState.player.height / 4);
        this.gameState.playerFeet = this.createHitbox(this.gameState.player, this.gameState.player.height / 4);
    }

    createBot() {
        const spawnPoint = this.getRandomSpawnPoint();
        this.gameState.bot = this.physics.add.sprite(spawnPoint.x, spawnPoint.y, 'rabbit-standing')
            .setBounce(0.1)
            .setCollideWorldBounds(true);

            this.gameState.bot.setCollideWorldBounds(true);
            this.gameState.bot.body.onWorldBounds = true;
        // Ensure the bot is on the ground
        this.gameState.bot.setOrigin(0.5, 1);
    
        this.gameState.botHead = this.createHitbox(this.gameState.bot, -this.gameState.bot.height / 2);
        this.gameState.botFeet = this.createHitbox(this.gameState.bot, 0);  // Adjust to be at the bottom of the sprite
    }

    getRandomSpawnPoint() {
        const gameWidth = this.sys.game.config.width;
        const gameHeight = this.sys.game.config.height;
        let x, y;
        let validPosition = false;

        while (!validPosition) {
            x = Phaser.Math.Between(50, gameWidth - 50);
            y = Phaser.Math.Between(50, gameHeight - 50);

            // Check if the position is not inside any platform
            validPosition = !this.isPositionInsidePlatform(x, y);
        }

        return { x, y };
    }

    isPositionInsidePlatform(x, y) {
        return this.gameState.platforms.children.entries.some(platform => {
            return x >= platform.x && 
                   x <= platform.x + platform.displayWidth &&
                   y >= platform.y - platform.displayHeight &&
                   y <= platform.y;
        });
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

    

    createBotMovement() {
        this.botDirection = 'right';
        this.botMoveDuration = 0;
        this.botMoveTimer = 0;
        this.botIsMoving = false;
        
        
        switch (this.cpuDifficulty) {
            case 'easy':
                this.botReactionTime = 1000;
                this.botJumpProbability = 0.4;
                this.botPowerupPriority = 0.6;
                break;
            case 'normal':
                this.botReactionTime = 750;
                this.botJumpProbability = 0.6;
                this.botPowerupPriority = 0.7;
                break;
            case 'hard':
                this.botReactionTime = 500;
                this.botJumpProbability = 0.8;
                this.botPowerupPriority = 0.8;
                break;
            default:
                // ... default values ...
        }
    
            this.botDecisionEvent = this.time.addEvent({
                delay: this.botReactionTime,
                callback: this.botDecision,
                callbackScope: this,
                loop: true
            });
        }

        botDecision() {
            if (this.gameState.botDead || this.gameState.winText) return;
        
            const bot = this.gameState.bot;
            const player = this.gameState.player;
            const powerup = this.gameState.shieldPowerup;
        
            // Determine if the bot and player are on different platforms
            const botPlatform = this.getCurrentPlatform(bot);
            const playerPlatform = this.getCurrentPlatform(player);
            const onDifferentPlatforms = botPlatform !== playerPlatform;
        
            // Determine priorities
            const canJumpOnPlayer = this.canJumpOnTarget(bot, player);
            const isPowerupAvailable = powerup && powerup.active;
            const canReachPowerup = isPowerupAvailable && this.canReachTarget(bot, powerup);
        
            // Decision making
            if (onDifferentPlatforms) {
                this.moveTowardsPlatform(playerPlatform);
            } else if (canJumpOnPlayer) {
                this.moveToJumpOnPlayer();
            } else if (canReachPowerup) {
                this.moveToPowerup();
            } else {
                this.moveTowardsPlayer();
            }
        
            // Jump if needed, but not constantly
            if (bot.body.touching.down && this.shouldJump()) {
                bot.setVelocityY(CONSTANTS.PLAYER_JUMP_VELOCITY);
            }
        
            this.avoidFallingOffPlatform();
        }

        getCurrentPlatform(entity) {
            for (let platform of this.gameState.platforms.children.entries) {
                if (entity.y + entity.height <= platform.y && 
                    entity.x >= platform.x && 
                    entity.x <= platform.x + platform.width) {
                    return platform;
                }
            }
            return null; // Entity is not on any platform
        }

        handlePlayerMovement() {
            const onGround = this.gameState.player.body.touching.down;
            const isJumping = !onGround && this.gameState.player.body.velocity.y < 0;
            const isFalling = !onGround && this.gameState.player.body.velocity.y > 0;
            const atRightEdge = this.gameState.player.x >= this.sys.game.config.width - this.gameState.player.width / 2;
            const atLeftEdge = this.gameState.player.x <= this.gameState.player.width / 2;
        
            // Get the saved control scheme
            const controlScheme = localStorage.getItem('controlScheme') || 'Arrows';
        
            // Define key mappings based on the control scheme
            let leftKey, rightKey, upKey;
            switch (controlScheme) {
                case 'WASD':
                    leftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
                    rightKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
                    upKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
                    break;
                default: // 'Arrows'
                    leftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
                    rightKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
                    upKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
            }
        
            // Use the defined keys for movement
            if (leftKey.isDown && !atLeftEdge) {
                this.gameState.player.setVelocityX(-300);
                this.gameState.player.anims.play('left', true);
            } else if (rightKey.isDown && !atRightEdge) {
                this.gameState.player.setVelocityX(300);
                this.gameState.player.anims.play('right', true);
            } else {
                this.gameState.player.setVelocityX(0);
                this.gameState.player.anims.play('idle', true);
            }
        
            if (upKey.isDown && onGround) {
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
        const spawnPoint = this.getRandomSpawnPoint();
        entity.setPosition(spawnPoint.x, spawnPoint.y);
        entity.setVisible(true);
        entity.body.enable = true;
        entity.setVelocity(0, 0);

        if (type === 'bot') {
            this.gameState.botDead = false;
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
        if (this.gameState.botDead || this.gameState.winText) return;
    
        const bot = this.gameState.bot;
        const player = this.gameState.player;
        const powerup = this.gameState.shieldPowerup;
    
        // Determine priorities
        const canJumpOnPlayer = this.canJumpOnTarget(bot, player);
        const isPowerupAvailable = powerup && powerup.active;
        const canReachPowerup = isPowerupAvailable && this.canReachTarget(bot, powerup);
    
        let targetX;
        if (canJumpOnPlayer && Math.random() < this.botJumpProbability) {
            targetX = player.x;
        } else if (canReachPowerup && Math.random() < this.botPowerupPriority) {
            targetX = powerup.x;
        } else {
            targetX = player.x;
        }
    
        // Smooth movement towards target
        const direction = targetX < bot.x ? -1 : 1;
        const targetVelocity = direction * 300;
        bot.setVelocityX(bot.body.velocity.x + (targetVelocity - bot.body.velocity.x) * 0.1);
    
        this.botDirection = direction === -1 ? 'left' : 'right';
    
        // Jump if needed
        if (bot.body.touching.down && this.shouldJump()) {
            bot.setVelocityY(CONSTANTS.PLAYER_JUMP_VELOCITY);
        }
    
        this.avoidFallingOffPlatform();
        this.updateBotAnimation();
    }

    moveTowardsPlayer() {
        const bot = this.gameState.bot;
        const player = this.gameState.player;
        const direction = player.x < bot.x ? -1 : 1;
        bot.setVelocityX(direction * 300);
        this.botDirection = direction === -1 ? 'left' : 'right';
    }

    moveToPowerup() {
        const bot = this.gameState.bot;
        const powerup = this.gameState.shieldPowerup;
        if (powerup && powerup.active) {
            const direction = powerup.x < bot.x ? -1 : 1;
            bot.setVelocityX(direction * 300);
            this.botDirection = direction === -1 ? 'left' : 'right';
    
            // If the powerup is above the bot, make it jump
            if (powerup.y < bot.y - 50 && bot.body.touching.down) {
                bot.setVelocityY(CONSTANTS.PLAYER_JUMP_VELOCITY);
            }
        }
    }

    moveTowardsPlatform(targetPlatform) {
        if (!targetPlatform) return;
    
        const bot = this.gameState.bot;
        const direction = targetPlatform.x + targetPlatform.width / 2 < bot.x ? -1 : 1;
        bot.setVelocityX(direction * 300);
        this.botDirection = direction === -1 ? 'left' : 'right';
    }

    canJumpOnTarget(jumper, target) {
        const heightDifference = jumper.y - target.y;
        const horizontalDistance = Math.abs(jumper.x - target.x);
        return heightDifference > 50 && heightDifference < 200 && horizontalDistance < 100;
    }

    canReachTarget(entity, target) {
        const distance = Phaser.Math.Distance.Between(entity.x, entity.y, target.x, target.y);
        return distance < 200; // Adjust this value based on your game's scale
    }

    moveToJumpOnPlayer() {
        const bot = this.gameState.bot;
        const player = this.gameState.player;
        const direction = player.x < bot.x ? -1 : 1;
        bot.setVelocityX(direction * 300);
        this.botDirection = direction === -1 ? 'left' : 'right';
    }

    moveRandomly() {
        const directions = [-1, 1];
        const newDirection = directions[Math.floor(Math.random() * directions.length)];
        this.botDirection = newDirection === -1 ? 'left' : 'right';
        this.gameState.bot.setVelocityX(newDirection * 300);
    }

    isPlatformAbove(entity) {
        // Use raycasting if available, otherwise use the previous implementation
        if (this.ray) {
            this.ray.setOrigin(entity.x, entity.y - entity.height / 2);
            this.ray.setAngle(-90);
            const intersection = this.ray.cast();
            return intersection && intersection.distance < 100;
        } else {
            const platforms = this.gameState.platforms.children.entries;
            for (let platform of platforms) {
                if (platform.y < entity.y && 
                    Math.abs(platform.x - entity.x) < platform.width / 2 &&
                    entity.y - platform.y < 100) {
                    return true;
                }
            }
            return false;
        }
    }

    avoidFallingOffPlatform() {
        const bot = this.gameState.bot;
        if (bot.body.touching.down) {
            const aheadX = bot.x + (bot.body.velocity.x > 0 ? 20 : -20);
            const groundBelow = this.physics.overlapRect(aheadX, bot.y, 5, 50, false, true, this.gameState.platforms);
            
            if (!groundBelow) {
                bot.setVelocityX(-bot.body.velocity.x);
                this.botDirection = this.botDirection === 'left' ? 'right' : 'left';
            }
        }
    }

    shouldJump() {
        const bot = this.gameState.bot;
        const player = this.gameState.player;
        const powerup = this.gameState.shieldPowerup;
    
        // Jump if player is directly above and close
        if (player.y < bot.y - 50 && Math.abs(player.x - bot.x) < 50) {
            return true;
        }
    
        // Jump if powerup is above and close
        if (powerup && powerup.active && powerup.y < bot.y - 50 && Math.abs(powerup.x - bot.x) < 50) {
            return true;
        }
    
        // Jump if there's a platform slightly above and ahead in the direction of movement
        const aheadX = bot.x + (this.botDirection === 'right' ? 50 : -50);
        const platformAbove = this.physics.overlapRect(aheadX, bot.y - 100, 10, 100, false, true, this.gameState.platforms);
        if (platformAbove) {
            return true;
        }
    
        // Random jumps, but less frequent
        return Math.random() < this.botJumpProbability * 0.3;
    }

    botShieldStrategy() {
        if (!this.gameState.botShielded) return;
    
        const bot = this.gameState.bot;
        const player = this.gameState.player;
    
        // If the player is above and close, keep the shield
        if (player.y < bot.y && Phaser.Math.Distance.Between(bot.x, bot.y, player.x, player.y) < 100) {
            return;
        }
    
        // Otherwise, consider removing the shield to collect another powerup
        if (this.gameState.shieldPowerup && this.gameState.shieldPowerup.active) {
            const distanceToPowerup = Phaser.Math.Distance.Between(
                bot.x, bot.y, 
                this.gameState.shieldPowerup.x, this.gameState.shieldPowerup.y
            );
            if (distanceToPowerup < 150) {
                this.removeShield(bot);
            }
        }
    }

    updateBotAnimation() {
        const bot = this.gameState.bot;
        const onGround = bot.body.touching.down;
        const isJumping = !onGround && bot.body.velocity.y < 0;
        const isFalling = !onGround && bot.body.velocity.y > 0;
        
        if (onGround) {
            if (Math.abs(bot.body.velocity.x) > 10) {
                bot.anims.play(this.botDirection === 'left' ? 'botLeft' : 'botRight', true);
            } else {
                bot.anims.play('botIdle', true);
            }
        } else if (isJumping) {
            bot.setTexture(`rabbit-jumping${this.botDirection}`);
        } else if (isFalling) {
            bot.setTexture(`rabbit-walking${this.botDirection}2`);
        }
    
        bot.setFlipX(false);
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
        
        // Stop the shield spawn timer
        if (this.gameState.shieldTimer) {
            this.gameState.shieldTimer.remove();
        }
    
        // Destroy any existing shield powerups
        if (this.gameState.shieldPowerup) {
            this.gameState.shieldPowerup.destroy();
        }
        
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
        this.gameState.shieldPowerup.setScale(0.15); // Adjust scale as needed
        
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
            y: y + 30, // Move 50 pixels down
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
    
        // If character already has a shield, just destroy the powerup
        if ((character === this.gameState.player && this.gameState.playerShielded) ||
            (character === this.gameState.bot && this.gameState.botShielded)) {
            shield.destroy();
            return;
        }
    
        // If we reach here, the character doesn't have a shield
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
        this.gameState.player.body.enable = true;
        this.gameState.bot.body.enable = true;
    
        // Respawn entities
        this.respawnEntity(this.gameState.player, 'player');
        this.respawnEntity(this.gameState.bot, 'bot');
    
        // Reset invulnerability
        this.gameState.invulnerableUntil = 0;
    
        // Reset and restart the timer
        if (this.gameState.timerEvent) this.gameState.timerEvent.remove();
        this.gameState.timerEvent = this.time.addEvent({ delay: CONSTANTS.GAME_DURATION, callback: this.onTimerEnd, callbackScope: this });
    
        // Restart shield timer
        if (this.gameState.shieldTimer) this.gameState.shieldTimer.remove();
        this.gameState.shieldTimer = this.time.addEvent({
            delay: 30000,
            callback: this.spawnShieldPowerup,
            callbackScope: this,
            loop: true
        });
    
        // Ensure bot movement is restarted
        this.createBotMovement();
    
        // Remove any existing shields
        if (this.gameState.playerShieldSprite) {
            this.gameState.playerShieldSprite.destroy();
            this.gameState.playerShielded = false;
        }
        if (this.gameState.botShieldSprite) {
            this.gameState.botShieldSprite.destroy();
            this.gameState.botShielded = false;
        }
    
        // Ensure the score is reset in the game state
        this.gameState.playerScore = 0;
        this.gameState.botScore = 0;
    
        // Update the score display
        this.gameState.playerScoreText.setText('Player Score: 0');
        this.gameState.botScoreText.setText('Bot Score: 0');
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
        backgroundColor: '#000000',
        plugins: {
            scene: [
                {
                    key: 'PhaserRaycaster',
                    plugin: PhaserRaycaster,
                    mapping: 'raycasterPlugin'
                }
            ]
        }
    };
    
    const game = new Phaser.Game(config);

    // Initialize sound after user interaction
    document.addEventListener('click', function() {
        if (game.sound && game.sound.context && game.sound.context.state === 'suspended') {
            game.sound.context.resume();
        }
    }, false);
}
