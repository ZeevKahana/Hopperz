import { createPopupMessage } from './GameUtils.js';

const CONSTANTS = {
    PLAYER_JUMP_VELOCITY: -880,
    JUMP_OFF_VELOCITY: -800,
    BOT_MOVE_DELAY: 1000,
    RESPAWN_DELAY: 3000,
    HITBOX_SIZE: { width: 16, height: 5 },
    WIN_SCORE: 10,
    GAME_DURATION: 3 * 60 * 1000,
    MAX_FALLING_SPEED: 1250
};

class CollisionManager {
    constructor(scene) {
        this.scene = scene;
       // this.debugText = scene.add.text(10, 10, 'Debug Info', { fontSize: '16px', fill: '#ffffff' });
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
          //  this.updateDebugText('Collision ignored: Invulnerable');
            return;
        }

        const verticalDistance = entity2.y - entity1.y;
        const horizontalDistance = Math.abs(entity1.x - entity2.x);

        // this.updateDebugText(`Collision detected:
        // Vertical Distance: ${verticalDistance.toFixed(2)}
        // Horizontal Distance: ${horizontalDistance.toFixed(2)}
        // Entity1 (${entity1 === this.scene.gameState.player ? 'Player' : 'Bot'}): y=${entity1.y.toFixed(2)}, vy=${entity1.body.velocity.y.toFixed(2)}
        // Entity2 (${entity2 === this.scene.gameState.player ? 'Player' : 'Bot'}): y=${entity2.y.toFixed(2)}, vy=${entity2.body.velocity.y.toFixed(2)}`);

        if (Math.abs(verticalDistance) < entity1.height * 0.25 && horizontalDistance < entity1.width * 0.8) {
            //this.updateDebugText('Collision ignored: Entities too close horizontally or vertically');
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
           // this.updateDebugText('Collision ignored: No clear killer/victim');
            return;
        }

      //  this.updateDebugText(`Killer: ${killer === this.scene.gameState.player ? 'Player' : 'Bot'}, Victim: ${victim === this.scene.gameState.player ? 'Player' : 'Bot'}`);

        if (victim === this.scene.gameState.player && this.scene.gameState.playerShielded) {
            this.scene.removeShield(this.scene.gameState.player);
            killer.setVelocityY(CONSTANTS.JUMP_OFF_VELOCITY);
           // this.updateDebugText('Player shield activated');
        } else if (victim === this.scene.gameState.bot && this.scene.gameState.botShielded) {
            this.scene.removeShield(this.scene.gameState.bot);
            killer.setVelocityY(CONSTANTS.JUMP_OFF_VELOCITY);
          //  this.updateDebugText('Bot shield activated');
        } else {
            this.scene.handleKill(killer, victim);
           // this.updateDebugText(`Kill handled: ${killer === this.scene.gameState.player ? 'Player' : 'Bot'} killed ${victim === this.scene.gameState.player ? 'Player' : 'Bot'}`);
        }

        this.scene.gameState.invulnerableUntil = currentTime + 300;
    }

    handleShieldCollection(character, shield) {
        const distance = Phaser.Math.Distance.Between(character.x, character.y, shield.x, shield.y);
        if (distance < 30) {
            this.scene.collectShield(character, shield);
        }
    }

   // updateDebugText(message) {
     //   this.debugText.setText(message);
    //    console.log(message);  // Also log to console for easier debugging
   // }
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
        this.music = null;
        this.musicReady = false;
        this.volumeSlider = null;
    }

    preload() {
        this.load.html('loginform', './assets/loginform.html');
        this.load.image('loginBackground', './assets/login_background.png');
        this.load.audio('loginSoundtrack', './assets/login_soundtrack.mp3');
        
        const loadingText = this.add.text(400, 300, 'Loading...', { fontSize: '32px', fill: '#fff' });
        loadingText.setOrigin(0.5);

        this.load.on('complete', () => {
            loadingText.destroy();
            this.setupMusic();
        });
    }

    create() {
        this.add.image(400, 300, 'loginBackground');

        const loginForm = this.add.dom(400, 300).createFromCache('loginform');
        loginForm.setVisible(true).setScale(1.35).setOrigin(0.5);  

        // Pre-fill email if it exists in localStorage
        const savedEmail = localStorage.getItem('userEmail');
        if (savedEmail) {
            loginForm.getChildByName('email').value = savedEmail;
            loginForm.getChildByName('remember-me').checked = true;
        }

        loginForm.addListener('click');
        loginForm.on('click', (event) => {
            if (event.target.name === 'loginButton') {
                const email = loginForm.getChildByName('email').value;
                const password = loginForm.getChildByName('password').value;
                const rememberMe = loginForm.getChildByName('remember-me').checked;
                this.login(email, password, rememberMe);
            } else if (event.target.name === 'registerButton') {
                const email = loginForm.getChildByName('email').value;
                const password = loginForm.getChildByName('password').value;
                this.register(email, password);
            }
        });

        this.game.domContainer.style.zIndex = '1';

        this.createVolumeSlider();
        this.input.on('pointerdown', () => this.handleUserInteraction());
    }

    createVolumeSlider() {
        const textX = 10;
        const textY = 10;
        const sliderX = textX + 1;
        const sliderY = textY + 25;
        const sliderWidth = 100;

        // Fetch the user's volume setting
        this.fetchVolumeSetting().then(volume => {
            const volumeText = this.add.text(textX, textY, `Volume: ${volume}`, { fontSize: '16px', fill: '#000' });

            const slider = this.add.rectangle(sliderX + sliderWidth / 2, sliderY, sliderWidth, 5, 0x000000);

            const initialSliderX = sliderX + (volume / 100 * sliderWidth);
            const sliderButton = this.add.circle(initialSliderX, sliderY, 8, 0xff0000)
                .setInteractive()
                .setDepth(1);

            this.input.setDraggable(sliderButton);

            this.input.on('drag', (pointer, gameObject, dragX) => {
                dragX = Phaser.Math.Clamp(dragX, sliderX, sliderX + sliderWidth);
                gameObject.x = dragX;
                const newVolume = Math.round((dragX - sliderX) / sliderWidth * 100);
                volumeText.setText(`Volume: ${newVolume}`);
                this.sound.setVolume(newVolume / 100);
                if (this.music) {
                    this.music.setVolume(newVolume / 100);
                }
                this.saveVolumeSetting(newVolume);
            });

            this.volumeSlider = { text: volumeText, slider: slider, button: sliderButton };
            this.sound.setVolume(volume / 100);
            if (this.music) {
                this.music.setVolume(volume / 100);
            }
        });
    }

    fetchVolumeSetting() {
        const userEmail = localStorage.getItem('userEmail');
        if (!userEmail) {
            return Promise.resolve(50); // Default volume if no user is logged in
        }
    
        return window.electronAPI.getVolume(userEmail)
            .then(data => {
                if (data.success) {
                    return data.volume;
                } else {
                    console.error('Failed to fetch volume:', data.error);
                    return 50; // Default volume if fetch fails
                }
            })
            .catch(error => {
                console.error('Error fetching volume:', error);
                return 50; // Default volume if fetch fails
            });
    }
    
    saveVolumeSetting(volume) {
        const userEmail = localStorage.getItem('userEmail');
        if (!userEmail) return; // Don't save if no user is logged in
    
        window.electronAPI.saveVolume(userEmail, volume)
            .then(data => {
                if (!data.success) {
                    console.error('Failed to save volume:', data.error);
                }
            })
            .catch(error => {
                console.error('Error saving volume:', error);
            });
    }

    setupMusic() {
        this.music = this.sound.add('loginSoundtrack', { loop: true, volume: 0.5 });
        this.musicReady = true;
    }

    handleUserInteraction() {
        this.tryPlayMusic();
    }

    tryPlayMusic() {
        if (this.musicReady && this.music && !this.music.isPlaying) {
            this.music.play();
        }
    }

    // updateDebugText(message) {
    //     if (this.debugText) {
    //         this.debugText.setText([
    //             `Music Ready: ${this.musicReady}`,
    //             `Music Playing: ${this.music ? this.music.isPlaying : 'N/A'}`,
    //             `Last Action: ${message || 'None'}`
    //         ]);
    //     }
    // }

    login(email, password, rememberMe) {
        console.log('Attempting login with:', email);
        if (!window.electronAPI || !window.electronAPI.login) {
            console.error('Electron API or login method not available');
            createPopupMessage(this, 'Login functionality is not available', () => {
                const loginForm = document.querySelector('.login-form');
                if (loginForm) {
                    loginForm.style.display = 'block';
                }
            });
            return;
        }
    
        window.electronAPI.login(email, password)
            .then(data => {
                console.log('Login response:', data);
                if (data && data.success) {
                    console.log('Login successful');
                    if (rememberMe) {
                        localStorage.setItem('userEmail', email);
                    } else {
                        localStorage.removeItem('userEmail');
                    }
                    this.stopMusic();
                    console.log('Starting MainMenu with carrot count:', data.user.carrots);
                    this.scene.start('MainMenu', { 
                        carrotCount: data.user.carrots, 
                        purchasedItems: data.user.purchasedItems 
                    });
                } else {
                    createPopupMessage(this, data.error === 'Database connection not established' 
                        ? 'Unable to connect to the server. Please try again later.' 
                        : 'Invalid email or password.', 
                    () => {
                        const loginForm = document.querySelector('.login-form');
                        if (loginForm) {
                            loginForm.style.display = 'block';
                        }
                    });
                }
            })
            .catch(error => {
                console.error('Login error:', error);
                createPopupMessage(this, 'An error occurred during login. Please try again later.', () => {
                    const loginForm = document.querySelector('.login-form');
                    if (loginForm) {
                        loginForm.style.display = 'block';
                    }
                });
            });
    }
    
    
    register(email, password) {
        console.log('Attempting registration with:', email);
        if (!window.electronAPI || !window.electronAPI.register) {
            console.error('Electron API or register method not available');
            createPopupMessage(this, 'Registration functionality is not available', () => {
                const loginForm = document.querySelector('.login-form');
                if (loginForm) {
                    loginForm.style.display = 'block';
                }
            });
            return;
        }
    
        window.electronAPI.register(email, password)
            .then(data => {
                console.log('Registration response:', data);
                if (data && data.success) {
                    createPopupMessage(this, 'Registration successful. You can now log in.', () => {
                        const loginForm = document.querySelector('.login-form');
                        if (loginForm) {
                            loginForm.style.display = 'block';
                        }
                    });
                } else {
                    createPopupMessage(this, data.error === 'Database connection not established'
                        ? 'Unable to connect to the server. Please try again later.'
                        : 'Registration failed. ' + ((data && data.error) || 'Please try again.'),
                    () => {
                        const loginForm = document.querySelector('.login-form');
                        if (loginForm) {
                            loginForm.style.display = 'block';
                        }
                    });
                }
            })
            .catch(error => {
                console.error('Registration error:', error);
                createPopupMessage(this, 'An error occurred during registration. Please try again later.', () => {
                    const loginForm = document.querySelector('.login-form');
                    if (loginForm) {
                        loginForm.style.display = 'block';
                    }
                });
            });
    }
    
    stopMusic() {
        if (this.music && this.music.isPlaying) {
            this.music.stop();
         //   this.updateDebugText("Music stopped");
        }
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
        this.selectedMap = 'desert'; 
        this.mapSelectionActive = false;
        this.selectedColor = null; 
        this.selectedDifficulty = null; 
        this.startGameButton = null; 
        this.colorButtons = [];
        this.mainMenuElements = [];
        this.selectionScreenElements = [];
        this.selectionScreenActive = false;
        this.carrotCount = 0;
        this.isShopOpen = false;
        this.purchasedItems = new Set();
    }
  
    preload() {
      this.load.image('menuBackground', 'assets/menu_background.png');
      this.load.image('startButton', 'assets/start_button.png');
      this.load.audio('menuSoundtrack', 'assets/menu_soundtrack.mp3');
      this.load.image('optionsButton', 'assets/options-button.png');
      this.load.image('mapSelectButton', 'assets/map-select-button.png');
      this.load.image('desert_preview', 'assets/desert_preview.png');
      this.load.image('city_preview', 'assets/city_preview.png');
      this.load.image('space_preview', 'assets/space_preview.png');
      this.load.image('white-standing', 'assets/rabbit/white/standing.png');
      this.load.image('yellow-standing', 'assets/rabbit/yellow/standing.png');
      this.load.image('grey-standing', 'assets/rabbit/grey/standing.png');
      this.load.image('red-standing', 'assets/rabbit/red/standing.png');
      this.load.image('blue-standing', 'assets/rabbit/blue/standing.png');
      this.load.image('purple-standing', 'assets/rabbit/purple/standing.png');
      this.load.image('carrot', 'assets/carrot.png');
      this.load.image('shopIcon', 'assets/shop.png');
    }
  
    create() {
        this.add.image(400, 300, 'menuBackground').setScale(1.28);
    
        // Start button
        this.startButton = this.add.image(402, 385, 'startButton')
            .setInteractive()
            .setScale(0.85);
        this.startButton.on('pointerdown', () => this.showSelectionScreen());
    
        // Shop button (new position)
        this.shopButton = this.add.image(223, 373, 'shopIcon')
            .setInteractive()
            .setScale(1);
        this.shopButton.on('pointerdown', () => this.toggleShop());
    
        // Options button
        this.optionsButton = this.add.image(600, 385, 'optionsButton')
            .setInteractive()
            .setScale(0.10);
        this.optionsButton.on('pointerdown', () => {
            if (!this.isOptionsOpen) {
                this.showOptionsPage();
            }
        });
    
        // Map select button
        this.mapSelectButton = this.add.image(700, 100, 'mapSelectButton')
            .setInteractive()
            .setScale(1);
        this.mapSelectButton.on('pointerdown', () => {
            if (!this.mapSelectionActive) {
                this.showMapSelection();
            }
        });
    
        // Map text
        this.mapText = this.add.text(400, 500, `Selected Map: ${this.selectedMap}`, {
            fontSize: '24px',
            fill: '#fff'
        }).setOrigin(0.5);
    
        // Carrot count display
        this.carrotIcon = this.add.image(20, 20, 'carrot').setOrigin(0, 0.5).setScale(0.5);
        this.carrotText = this.add.text(50, 20, '0', { fontSize: '24px', fill: '#fff' }).setOrigin(0, 0.5);
        
        // Initialize purchasedItems if not already done
        if (!this.purchasedItems) {
            this.purchasedItems = new Set();
        }
    
        // Check for initial data passed from login
        const initData = this.scene.settings.data;
    console.log('Received init data:', initData);
    if (initData) {
        if (initData.carrotCount !== undefined) {
            this.carrotCount = initData.carrotCount;
            this.carrotText.setText(`${this.carrotCount}`);
            console.log('Set carrot count to:', this.carrotCount);
        } else {
            console.log('No carrot count in init data');
        }
        if (initData.purchasedItems) {
            this.purchasedItems = new Set(initData.purchasedItems);
            console.log('Set purchased items:', this.purchasedItems);
        } else {
            console.log('No purchased items in init data');
        }
    } else {
        console.log('No init data, fetching carrot count');
        this.fetchCarrotCount();
    }

    // Menu soundtrack
    this.menuSoundtrack = this.sound.add('menuSoundtrack', { loop: true });
    this.playMenuSoundtrack();

    // Event listener for refreshing carrot count
    this.events.on('refreshCarrotCount', this.fetchCarrotCount, this);

    // Store main menu elements
    this.mainMenuElements = [this.startButton, this.shopButton, this.optionsButton, this.mapSelectButton, this.mapText];

    //method to be called when returning from a game
    this.events.on('wake', this.onWakeFromGame, this);

    this.loadVolumeSetting();

    // Check if we're coming back from a game and need to reset color selection
    if (this.scene.settings.data && this.scene.settings.data.lastSelectedColor) {
        this.selectedColor = this.scene.settings.data.lastSelectedColor;
        localStorage.setItem('selectedRabbitColor', this.selectedColor);
        console.log(`Color set from previous game: ${this.selectedColor}`);
    }
}

onWakeFromGame(sys, data) {
    console.log('Waking MainMenuScene, data:', data);
    if (data && data.fromGame) {
        this.resetGameSettings();
        this.showMainMenu();  // Make sure this method exists and shows the main menu
        console.log('Game settings reset after returning from game');
    }
}


    loadVolumeSetting() {
    const userEmail = localStorage.getItem('userEmail');
    if (userEmail) {
        window.electronAPI.getVolume(userEmail)
            .then(data => {
                if (data.success) {
                    const volume = data.volume;
                    this.sound.setVolume(volume / 100);
                    if (this.menuSoundtrack) {
                        this.menuSoundtrack.setVolume(volume / 100);
                    }
                } else {
                    console.error('Failed to fetch volume:', data.error);
                }
            })
            .catch(error => {
                console.error('Error fetching volume:', error);
            });
    }
    }

    startGame() {
        if (this.selectedColor && this.selectedDifficulty) {
            console.log(`Starting new game from MainMenu with color: ${this.selectedColor}, difficulty: ${this.selectedDifficulty}, map: ${this.selectedMap}`);
            
            // Start the GameScene with the selected parameters
            const gameScene = this.scene.get('GameScene');
            if (gameScene) {
                gameScene.changePlayerColor(this.selectedColor);
            }
            
            this.scene.start('GameScene', { 
                difficulty: this.selectedDifficulty, 
                map: this.selectedMap,
                rabbitColor: this.selectedColor 
            });
        } else {
            console.log('Cannot start game: color or difficulty not selected');
        }
    }  

    selectColor(color, selectedButton) {
        console.log(`Color selected in MainMenu: ${color}`);
        this.selectedColor = color;
        localStorage.setItem('selectedRabbitColor', color);
        console.log(`Color stored in localStorage: ${localStorage.getItem('selectedRabbitColor')}`);
        
        // Reset all buttons to original scale
        this.colorButtons.forEach(button => {
            button.setScale(1);
        });
        
        // Scale up the selected button
        selectedButton.setScale(1.3);
        
        this.updateStartButton();
    }
    
  
    showMainMenu() {
        console.log('Showing main menu');
        this.mainMenuElements.forEach(element => element.setVisible(true));
        this.selectionScreenActive = false;
    }

    showMapSelection() {
        this.mapSelectionActive = true;
        const maps = ['desert', 'city', 'space'];
        this.mapButtons = [];
        
        const overlay = this.add.rectangle(400, 300, 800, 600, 0x000000, 0.7);
        this.mapButtons.push(overlay);
    
        const title = this.add.text(400, 100, 'Select a Map', {
            fontSize: '32px',
            fill: '#fff'
        }).setOrigin(0.5);
        this.mapButtons.push(title);
    
        maps.forEach((map, index) => {
            const x = 200 + index * 200; // Adjust positioning for three maps
            const y = 300;
    
            const preview = this.add.image(x, y, `${map}_preview`)
                .setScale(0.4)
                .setInteractive();
            const text = this.add.text(x, y + 100, map, {
                fontSize: '24px',
                fill: '#fff'
            }).setOrigin(0.5);
    
            preview.on('pointerdown', () => this.selectMap(map));
            preview.on('pointerover', () => {
                preview.setScale(0.45);
                text.setStyle({ fill: '#ff0' });
            });
            preview.on('pointerout', () => {
                preview.setScale(0.4);
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

    showSelectionScreen() {
        console.log('Showing selection screen');
        // Clear existing selection screen elements if any
        this.hideSelectionScreen();
        // Hide main menu elements
        this.mainMenuElements.forEach(element => element.setVisible(false));
        this.selectionScreenActive = true;
        this.selectedColor = null;
        this.selectedDifficulty = null;
    
        
    
        // Add black background
        const background = this.add.rectangle(400, 300, 800, 600, 0x000000);
    
        // Add title
        const title = this.add.text(400, 100, 'Select Your Rabbit', { 
            fontSize: '32px', 
            fill: '#fff' 
        }).setOrigin(0.5);
    
        // Color selection
        const colorTitle = this.add.text(200, 150, 'Select a color', { 
            fontSize: '24px', 
            fill: '#fff' 
        }).setOrigin(0.5);
    
         // Regular colors
    const baseColors = ['white', 'yellow', 'grey', 'red'];
    baseColors.forEach((color, index) => {
        const button = this.add.image(95 + index * 70, 200, `${color}-standing`)
            .setScale(1)
            .setInteractive();

        button.on('pointerdown', () => this.selectColor(color, button));
        button.on('pointerover', () => {
            if (this.selectedColor !== color) {
                button.setScale(1.1);
            }
        });
        button.on('pointerout', () => {
            if (this.selectedColor !== color) {
                button.setScale(1);
            }
        });

        this.colorButtons.push(button);
    });

    // Purchased colors 
    const purchasedColors = [];
    if (this.purchasedItems.has('blueRabbit')) purchasedColors.push('blue');
    if (this.purchasedItems.has('purpleRabbit')) purchasedColors.push('purple');

    purchasedColors.forEach((color, index) => {
        const button = this.add.image(95 + index * 70, 270, `${color}-standing`)
            .setScale(1)
            .setInteractive();

        button.on('pointerdown', () => this.selectColor(color, button));
        button.on('pointerover', () => {
            if (this.selectedColor !== color) {
                button.setScale(1.1);
            }
        });
        button.on('pointerout', () => {
            if (this.selectedColor !== color) {
                button.setScale(1);
            }
        });

        this.colorButtons.push(button);
    });
    
        // Difficulty selection
        const difficultyTitle = this.add.text(600, 150, 'Select difficulty', { 
            fontSize: '24px', 
            fill: '#fff' 
        }).setOrigin(0.5);
    
        const difficulties = ['Easy', 'Normal', 'Hard'];
        difficulties.forEach((diff, index) => {
            const button = this.add.text(600, 200 + index * 50, diff, { 
                fontSize: '24px', 
                fill: '#fff',
                backgroundColor: '#333',
                padding: { x: 20, y: 10 }
            }).setOrigin(0.5).setInteractive();
    
            button.on('pointerdown', () => this.selectDifficulty(diff.toLowerCase(), button));
            button.on('pointerover', () => button.setStyle({ fill: '#ff0' }));
            button.on('pointerout', () => button.setStyle({ fill: '#fff' }));
    
            this.difficultyButtons.push(button);
        });
    
        // Add start game button
        this.startGameButton = this.add.text(400, 500, 'Start Game', { 
            fontSize: '28px', 
            fill: '#888',
            backgroundColor: '#333',
            padding: { x: 20, y: 10 }
        }).setOrigin(0.5).setInteractive();
    
        this.startGameButton.on('pointerdown', () => {
            if (this.selectedColor && this.selectedDifficulty) {
                this.startGame();
            }
        });
    
        this.updateStartButton();
    
        // 'X' button to close selection screen
        const closeButton = this.add.text(750, 50, 'X', { 
            fontSize: '32px', 
            fill: '#fff',
            backgroundColor: '#000',
            padding: { x: 10, y: 5 }
        })
        .setOrigin(0.5)
        .setInteractive();

        closeButton.on('pointerdown', () => this.hideSelectionScreen());
        closeButton.on('pointerover', () => closeButton.setStyle({ fill: '#ff0' }));
        closeButton.on('pointerout', () => closeButton.setStyle({ fill: '#fff' }));

        // Store selection screen elements
        this.selectionScreenElements = [
            background, title, colorTitle, difficultyTitle, closeButton,
            ...this.colorButtons, ...this.difficultyButtons, this.startGameButton
        ];
    }

    selectDifficulty(difficulty, selectedButton) {
        this.selectedDifficulty = difficulty;
        this.difficultyButtons.forEach(button => {
            button.setStyle({ backgroundColor: button === selectedButton ? '#ff0' : '#333' });
        });
        this.updateStartButton();
    }

    updateStartButton() {
        if (this.startGameButton) {
            const canStart = this.selectedColor && this.selectedDifficulty;
            this.startGameButton.setFill(canStart ? '#fff' : '#888');
            this.startGameButton.setBackgroundColor(canStart ? '#4a4' : '#333');
            console.log(`Start button updated. Can start: ${canStart}`);
        }
    }

    checkStartGame() {
        if (this.selectedColor && this.selectedDifficulty) {
            this.startGame(this.selectedDifficulty);
        }
    }

    hideSelectionScreen() {
        console.log('Hiding selection screen');
        this.selectionScreenActive = false;

        // Destroy all selection screen elements
        if (this.selectionScreenElements) {
            this.selectionScreenElements.forEach(element => {
                if (element && element.destroy) {
                    element.destroy();
                }
            });
        }

        this.colorButtons = [];
        this.difficultyButtons = [];
        this.startGameButton = null;
        this.selectionScreenElements = [];

        // Reset selections
        this.selectedColor = null;
        this.selectedDifficulty = null;

        // Show main menu
        this.showMainMenu();
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
        if (this.selectedColor && this.selectedDifficulty) {
            this.scene.start('GameScene', { 
                difficulty: this.selectedDifficulty, 
                map: this.selectedMap,
                rabbitColor: this.selectedColor 
            });
        }
    }

    resetGameSettings() {
        console.log('Starting to reset game settings');
    
        // Reset selections
        this.selectedColor = null;
        this.selectedDifficulty = null;
        console.log(`Selections reset - Color: ${this.selectedColor}, Difficulty: ${this.selectedDifficulty}`);
    
        if (this.selectionScreenActive) {
            console.log('Selection screen is active, resetting UI elements');
    
            // Reset color buttons
            this.colorButtons.forEach((button, index) => {
                if (button && button.setTint) {
                    button.setTint(0xffffff);
                    console.log(`Reset color button ${index} to white`);
                } else {
                    console.log(`Unable to reset color button ${index}`);
                }
            });
    
            // Reset difficulty buttons
            this.difficultyButtons.forEach((button, index) => {
                if (button && button.setStyle) {
                    button.setStyle({ backgroundColor: '#333' });
                    console.log(`Reset difficulty button ${index} to default style`);
                } else {
                    console.log(`Unable to reset difficulty button ${index}`);
                }
            });
    
            // Reset start game button
            if (this.startGameButton && this.startGameButton.setFill && this.startGameButton.setBackgroundColor) {
                this.startGameButton.setFill('#888');
                this.startGameButton.setBackgroundColor('#333');
                console.log('Reset start game button to inactive state');
            } else {
                console.log('Unable to reset start game button');
            }
        } else {
            console.log('Selection screen is not active, skipping UI reset');
        }
    
        // Additional resets if needed
        // For example, resetting the map selection:
        // this.selectedMap = 'default_map';
        // console.log(`Map selection reset to: ${this.selectedMap}`);
    
        // Verify final state
        console.log('Final state after reset:');
        console.log(`- Selected Color: ${this.selectedColor}`);
        console.log(`- Selected Difficulty: ${this.selectedDifficulty}`);
        console.log(`- Selection Screen Active: ${this.selectionScreenActive}`);
    
        console.log('Game settings reset complete');
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
    
        this.fetchVolumeSetting().then(currentVolume => {
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
                if (this.menuSoundtrack) {
                    this.menuSoundtrack.setVolume(volume / 100);
                }
                this.saveVolumeSetting(volume);
            });
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
    
        // Simple white 'X' close button
        const closeButton = this.add.text(550, 170, 'X', { 
            fontSize: '24px', 
            fill: '#fff' 
        })
        .setInteractive();
        optionsContainer.add(closeButton);
    
        closeButton.on('pointerdown', () => {
            optionsContainer.destroy();
            this.isOptionsOpen = false;
            this.startButton.setInteractive();
            this.optionsButton.setInteractive();
        });
    }
    
    // Make sure these methods are in your MainMenuScene
    fetchVolumeSetting() {
        const userEmail = localStorage.getItem('userEmail');
        if (!userEmail) {
            return Promise.resolve(50); // Default volume if no user is logged in
        }
    
        return window.electronAPI.getVolume(userEmail)
            .then(data => {
                if (data.success) {
                    return data.volume;
                } else {
                    console.error('Failed to fetch volume:', data.error);
                    return 50; // Default volume if fetch fails
                }
            })
            .catch(error => {
                console.error('Error fetching volume:', error);
                return 50; // Default volume if fetch fails
            });
    }
    
    saveVolumeSetting(volume) {
        const userEmail = localStorage.getItem('userEmail');
        if (!userEmail) return; // Don't save if no user is logged in
    
        window.electronAPI.saveVolume(userEmail, volume)
            .then(data => {
                if (!data.success) {
                    console.error('Failed to save volume:', data.error);
                }
            })
            .catch(error => {
                console.error('Error saving volume:', error);
            });
    }

    changeControlScheme(controlText) {
        const currentIndex = this.controlSchemes.indexOf(this.currentControlScheme);
        const newIndex = (currentIndex + 1) % this.controlSchemes.length;
        this.currentControlScheme = this.controlSchemes[newIndex];
        controlText.setText(`Controls: ${this.currentControlScheme}`);
        
        localStorage.setItem('controlScheme', this.currentControlScheme);
    }

    fetchCarrotCount() {
        const userEmail = localStorage.getItem('userEmail');
        if (userEmail) {
            if (!window.electronAPI || !window.electronAPI.getCarrotCount) {
                console.error('Electron API or getCarrotCount method not available');
                return;
            }
    
            console.log('Fetching carrot count for:', userEmail);
            window.electronAPI.getCarrotCount(userEmail)
                .then(data => {
                    console.log('Carrot count response:', data);
                    if (data && data.success) {
                        this.carrotCount = data.carrotCount;
                        this.carrotText.setText(`${this.carrotCount}`);
                        if (data.purchasedItems) {
                            this.purchasedItems = new Set(data.purchasedItems);
                        }
                    } else {
                        console.error('Failed to fetch carrot count:', data ? data.error : 'Unknown error');
                    }
                })
                .catch(error => {
                    console.error('Error fetching carrot count:', error);
                });
        }
    }
    toggleShop() {
        if (this.isShopOpen) {
            this.closeShop();
        } else {
            this.openShop();
        }
    }

    openShop() {
        this.isShopOpen = true;
    
        // Create shop container
        this.shopContainer = this.add.container(400, 300);
    
        // Add background
        const bg = this.add.rectangle(0, 0, 400, 300, 0x000000, 0.8);
        this.shopContainer.add(bg);
    
        // Add title
        const title = this.add.text(0, -130, 'Shop', { fontSize: '32px', fill: '#fff' }).setOrigin(0.5);
        this.shopContainer.add(title);
    
        // Define shop items
        const shopItems = [
            { color: 'blue', price: 100, x: -75 },
            { color: 'purple', price: 150, x: 75 }
        ];
    
        // Add shop items
        shopItems.forEach(item => {
            this.addShopItem(item);
        });
    
        // Add close button
        const closeButton = this.add.text(180, -130, 'X', { fontSize: '24px', fill: '#fff' })
            .setInteractive();
        this.shopContainer.add(closeButton);
    
        closeButton.on('pointerdown', () => this.closeShop());
    
        // Add placeholder for future scroll functionality
        // This is where you would add logic to scroll and see more colors
    }
    
    addShopItem(item) {
        let rabbitImage;
        if (this.textures.exists(`${item.color}-standing`)) {
            rabbitImage = this.add.image(item.x, -20, `${item.color}-standing`).setScale(0.8);
        } else {
            console.error(`${item.color} rabbit image not found: ${item.color}-standing`);
            rabbitImage = this.add.rectangle(item.x, -20, 40, 40, item.color === 'blue' ? 0x0000FF : 0x800080);
        }
        this.shopContainer.add(rabbitImage);
    
        if (this.purchasedItems.has(`${item.color}Rabbit`)) {
            const soldText = this.add.text(item.x, 40, 'SOLD!', { fontSize: '20px', fill: '#ff0000' }).setOrigin(0.5);
            this.shopContainer.add(soldText);
        } else {
            // Add price with carrot icon
            const priceText = this.add.text(item.x - 30, 40, item.price.toString(), { fontSize: '24px', fill: '#fff' }).setOrigin(0.5);
            this.shopContainer.add(priceText);
    
            const carrotIcon = this.add.image(item.x + 10, 40, 'carrot').setScale(0.3);
            this.shopContainer.add(carrotIcon);
    
            const buyButton = this.add.text(item.x, 80, 'Buy', { fontSize: '20px', fill: '#fff', backgroundColor: '#4a4' })
                .setOrigin(0.5)
                .setInteractive()
                .setPadding(5);
            this.shopContainer.add(buyButton);
    
            buyButton.on('pointerdown', () => this.purchaseItem(`${item.color}Rabbit`, item.price));
        }
    }

    closeShop() {
        this.isShopOpen = false;
        if (this.shopContainer) {
            this.shopContainer.destroy();
            this.shopContainer = null;
        }
    }

    purchaseItem(itemId, price) {
        window.electronAPI.purchaseItem(localStorage.getItem('userEmail'), itemId, price)
            .then(data => {
                if (data.success) {
                    this.carrotCount = data.newCarrotCount;
                    this.carrotText.setText(`${this.carrotCount}`);
                    this.purchasedItems.add(itemId);  // Mark item as purchased
                    createPopupMessage(this, 'Purchase successful!', () => {
                        this.closeShop();
                        this.openShop();  // Reopen shop to reflect changes
                    });
                } else {
                    createPopupMessage(this, 'Purchase failed: ' + data.error);
                }
            })
            .catch(error => {
                console.error('Error:', error);
                createPopupMessage(this, 'An error occurred during purchase.');
            });
    }
    
}

class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.lastTime = 0;
        this.currentMap = 'sky'; 
        this.rabbitColor = 'white';
        this.botColor = 'white';
    }

    init(data) {
        console.log('GameScene init with data:', data);
        this.cpuDifficulty = data.difficulty || 'normal';
        this.currentMap = data.map || 'sky';
    
        // Prioritize the color passed from MainMenuScene
        this.rabbitColor = data.rabbitColor || localStorage.getItem('selectedRabbitColor') || 'white';
    
        console.log(`Initializing GameScene with rabbit color: ${this.rabbitColor}`);
        console.log(`Color from localStorage: ${localStorage.getItem('selectedRabbitColor')}`);
    
        this.botColor = this.rabbitColor === 'white' ? 'yellow' : 
                    (this.rabbitColor === 'yellow' ? 'grey' : 
                    (this.rabbitColor === 'grey' ? 'red' : 'white'));

        // Ensure the color is set in localStorage
        localStorage.setItem('selectedRabbitColor', this.rabbitColor);

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
        const colors = ['white', 'yellow', 'grey', 'red', 'blue', 'purple'];
        this.load.image('desert', 'assets/desert.png');
        this.load.image('platform', 'assets/platform.png');
        this.load.image('cloud', 'assets/cloud.png');
        this.load.image('city', 'assets/city.png');
        this.load.image('space', 'assets/space.png');
        this.load.image('building1', 'assets/building1.png');
        this.load.image('building2', 'assets/building2.png');
        this.load.image('building3', 'assets/building3.png');
        this.load.image('space-platform', 'assets/space-platform.png');
        colors.forEach(color => {
            this.load.image(`rabbit-standing-${color}`, `assets/rabbit/${color}/standing.png`);
            this.load.image(`rabbit-jumpingstraight-${color}`, `assets/rabbit/${color}/jumpingstraight.png`);
            this.load.image(`rabbit-lookingright-${color}`, `assets/rabbit/${color}/lookingright.png`);
            this.load.image(`rabbit-walkingright1-${color}`, `assets/rabbit/${color}/walkingright1.png`);
            this.load.image(`rabbit-walkingright2-${color}`, `assets/rabbit/${color}/walkingright2.png`);
            this.load.image(`rabbit-jumpingright-${color}`, `assets/rabbit/${color}/jumpingright.png`);
            this.load.image(`rabbit-lookingleft-${color}`, `assets/rabbit/${color}/lookingleft.png`);
            this.load.image(`rabbit-walkingleft1-${color}`, `assets/rabbit/${color}/walkingleft1.png`);
            this.load.image(`rabbit-walkingleft2-${color}`, `assets/rabbit/${color}/walkingleft2.png`);
            this.load.image(`rabbit-jumpingleft-${color}`, `assets/rabbit/${color}/jumpingleft.png`);
        });
        this.load.image('button', 'assets/button.png');
        this.load.image('returnMenuButton', 'assets/Return-Menu-Button.png');
        this.load.audio('gameSoundtrack', 'assets/game_soundtrack.mp3');
        this.load.audio('afterGameSoundtrack', 'assets/aftergame_soundtrack.mp3');
        this.load.image('shieldPowerup', 'assets/shield-powerup.png');
        this.load.image('time_box', 'assets/time_box.png');
    }

    create() {
        console.log('Creating game elements with rabbit color:', this.rabbitColor);
        this.sound.stopAll();
    
        // Set up background based on the current map
        if (this.currentMap === 'desert') {
            this.add.image(400, 300, 'desert');
            this.createCloud();
        } else if (this.currentMap === 'city') {
            this.add.image(400, 300, 'city');
        } else if (this.currentMap === 'space') {
            this.add.image(400, 300, 'space');
        }

        // Add time box
        this.timeBox = this.add.image(400, 50, 'time_box').setScale(0.3);  // Adjust scale as needed
    
        this.createPlatforms();
        this.createPlayer();
        this.createAnimations();
        this.createBot();
        this.createUI();
        this.updatePlayerColor(this.rabbitColor);


        // Modify existing timer text
        this.gameState.timerText = this.add.text(400, 27, '03:00', { 
            fontSize: '24px', 
            fill: '#000',
            fontFamily: 'Arial',
            fontWeight: 'bold'
        }).setOrigin(0.5);

        // Remove old UI elements
        if (this.gameState.playerScoreText) this.gameState.playerScoreText.destroy();
        if (this.gameState.botScoreText) this.gameState.botScoreText.destroy();

        // Create new score texts
        this.gameState.playerScoreText = this.add.text(16, 16, 'Player Score: 0', { fontSize: '24px', fill: '#000' });
        this.gameState.botScoreText = this.add.text(16, 50, 'Bot Score: 0', { fontSize: '24px', fill: '#000' });

        if (this.currentMap === 'space') {
            this.physics.world.setBounds(0, 0, this.sys.game.config.width, Infinity);
        }
        
        this.physics.add.collider(this.gameState.player, this.gameState.platforms);
        this.physics.add.collider(this.gameState.bot, this.gameState.platforms);
    
        if (this.currentMap === 'space') {
            this.physics.add.collider(this.gameState.player, this.gameState.movingPlatforms);
            this.physics.add.collider(this.gameState.bot, this.gameState.movingPlatforms);
        }
    
        this.collisionManager = new CollisionManager(this);
        this.collisionManager.setupColliders();
        this.botAI = new BotAI(this, this.gameState.bot, this.gameState.player);
        
        this.lastTime = 0;
    
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
    
        this.loadVolumeSetting();
    
        // Initialize debug graphics
        this.debugGraphics = this.add.graphics();
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
    
            // Limit falling speed for player
            if (this.gameState.player.body.velocity.y > CONSTANTS.MAX_FALLING_SPEED) {
                this.gameState.player.setVelocityY(CONSTANTS.MAX_FALLING_SPEED);
            }
    
            // Limit falling speed for bot
            if (this.gameState.bot.body.velocity.y > CONSTANTS.MAX_FALLING_SPEED) {
                this.gameState.bot.setVelocityY(CONSTANTS.MAX_FALLING_SPEED);
            }
    
            // Apply wrapping for space map
            if (this.currentMap === 'space') {
                this.wrapEntities();
            }
        }
    
        if (this.currentMap === 'space') {
            this.handleMovingPlatforms();
        }
    
        if (!this.gameState.botDead) {
            this.botDecision(delta);
        }
    
        if (!this.gameState.botDead && !this.gameState.winText) {
            const actualDelta = this.lastTime === 0 ? delta : time - this.lastTime;
            this.botAI.update(actualDelta);
            this.lastTime = time;
        }
        // Update shield positions
        if (this.gameState.playerShielded && this.gameState.playerShieldSprite) {
            this.gameState.playerShieldSprite.setPosition(
                this.gameState.player.x, 
                this.gameState.player.y - this.gameState.player.height / 2
            );
        }
        if (this.gameState.botShielded && this.gameState.botShieldSprite) {
            this.gameState.botShieldSprite.setPosition(
                this.gameState.bot.x, 
                this.gameState.bot.y - this.gameState.bot.height / 2
            );
        }
    
        // Debugging for distances to shield power-up
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
    

    updatePlayerColor(newColor) {
        console.log(`Updating player color to: ${newColor}`);
        this.rabbitColor = newColor;
        localStorage.setItem('selectedRabbitColor', newColor);
        
        if (this.gameState.player) {
            // Store current position, velocity, and body configuration
            const currentX = this.gameState.player.x;
            const currentY = this.gameState.player.y;
            const currentVelocityX = this.gameState.player.body.velocity.x;
            const currentVelocityY = this.gameState.player.body.velocity.y;
            const currentBodyConfig = {
                width: this.gameState.player.body.width,
                height: this.gameState.player.body.height,
                offsetX: this.gameState.player.body.offset.x,
                offsetY: this.gameState.player.body.offset.y
            };
    
            // Remove existing animations
            this.anims.remove('left');
            this.anims.remove('right');
            this.anims.remove('idle');
    
            // Recreate all animations for the new color
            this.createAnimations();
    
            // Update the current texture based on the player's state
            const onGround = this.gameState.player.body.touching.down;
            const isMovingLeft = currentVelocityX < 0;
            const isMovingRight = currentVelocityX > 0;
    
            if (onGround) {
                if (isMovingLeft) {
                    this.gameState.player.play('left', true);
                } else if (isMovingRight) {
                    this.gameState.player.play('right', true);
                } else {
                    this.gameState.player.play('idle', true);
                }
            } else {
                if (isMovingLeft) {
                    this.gameState.player.setTexture(`rabbit-jumpingleft-${newColor}`);
                } else if (isMovingRight) {
                    this.gameState.player.setTexture(`rabbit-jumpingright-${newColor}`);
                } else {
                    this.gameState.player.setTexture(`rabbit-jumpingstraight-${newColor}`);
                }
            }
    
            // Reapply position, velocity, and body configuration
            this.gameState.player.setPosition(currentX, currentY);
            this.gameState.player.setVelocity(currentVelocityX, currentVelocityY);
            this.gameState.player.body.setSize(currentBodyConfig.width, currentBodyConfig.height);
            this.gameState.player.body.setOffset(currentBodyConfig.offsetX, currentBodyConfig.offsetY);
    
            console.log(`Current player texture key: ${this.gameState.player.texture.key}`);
        }
    }

    changePlayerColor(newColor) {
        console.log(`Changing player color to: ${newColor}`);
        this.rabbitColor = newColor;
        localStorage.setItem('selectedRabbitColor', newColor);
        this.updatePlayerColor(newColor);
    }

    wrapEntities() {
        const wrapObject = (obj) => {
            const height = this.sys.game.config.height;
            if (obj.y > height) {
                obj.y -= height;
                // Preserve velocity
                obj.body.velocity.y = Math.min(obj.body.velocity.y, CONSTANTS.MAX_FALLING_SPEED);
            } else if (obj.y < 0) {
                obj.y += height;
                // Preserve upward velocity
                obj.body.velocity.y = Math.max(obj.body.velocity.y, -CONSTANTS.MAX_FALLING_SPEED);
            }
        };
    
        wrapObject(this.gameState.player);
        wrapObject(this.gameState.bot);
    
        // Update hitboxes after wrapping
        this.updateHitbox(this.gameState.playerHead, this.gameState.player, -this.gameState.player.height / 2);
        this.updateHitbox(this.gameState.playerFeet, this.gameState.player, this.gameState.player.height / 2);
        this.updateHitbox(this.gameState.botHead, this.gameState.bot, -this.gameState.bot.height / 2);
        this.updateHitbox(this.gameState.botFeet, this.gameState.bot, this.gameState.bot.height / 2);
    }
    
    
    

    handleMovingPlatforms() {
        const handleEntityOnPlatform = (entity) => {
            let onMovingPlatform = false;
            this.gameState.movingPlatforms.forEach(platform => {
                if (entity.body.touching.down && Math.abs(entity.y - platform.y) <= platform.height / 2 + entity.height / 2) {
                    onMovingPlatform = true;
                    const deltaX = platform.x - platform.previousX;
                    entity.x += deltaX;
                }
            });
            return onMovingPlatform;
        };
    
        const playerOnMovingPlatform = handleEntityOnPlatform(this.gameState.player);
        const botOnMovingPlatform = handleEntityOnPlatform(this.gameState.bot);
    
        // Update platform previous positions
        this.gameState.movingPlatforms.forEach(platform => {
            platform.previousX = platform.x;
        });
    
        // Always apply wrapping, regardless of whether entities are on platforms
        this.wrapEntities();
    }
    

    createPlatforms() {
        this.gameState.platforms = this.physics.add.staticGroup();

        if (this.currentMap === 'desert') {
            this.createDesertPlatforms();
        } else if (this.currentMap === 'city') {
            this.createCityPlatforms();
        } else if (this.currentMap === 'space') {
            this.createSpacePlatforms();
        }
    }

    createDesertPlatforms() {
        // Create bottom platform (full width)
        this.createPlatform(0, 600, 800, 64, 'platform');

        // Create upper platforms
        this.createPlatform(0, 250, 200, 32, 'platform');
        this.createPlatform(300, 400, 300, 32, 'platform');
        this.createPlatform(650, 250, 150, 32, 'platform');
    }

    createCityPlatforms() {
        // Create a wide bottom platform using building3
        this.createPlatform(0, 600, 800, 64, 'building3');

        // Place building1 and building2 on top of the bottom platform
        this.createBuildingPlatform(50, 536, 'building1');
        this.createBuildingPlatform(250, 536, 'building2');
        this.createBuildingPlatform(450, 536, 'building1');
        this.createBuildingPlatform(650, 536, 'building2');

        // Create scattered higher platforms using building3
        
        
        this.createPlatform(700, 200, 100, 32, 'building3');
        this.createPlatform(300, 170, 150, 32, 'building3');
    }

    createSpacePlatforms() {
        const gameWidth = this.sys.game.config.width;
        const gameHeight = this.sys.game.config.height;
        const platformWidth = 200;
        const platformHeight = 32;
    
        // Adjust these values to keep platforms fully on screen
        const leftmostPosition = platformWidth / 2;
        const rightmostPosition = gameWidth - platformWidth / 2;
    
        // Create top platform (moving left to right)
        const topPlatform = this.gameState.platforms.create(leftmostPosition, gameHeight * 0.3, 'space-platform');
        topPlatform.setDisplaySize(platformWidth, platformHeight);
        topPlatform.refreshBody();
        topPlatform.isMoving = true;
        topPlatform.previousX = topPlatform.x;
        
        this.tweens.add({
            targets: topPlatform,
            x: rightmostPosition,
            duration: 5000,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1,
            onUpdate: () => {
                topPlatform.refreshBody();
            }
        });
    
        // Create bottom platform (moving right to left)
        const bottomPlatform = this.gameState.platforms.create(rightmostPosition, gameHeight * 0.7, 'space-platform');
        bottomPlatform.setDisplaySize(platformWidth, platformHeight);
        bottomPlatform.refreshBody();
        bottomPlatform.isMoving = true;
        bottomPlatform.previousX = bottomPlatform.x;
        
        this.tweens.add({
            targets: bottomPlatform,
            x: leftmostPosition,
            duration: 5000,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1,
            onUpdate: () => {
                bottomPlatform.refreshBody();
            }
        });
    
        // Store references to the platforms
        this.gameState.movingPlatforms = [topPlatform, bottomPlatform];
    }
    
    updateMovingPlatforms() {
        if (this.gameState.movingPlatforms) {
            this.gameState.movingPlatforms.forEach(platform => {
                platform.refreshBody();
            });
        }
    }
    
    createPlatform(x, y, width, height, texture) {
        const platform = this.gameState.platforms.create(x, y, texture);
        platform.setOrigin(0, 1);
        platform.displayWidth = width;
        platform.displayHeight = height;
        platform.refreshBody();
    }

    createBuildingPlatform(x, y, texture) {
        const building = this.add.image(x, y, texture);
        building.setOrigin(0, 1);
        
        // Adjust these values based on your building sprite dimensions
        const buildingWidth = building.width;
        const buildingHeight = building.height;
        
        // Create a thin platform just at the top of the building
        const topPlatform = this.gameState.platforms.create(x, y - buildingHeight, 'platform');
        topPlatform.setOrigin(0, 0); // Set origin to top-left corner
        topPlatform.displayWidth = buildingWidth;
        topPlatform.displayHeight = 15; // Make it as thin as possible
        topPlatform.visible = false; // Make it invisible
        topPlatform.refreshBody();

        // Offset the platform slightly to align with the visual top of the building
        topPlatform.y += 5; // Adjust this value as needed
    }

    createPlayer() {
        const spawnPoint = this.getRandomSpawnPoint();
        console.log(`Creating player with color: ${this.rabbitColor}`);

        if (!this.textures.exists(`rabbit-standing-${this.rabbitColor}`)) {
        console.error(`Standing image not found for color: ${this.rabbitColor}`);
        this.rabbitColor = 'white'; // Fallback to white if the texture doesn't exist
        }

        this.gameState.player = this.physics.add.sprite(spawnPoint.x, spawnPoint.y, `rabbit-standing-${this.rabbitColor}`)
        .setBounce(0.1)
        .setCollideWorldBounds(true);

        console.log(`Player created with texture: rabbit-standing-${this.rabbitColor}`);
        this.gameState.player.setCollideWorldBounds(true);
        this.gameState.player.body.onWorldBounds = true;

        // Adjust the physics body
        const bodyWidth = this.gameState.player.width * 0.8;
        const bodyHeight = this.gameState.player.height * 0.9; // Slightly shorter body
        const bodyOffsetX = this.gameState.player.width * 0.1;
        const bodyOffsetY = this.gameState.player.height * 0.1; // Offset from the bottom

        this.gameState.player.body.setSize(bodyWidth, bodyHeight);
        this.gameState.player.body.setOffset(bodyOffsetX, bodyOffsetY);

        // Set the origin to the bottom center of the sprite
        this.gameState.player.setOrigin(0.5, 1);
    
        // Helper function to check if an image exists
        const checkImage = (key) => {
            if (!this.textures.exists(key)) {
                console.error(`Image not found: ${key}`);
                return false;
            }
            return true;
        };
    
        // Create animations with error checking
        const leftFrames = ['lookingleft', 'walkingleft1', 'jumpingleft', 'walkingleft2']
            .map(action => {
                const key = `rabbit-${action}-${this.rabbitColor}`;
                return checkImage(key) ? { key } : null;
            })
            .filter(frame => frame !== null);
    
        if (leftFrames.length > 0) {
            this.anims.create({
                key: 'left',
                frames: leftFrames,
                frameRate: 17,
                repeat: -1
            });
        } else {
            console.error('No valid frames for left animation');
        }
    
        const rightFrames = ['lookingright', 'walkingright1', 'jumpingright', 'walkingright2']
            .map(action => {
                const key = `rabbit-${action}-${this.rabbitColor}`;
                return checkImage(key) ? { key } : null;
            })
            .filter(frame => frame !== null);
    
        if (rightFrames.length > 0) {
            this.anims.create({
                key: 'right',
                frames: rightFrames,
                frameRate: 17,
                repeat: -1
            });
        } else {
            console.error('No valid frames for right animation');
        }
    
        if (checkImage(`rabbit-standing-${this.rabbitColor}`)) {
            this.anims.create({
                key: 'idle',
                frames: [{ key: `rabbit-standing-${this.rabbitColor}` }],
                frameRate: 10,
                repeat: 0
            });
        } else {
            console.error('No valid frame for idle animation');
        }
    
        // Set up cursor keys for input
        this.gameState.cursors = this.input.keyboard.createCursorKeys();
    
        // Create hitboxes for the player
        this.gameState.playerHead = this.createHitbox(this.gameState.player, -this.gameState.player.height / 4);
        this.gameState.playerFeet = this.createHitbox(this.gameState.player, this.gameState.player.height / 4);
    }

    createAnimations() {
        console.log(`Creating animations for rabbit color: ${this.rabbitColor}`);
    
        // Left animation
        this.anims.create({
            key: 'left',
            frames: [
                { key: `rabbit-lookingleft-${this.rabbitColor}` },
                { key: `rabbit-walkingleft1-${this.rabbitColor}` },
                { key: `rabbit-walkingleft2-${this.rabbitColor}` },
                { key: `rabbit-walkingleft1-${this.rabbitColor}` }
            ],
            frameRate: 10,
            repeat: -1
        });
    
        // Right animation
        this.anims.create({
            key: 'right',
            frames: [
                { key: `rabbit-lookingright-${this.rabbitColor}` },
                { key: `rabbit-walkingright1-${this.rabbitColor}` },
                { key: `rabbit-walkingright2-${this.rabbitColor}` },
                { key: `rabbit-walkingright1-${this.rabbitColor}` }
            ],
            frameRate: 10,
            repeat: -1
        });
    
        // Idle animation
        this.anims.create({
            key: 'idle',
            frames: [{ key: `rabbit-standing-${this.rabbitColor}` }],
            frameRate: 10,
            repeat: 0
        });
    
        console.log('Animations created successfully');
    }
    

    createBot() {
        const spawnPoint = this.getRandomSpawnPoint();
        this.gameState.bot = this.physics.add.sprite(spawnPoint.x, spawnPoint.y, `rabbit-standing-${this.botColor}`)
            .setBounce(0.1)
            .setCollideWorldBounds(true);

        this.gameState.bot.setCollideWorldBounds(true);
        this.gameState.bot.body.onWorldBounds = true;
        // Ensure the bot is on the ground
        this.gameState.bot.setOrigin(0.5, 1);
    
        this.gameState.botHead = this.createHitbox(this.gameState.bot, -this.gameState.bot.height / 2);
        this.gameState.botFeet = this.createHitbox(this.gameState.bot, 0);  // Adjust to be at the bottom of the sprite

        // Create bot animations
        this.anims.create({
            key: 'botLeft',
            frames: [
                { key: `rabbit-lookingleft-${this.botColor}` },
                { key: `rabbit-lookingleft-${this.botColor}` },
                { key: `rabbit-walkingleft1-${this.botColor}` },
                { key: `rabbit-walkingleft2-${this.botColor}` },
                { key: `rabbit-walkingleft1-${this.botColor}` }
            ],
            frameRate: 10,
            repeat: -1
        });

        this.anims.create({
            key: 'botRight',
            frames: [
                { key: `rabbit-lookingright-${this.botColor}` },
                { key: `rabbit-lookingright-${this.botColor}` },
                { key: `rabbit-walkingright1-${this.botColor}` },
                { key: `rabbit-walkingright2-${this.botColor}` },
                { key: `rabbit-walkingright1-${this.botColor}` }
            ],
            frameRate: 10,
            repeat: -1
        });

        this.anims.create({
            key: 'botIdle',
            frames: [{ key: `rabbit-standing-${this.botColor}` }],
            frameRate: 10,
            repeat: 0
        });
    }

    createBotAnimations() {
        this.anims.create({
            key: 'botLeft',
            frames: [
                { key: `rabbit-lookingleft-${this.botColor}` },
                { key: `rabbit-lookingleft-${this.botColor}` },
                { key: `rabbit-walkingleft1-${this.botColor}` },
                { key: `rabbit-walkingleft2-${this.botColor}` },
                { key: `rabbit-walkingleft1-${this.botColor}` }
            ],
            frameRate: 10,
            repeat: -1
        });
    
        this.anims.create({
            key: 'botRight',
            frames: [
                { key: `rabbit-lookingright-${this.botColor}` },
                { key: `rabbit-lookingright-${this.botColor}` },
                { key: `rabbit-walkingright1-${this.botColor}` },
                { key: `rabbit-walkingright2-${this.botColor}` },
                { key: `rabbit-walkingright1-${this.botColor}` }
            ],
            frameRate: 10,
            repeat: -1
        });
    
        this.anims.create({
            key: 'botIdle',
            frames: [{ key: `rabbit-standing-${this.botColor}` }],
            frameRate: 10,
            repeat: 0
        });
    }

    getRandomSpawnPoint() {
        const gameWidth = this.sys.game.config.width;
        const gameHeight = this.sys.game.config.height;
        let x, y;
        let validPosition = false;
        let attempts = 0;
        const maxAttempts = 20; // Reduced number of attempts
    
        while (!validPosition && attempts < maxAttempts) {
            x = Phaser.Math.Between(50, gameWidth - 50);
            y = Phaser.Math.Between(50, gameHeight - 100); // Avoid spawning too close to the bottom
    
            // Check if the position is not inside any platform
            validPosition = !this.isPositionInsidePlatform(x, y);
    
            // Additional check to ensure some space above the spawn point
            if (validPosition) {
                const headroom = this.physics.overlapRect(x, y - 50, 1, 50, false, true, this.gameState.platforms);
                if (headroom.length > 0) {
                    validPosition = false; // Not enough space above, try again
                }
            }
    
            attempts++;
        }
    
        // If we couldn't find a valid position, use a semi-random elevated position
        if (!validPosition) {
            x = Phaser.Math.Between(50, gameWidth - 50);
            y = Phaser.Math.Between(50, gameHeight / 2); // Upper half of the screen
        }
    
        return { x, y };
    }
    
    isPositionInsidePlatform(x, y) {
        return this.gameState.platforms.children.entries.some(platform => {
            return x >= platform.x &&
                   x <= platform.x + platform.displayWidth &&
                   y >= platform.y - platform.displayHeight &&
                   y <= platform.y + 5; // Small tolerance below the platform
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
        this.gameState.playerScoreText = this.add.text(16, 16, 'Player Score: 0', { fontSize: '24px', fill: '#000' });
        this.gameState.botScoreText = this.add.text(16, 50, 'Bot Score: 0', { fontSize: '24px', fill: '#000' });
        // Remove the old timer text creation
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
    if (entity === this.gameState.player) {
        // For the player, adjust the Y position based on the new origin
        hitbox.setPosition(entity.x, entity.y + offsetY);
    } else {
        // For other entities (like the bot), keep the original calculation
        hitbox.setPosition(entity.x, entity.y + offsetY);
    }
}


updateTimer() {
    const remainingTime = CONSTANTS.GAME_DURATION - this.gameState.timerEvent.getElapsed();
    const minutes = Math.floor(remainingTime / 60000);
    const seconds = Math.floor((remainingTime % 60000) / 1000);
    this.gameState.timerText.setText(`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
}

    
    loadVolumeSetting() {
        const userEmail = localStorage.getItem('userEmail');
        if (userEmail) {
            window.electronAPI.getVolume(userEmail)
                .then(data => {
                    if (data.success) {
                        const volume = data.volume;
                        this.sound.setVolume(volume / 100);
                        if (this.gameState.gameSoundtrack) {
                            this.gameState.gameSoundtrack.setVolume(volume / 100);
                        }
                        if (this.gameState.afterGameSoundtrack) {
                            this.gameState.afterGameSoundtrack.setVolume(volume / 100);
                        }
                    } else {
                        console.error('Failed to fetch volume:', data.error);
                    }
                })
                .catch(error => {
                    console.error('Error fetching volume:', error);
                });
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
        const spawnPoint = this.getRandomSpawnPoint();
        entity.setPosition(spawnPoint.x, spawnPoint.y);
        entity.setVisible(true);
        entity.body.enable = true;
        entity.setVelocity(0, 0);

        if (type === 'player') {
        console.log(`Respawning player. Current color: ${this.rabbitColor}`);
        this.updatePlayerColor(this.rabbitColor);  // Force color update on respawn
        this.gameState.playerDead = false;
        } else if (type === 'bot') {
            this.gameState.botDead = false;
            entity.setTexture(`rabbit-standing-${this.botColor}`);
            this.createBotAnimations();
            if (this.gameState.botMoveEvent) {
                this.gameState.botMoveEvent.remove();
            }
            this.gameState.botMoveEvent = this.time.addEvent({
                delay: CONSTANTS.BOT_MOVE_DELAY,
                callback: this.moveBot,
                callbackScope: this,
                loop: true
            });
        } 
    }

    debugPlayerColor() {
        if (this.gameState.player) {
            console.log(`Debug - Player color: ${this.rabbitColor}`);
            console.log(`Debug - Player texture key: ${this.gameState.player.texture.key}`);
            console.log(`Debug - Player current animation: ${this.gameState.player.anims.currentAnim ? this.gameState.player.anims.currentAnim.key : 'None'}`);
        } else {
            console.log('Debug - Player object not found');
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
            bot.setTexture(`rabbit-jumping${this.botDirection}-${this.botColor}`);
        } else if (isFalling) {
            bot.setTexture(`rabbit-walking${this.botDirection}2-${this.botColor}`);
        }
    
        bot.setFlipX(false);
    }


    checkBotPosition() {
        if (this.currentMap === 'space') {
            // Implement wrapping for the space map
            if (this.gameState.bot.y > this.sys.game.config.height) {
                this.gameState.bot.y = 0;
            } else if (this.gameState.bot.y < 0) {
                this.gameState.bot.y = this.sys.game.config.height;
            }
        } else {
            // Original behavior for other maps
            if (this.gameState.bot.y > 568) {
                this.gameState.bot.setPosition(400, 100);
                this.gameState.bot.setVelocity(0, 0);
            }
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
        this.gameState.player.setVisible(false);
        this.gameState.bot.setVelocity(0, 0);
        this.gameState.bot.body.enable = false;
        this.gameState.bot.setVisible(false);
    
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
        
        // Create a container for all end-game UI elements
        this.gameState.endGameContainer = this.add.container(400, 300);
    
        // Add the win message
        const winText = this.add.text(0, -80, message, { fontSize: '32px', fill: '#fff' }).setOrigin(0.5);
        this.gameState.endGameContainer.add(winText);
    
        if (message.includes('Player Wins')) {
            // Add the carrot reward message
            const rewardText = this.add.text(0, -20, '+10', { fontSize: '28px', fill: '#FFD700' }).setOrigin(0.5);
            this.gameState.endGameContainer.add(rewardText);
    
            // Add the carrot image
            const carrotImage = this.add.image(50, -20, 'carrot').setScale(0.5);
            this.gameState.endGameContainer.add(carrotImage);
    
            // Animate the carrot reward
            this.tweens.add({
                targets: [rewardText, carrotImage],
                y: '-=20',
                alpha: { from: 0, to: 1 },
                ease: 'Power2',
                duration: 1000,
                yoyo: true,
                repeat: 0
            });
    
            // Award the carrots
            this.awardCarrots(10);
        }
        
        // Restart button
        this.gameState.restartButton = this.add.image(-100, 100, 'button').setInteractive().setScale(0.05);
        this.gameState.restartButton.on('pointerdown', () => this.restartGame());
        
        // Return to Main Menu button
        this.gameState.returnMenuButton = this.add.image(100, 100, 'returnMenuButton').setInteractive().setScale(0.15);
        this.gameState.returnMenuButton.on('pointerdown', () => this.returnToMainMenu());
        
        // Add text label for the restart button
        const restartText = this.add.text(-100, 100, 'Restart', { fontSize: '20px', fill: '#fff' }).setOrigin(0.5);
    
        // Add buttons and labels to the container
        this.gameState.endGameContainer.add([this.gameState.restartButton, this.gameState.returnMenuButton, restartText]);
    
        // Add a semi-transparent background
        const bgGraphics = this.add.graphics();
        bgGraphics.fillStyle(0x000000, 0.7);
        bgGraphics.fillRect(-400, -300, 800, 600);
        this.gameState.endGameContainer.add(bgGraphics);
        this.gameState.endGameContainer.sendToBack(bgGraphics);
    }

    awardCarrots(amount) {
        console.log('Awarding carrots:', amount);
        // Ensure amount is a valid number
        const carrotsToAdd = Number(amount);
        if (isNaN(carrotsToAdd) || !Number.isInteger(carrotsToAdd) || carrotsToAdd <= 0) {
            console.error('Invalid carrots amount:', amount);
            return;
        }
    
        const userEmail = localStorage.getItem('userEmail');
        if (!userEmail) {
            console.error('No user email found in localStorage');
            return;
        }
    
        console.log('Calling updateCarrots with:', userEmail, carrotsToAdd);
        window.electronAPI.updateCarrots(userEmail, carrotsToAdd)
            .then(data => {
                if (data.success) {
                    console.log(`Carrots updated. New count: ${data.newCarrotCount}`);
                    // Update the carrot display in your game UI here if necessary
                } else {
                    console.error('Failed to update carrots:', data.error);
                }
            })
            .catch(error => {
                console.error('Error updating carrots:', error);
            });
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
    
        // Set a slightly smaller collision body
        const hitboxSize = 200; // Adjust this value to make the hitbox smaller or larger
        this.gameState.shieldPowerup.body.setCircle(hitboxSize / 2);
        this.gameState.shieldPowerup.body.setOffset(
            (this.gameState.shieldPowerup.width - hitboxSize) / 2,
            (this.gameState.shieldPowerup.height - hitboxSize) / 2
        );
    
        this.gameState.shieldPowerup.setCollideWorldBounds(true);
        this.gameState.shieldPowerup.body.allowGravity = false; // Disable gravity
    
        // Create a yoyo tween
        this.tweens.add({
            targets: this.gameState.shieldPowerup,
            y: y + 30, // Move 30 pixels down
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
        // Get the bounds of both the character and the shield
        const characterBounds = character.getBounds();
        const shieldBounds = shield.getBounds();
    
        // Check if the bounds intersect
        const intersects = Phaser.Geom.Intersects.RectangleToRectangle(characterBounds, shieldBounds);
    
        if (intersects) {
            console.log('Character overlapping with shield');
        } else {
            console.log('No overlap detected');
        }
    
        return intersects;
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
        console.log(`Shield collected by ${character === this.gameState.player ? 'Player' : 'Bot'}`);
        
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
    
        // Clear all end-game UI elements
        if (this.gameState.endGameContainer) {
            this.gameState.endGameContainer.destroy();
            this.gameState.endGameContainer = null;
        }
    
        // Reset player and bot states
        this.gameState.playerDead = false;
        this.gameState.botDead = false;
        this.gameState.player.body.enable = true;
        this.gameState.bot.body.enable = true;
    
        // Reload the color from localStorage
        this.rabbitColor = localStorage.getItem('selectedRabbitColor') || 'white';
        console.log(`Restarting game with color: ${this.rabbitColor}`);
    
        // Update player texture and recreate animations
        this.gameState.player.setTexture(`rabbit-standing-${this.rabbitColor}`);
        this.createAnimations();
    
        // Update bot color (choose a different color from the player)
        this.botColor = this.rabbitColor === 'white' ? 'yellow' : 
                    (this.rabbitColor === 'yellow' ? 'grey' : 
                    (this.rabbitColor === 'grey' ? 'red' : 'white'));
    this.gameState.bot.setTexture(`rabbit-standing-${this.botColor}`);
    
        // Recreate bot animations
        this.createBotAnimations();
    
        // Respawn entities with the current colors
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
    
        // Make sure all game objects are visible and enabled
        this.gameState.player.setVisible(true);
        this.gameState.bot.setVisible(true);
    
        // Reset the timer text
        this.gameState.timerText.setText('Time: 03:00');
    }

    returnToMainMenu() {
        console.log('Starting return to main menu process');
        console.log(`Current rabbit color: ${this.rabbitColor}`);
    
        // Stop all ongoing game processes
        if (this.gameState.timerEvent) {
            this.gameState.timerEvent.remove();
        }
        if (this.gameState.botMoveEvent) {
            this.gameState.botMoveEvent.remove();
        }
        if (this.gameState.shieldTimer) {
            this.gameState.shieldTimer.remove();
        }
    
        // Stop all game sounds
        this.sound.stopAll();
    
        // Do NOT clear the stored rabbit color
        // localStorage.removeItem('selectedRabbitColor');
    
        // Stop this scene
        this.scene.stop();
    
        // Fetch the latest carrot count before returning to the main menu
        const userEmail = localStorage.getItem('userEmail');
        if (userEmail) {
        window.electronAPI.getCarrotCount(userEmail)
            .then(data => {
                if (data.success) {
                    this.scene.start('MainMenu', {
                        carrotCount: data.carrotCount,
                        fromGame: true,
                        lastSelectedColor: this.rabbitColor
                    });
                } else {
                    this.scene.start('MainMenu', { fromGame: true, lastSelectedColor: this.rabbitColor });
                }
            })
            .catch(error => {
                console.error('Error fetching carrot count:', error);
                this.scene.start('MainMenu', { fromGame: true, lastSelectedColor: this.rabbitColor });
            });
        } else {
        this.scene.start('MainMenu', { fromGame: true, lastSelectedColor: this.rabbitColor });
        }

        console.log('Return to main menu process completed');
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
        scale: {
            mode: Phaser.Scale.NONE,
            autoCenter: Phaser.Scale.CENTER_BOTH
        },
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
