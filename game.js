import { createPopupMessage } from './GameUtils.js';

const CONSTANTS = {
    PLAYER_JUMP_VELOCITY: -880,
    JUMP_OFF_VELOCITY: -800,
    BOT_MOVE_DELAY: 1000,
    RESPAWN_DELAY: 3000,
    HITBOX_SIZE: { width: 25, height: 5 },
    WIN_SCORE: 10,
    GAME_DURATION: 3 * 60 * 1000,
    MAX_FALLING_SPEED: 1250
};

class BotAI {
    constructor(scene, bots, player) {
        this.scene = scene;
    this.bots = bots;
    this.player = player;
    this.difficultyLevel = this.scene.cpuDifficulty || 'normal';
    this.decisionCooldowns = new Array(this.scene.numberOfBots).fill(0);
    this.currentActions = new Array(this.scene.numberOfBots).fill('idle');
    this.targetPositions = new Array(this.scene.numberOfBots).fill(null);
    }

    update(time, delta) {
        this.bots.forEach((bot, index) => {
            if (!bot || !bot.active) return;

            if (this.decisionCooldowns[index] > 0) {
                this.decisionCooldowns[index] -= delta;
                this.executeCurrentAction(bot, index);
                return;
            }

            this.makeDecision(bot, index);
            this.executeCurrentAction(bot, index);
            this.decisionCooldowns[index] = this.getDecisionCooldown();
        });
    }

    makeDecision(bot, index) {
        const nearestTarget = this.getNearestTarget(bot);
        if (!nearestTarget) return;

        const targetDistance = Phaser.Math.Distance.Between(bot.x, bot.y, nearestTarget.x, nearestTarget.y);
        const onSamePlatform = this.isOnSamePlatform(bot, nearestTarget);
        const canJumpToTarget = this.canJumpTo(bot, nearestTarget.x, nearestTarget.y);
        const powerupAvailable = this.scene.gameState.shieldPowerup && this.scene.gameState.shieldPowerup.active;

        if (powerupAvailable && Math.random() < this.getPowerupChance()) {
            this.currentActions[index] = 'getPowerup';
            this.targetPositions[index] = { x: this.scene.gameState.shieldPowerup.x, y: this.scene.gameState.shieldPowerup.y };
        } else if (canJumpToTarget && Math.random() < this.getAggressionChance()) {
            this.currentActions[index] = 'jumpAttack';
            this.targetPositions[index] = { x: nearestTarget.x, y: nearestTarget.y };
        } else if (onSamePlatform && targetDistance < 200) {
            this.currentActions[index] = Math.random() < 0.7 ? 'chase' : 'retreat';
        } else {
            this.currentActions[index] = Math.random() < 0.6 ? 'moveToTarget' : 'randomMove';
            if (this.currentActions[index] === 'randomMove') {
                this.targetPositions[index] = this.getRandomPosition(bot);
            }
        }
    }

    getNearestTarget(bot) {
        const targets = [this.player, ...this.bots.filter(b => b !== bot)];
        return targets.reduce((nearest, target) => {
            if (!target || !target.active) return nearest;
            const distance = Phaser.Math.Distance.Between(bot.x, bot.y, target.x, target.y);
            return (!nearest || distance < nearest.distance) ? { target, distance } : nearest;
        }, null)?.target;
    }

    executeCurrentAction(bot, index) {
        if (!bot || !bot.active) return;

        const nearestTarget = this.getNearestTarget(bot);
        if (!nearestTarget) return;

        switch (this.currentActions[index]) {
            case 'idle':
                bot.setVelocityX(0);
                break;
            case 'chase':
            case 'moveToTarget':
                this.moveTowards(bot, nearestTarget.x, nearestTarget.y);
                break;
            case 'retreat':
                this.moveAway(bot, nearestTarget.x, nearestTarget.y);
                break;
            case 'jumpAttack':
            case 'getPowerup':
            case 'randomMove':
                if (this.targetPositions[index]) {
                    this.moveTowards(bot, this.targetPositions[index].x, this.targetPositions[index].y);
                    if (this.currentActions[index] === 'jumpAttack' && bot.body.touching.down) {
                        bot.setVelocityY(CONSTANTS.PLAYER_JUMP_VELOCITY);
                    }
                }
                break;
        }

        this.scene.avoidFallingOffPlatform(bot);
    }

    moveTowards(bot, x, y) {
        if (!bot || !bot.active) return;
        const direction = x < bot.x ? -1 : 1;
        bot.setVelocityX(direction * 300);
        this.scene.updateBotAnimation(bot, direction);
    }

    moveAway(bot, x, y) {
        if (!bot || !bot.active) return;
        const direction = x < bot.x ? 1 : -1;
        bot.setVelocityX(direction * 300);
        this.scene.updateBotAnimation(bot, direction);
    }

    updateBotAnimation(bot, direction) {
        if (!bot || !bot.active || !bot.anims) return;
        try {
            if (direction < 0) {
                bot.anims.play('botLeft', true);
            } else {
                bot.anims.play('botRight', true);
            }
        } catch (error) {
            console.error('Error playing bot animation:', error);
        }
    }

    avoidFallingOffPlatform(bot) {
        if (!bot || !bot.active || !bot.body) return;
        if (bot.body.touching.down) {
            const aheadX = bot.x + (bot.body.velocity.x > 0 ? 20 : -20);
            const groundBelow = this.scene.physics.overlapRect(aheadX, bot.y, 5, 50, false, true, this.scene.gameState.platforms);
            
            if (!groundBelow) {
                bot.setVelocityX(-bot.body.velocity.x);
                this.updateBotAnimation(bot, bot.body.velocity.x > 0 ? 1 : -1);
            }
        }
    }

    isOnSamePlatform(bot) {
        return Math.abs(bot.y - this.player.y) < 10 && bot.body.touching.down && this.player.body.touching.down;
    }

    canJumpTo(bot, x, y) {
        const distance = Math.abs(bot.x - x);
        const heightDifference = bot.y - y;
        return distance < 150 && heightDifference > 0 && heightDifference < 200;
    }

    getRandomPosition(bot) {
        const x = Phaser.Math.Between(50, this.scene.sys.game.config.width - 50);
        const y = bot.y;
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
        this.selectedBotCount = null;
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
      this.load.image('pink-standing', 'assets/rabbit/pink/standing.png');
      this.load.image('blue-standing', 'assets/rabbit/blue/standing.png');
      this.load.image('purple-standing', 'assets/rabbit/purple/standing.png');
      this.load.image('cyan-standing', 'assets/rabbit/cyan/standing.png');
      this.load.image('orange-standing', 'assets/rabbit/orange/standing.png');
      this.load.image('lime-standing', 'assets/rabbit/lime/standing.png');
      this.load.image('black-standing', 'assets/rabbit/black/standing.png');
      this.load.image('jew-standing', 'assets/rabbit/jew/standing.png');
      this.load.image('carrot', 'assets/carrot.png');
      this.load.image('shopIcon', 'assets/shop.png');
    }
  
    create() {
        this.add.image(400, 300, 'menuBackground').setScale(1.28);
    
        // Start button
        this.startButton = this.add.image(406, 387, 'startButton')
            .setInteractive({ pixelPerfect: true })
            .setScale(0.85);
        this.startButton.on('pointerdown', () => this.showSelectionScreen());
    
        // Shop button (new position)
        this.shopButton = this.add.image(223, 373, 'shopIcon')
            .setInteractive({ pixelPerfect: true })
            .setScale(1);
        this.shopButton.on('pointerdown', () => this.toggleShop());
    
        // Options button
        this.optionsButton = this.add.image(600, 385, 'optionsButton')
            .setInteractive({ pixelPerfect: true })
            .setScale(0.10);
        this.optionsButton.on('pointerdown', () => {
            if (!this.isOptionsOpen) {
                this.showOptionsPage();
            }
        });
    
        // Map select button
        this.mapSelectButton = this.add.image(700, 100, 'mapSelectButton')
            .setInteractive({ pixelPerfect: true })
            .setScale(1);
        this.mapSelectButton.on('pointerdown', () => {
            if (!this.mapSelectionActive) {
                this.showMapSelection();
            }
        });

        this.enableMainMenuButtons();
    
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
    this.selectedBotCount = null;
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
        console.log('startGame method called');
        
        console.log('Selected Color:', this.selectedColor);
        console.log('Selected Difficulty:', this.selectedDifficulty);
        console.log('Selected Bot Count:', this.selectedBotCount);
        console.log('Selected Map:', this.selectedMap);
    
        if (this.selectedColor && this.selectedDifficulty && this.selectedBotCount != null) {
            const gameConfig = {
                difficulty: this.selectedDifficulty,
                map: this.selectedMap,
                rabbitColor: this.selectedColor,
                botCount: this.selectedBotCount
            };
    
            console.log('Starting GameScene with config:', JSON.stringify(gameConfig));
            
            // Store in localStorage as well
            localStorage.setItem('gameConfig', JSON.stringify(gameConfig));
            
            // Pass the config directly to the GameScene
            this.scene.start('GameScene', gameConfig);
        } else {
            console.error('Cannot start game: color, difficulty, or bot count not selected');
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
        if (this.isShopOpen || this.isOptionsOpen || this.mapSelectionActive) return;
        this.mapSelectionActive = true;
    
        // Create overlay
        this.overlay = this.add.rectangle(0, 0, this.sys.game.config.width, this.sys.game.config.height, 0x000000, 0.7);
        this.overlay.setOrigin(0);
        this.overlay.setDepth(998);
        this.overlay.setInteractive();
    
        // Create a container for map selection elements
        this.mapContainer = this.add.container(400, 300);
        this.mapContainer.setDepth(999);
    
        const maps = ['desert', 'city', 'space'];
        this.mapButtons = [];
        
        const title = this.add.text(0, -100, 'Select a Map', {
            fontSize: '32px',
            fill: '#fff'
        }).setOrigin(0.5);
        this.mapContainer.add(title);
    
        maps.forEach((map, index) => {
            const x = -200 + index * 200; // Adjust positioning for three maps
            const y = 0;
    
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
    
            this.mapContainer.add([preview, text]);
            this.mapButtons.push(preview, text);
        });
    
        const backButton = this.add.text(0, 150, 'Back', {
            fontSize: '24px',
            fill: '#fff',
            backgroundColor: '#000',
            padding: { x: 15, y: 8 }
        }).setOrigin(0.5).setInteractive();
    
        backButton.on('pointerdown', () => this.hideMapSelection());
        backButton.on('pointerover', () => backButton.setStyle({ fill: '#ff0' }));
        backButton.on('pointerout', () => backButton.setStyle({ fill: '#fff' }));
    
        this.mapContainer.add(backButton);
        this.mapButtons.push(backButton);
    
        this.disableMainMenuButtons();
    }
    
    hideMapSelection() {
        if (this.mapContainer) {
            this.mapContainer.destroy();
            this.mapContainer = null;
        }
        if (this.overlay) {
            this.overlay.destroy();
            this.overlay = null;
        }
        this.mapButtons = null;
        this.mapSelectionActive = false;
        this.enableMainMenuButtons();
    }
    
    selectMap(map) {
        this.selectedMap = map;
        this.mapText.setText(`Selected Map: ${this.selectedMap}`);
        this.hideMapSelection();
    }

    showSelectionScreen() {
        console.log('Showing selection screen');
        this.hideSelectionScreen();
        this.mainMenuElements.forEach(element => element.setVisible(false));
        this.selectionScreenActive = true;
        this.selectedColor = null;
        this.selectedDifficulty = null;
        this.selectedBotCount = null; // Reset bot count
    
        const background = this.add.rectangle(400, 300, 800, 600, 0x000000);
    
        const title = this.add.text(400, 100, 'Select Game Settings', { 
            fontSize: '32px', 
            fill: '#fff' 
        }).setOrigin(0.5);
    
        // Color selection
        const colorTitle = this.add.text(200, 150, 'Select a color', { 
            fontSize: '24px', 
            fill: '#fff' 
        }).setOrigin(0.5);
    
         // Regular colors
    const baseColors = ['white', 'yellow', 'grey', 'red', 'pink'];
    baseColors.forEach((color, index) => {
        const button = this.add.image(80 + index * 60, 200, `${color}-standing`)
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
    if (this.purchasedItems.has('cyanRabbit')) purchasedColors.push('cyan'); 

    purchasedColors.forEach((color, index) => {
        const button = this.add.image(80 + index * 60, 250, `${color}-standing`)
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

    // Number of bots selection
    const botsTitle = this.add.text(600, 380, 'Select number of bots', { 
        fontSize: '24px', 
        fill: '#fff' 
    }).setOrigin(0.5);

    this.botCountButtons = [];
    [1, 2, 3].forEach((count, index) => {
        const button = this.add.text(525 + index * 75, 430, count.toString(), { 
            fontSize: '24px', 
            fill: '#fff',
            backgroundColor: '#333',
            padding: { x: 15, y: 10 }
        }).setOrigin(0.5).setInteractive();

        button.on('pointerdown', () => this.selectBotCount(count, button));
        button.on('pointerover', () => button.setStyle({ fill: '#ff0' }));
        button.on('pointerout', () => button.setStyle({ fill: '#fff' }));

        this.botCountButtons.push(button);
    });

    this.startGameButton = this.add.text(400, 500, 'Start Game', { 
        fontSize: '28px', 
        fill: '#888',
        backgroundColor: '#333',
        padding: { x: 20, y: 10 }
    }).setOrigin(0.5).setInteractive();

    this.startGameButton.on('pointerdown', () => {
        console.log('Start Game button clicked');
        this.startGame();
    });

    this.updateStartButton();

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

    this.selectionScreenElements = [
        background, title, colorTitle, difficultyTitle, closeButton, botsTitle,
        ...this.colorButtons, ...this.difficultyButtons, ...this.botCountButtons, this.startGameButton
    ];
}

selectDifficulty(difficulty, selectedButton) {
    this.selectedDifficulty = difficulty;
    this.difficultyButtons.forEach(button => {
        button.setScale(1); // Reset all buttons to original size
    });
    selectedButton.setScale(1.2); // Make the selected button 20% larger
    this.updateStartButton();
}
    
selectBotCount(count, selectedButton) {
    console.log(`Bot count selected: ${count}`);
    this.selectedBotCount = count;
    console.log('Updated selectedBotCount:', this.selectedBotCount);
    this.botCountButtons.forEach(button => {
        button.setScale(1); // Reset all buttons to original size
    });
    selectedButton.setScale(1.2); // Make the selected button 20% larger
    this.updateStartButton();
}

    updateStartButton() {
        if (this.startGameButton) {
            const canStart = this.selectedColor && this.selectedDifficulty && this.selectedBotCount !== null;
            this.startGameButton.setFill(canStart ? '#fff' : '#888');
            this.startGameButton.setBackgroundColor(canStart ? '#4a4' : '#333');
            console.log('Start button updated. Can start:', canStart);
            console.log('Current selections:', {
                color: this.selectedColor,
                difficulty: this.selectedDifficulty,
                botCount: this.selectedBotCount
            });
        }
    }

    checkStartGame() {
        if (this.selectedColor && this.selectedDifficulty && this.selectBotCount) {
            this.startGame();
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
        if (this.isShopOpen || this.mapSelectionActive) return;
        this.isOptionsOpen = true;
    
        // Create overlay
        this.overlay = this.add.rectangle(0, 0, this.sys.game.config.width, this.sys.game.config.height, 0x000000, 0.7);
        this.overlay.setOrigin(0);
        this.overlay.setDepth(998);
        this.overlay.setInteractive();
    
        this.optionsContainer = this.add.container(400, 300);
        this.optionsContainer.setDepth(999);
    
        const bg = this.add.rectangle(0, 0, 400, 300, 0x000000, 0.8);
        this.optionsContainer.add(bg);
    
        const title = this.add.text(0, -130, 'Options', { fontSize: '32px', fill: '#fff' }).setOrigin(0.5);
        this.optionsContainer.add(title);
    
        this.fetchVolumeSetting().then(currentVolume => {
            const volumeText = this.add.text(-150, -50, `Volume: ${currentVolume}`, { fontSize: '24px', fill: '#fff' });
            this.optionsContainer.add(volumeText);
    
            const slider = this.add.rectangle(0, 0, 200, 10, 0xffffff);
            this.optionsContainer.add(slider);
    
            const initialSliderX = -100 + (currentVolume * 2);
            const sliderButton = this.add.circle(initialSliderX, 0, 15, 0xff0000)
                .setInteractive()
                .setDepth(1);
            this.optionsContainer.add(sliderButton);
    
            this.input.setDraggable(sliderButton);
    
            this.input.on('drag', (pointer, gameObject, dragX) => {
                dragX = Phaser.Math.Clamp(dragX, -100, 100);
                gameObject.x = dragX;
                const volume = Math.round((dragX + 100) / 2);
                volumeText.setText(`Volume: ${volume}`);
                this.sound.setVolume(volume / 100);
                if (this.menuSoundtrack) {
                    this.menuSoundtrack.setVolume(volume / 100);
                }
                this.saveVolumeSetting(volume);
            });
        });
    
        // Create an interactive text for control scheme selection
        const controlText = this.add.text(0, 65, `Controls: ${this.currentControlScheme}`, {
            fontSize: '24px',
            fill: '#fff',
            backgroundColor: '#333',
            padding: { x: 10, y: 5 }
        }).setOrigin(0.5).setInteractive();
        this.optionsContainer.add(controlText);
    
        controlText.on('pointerdown', () => {
            this.changeControlScheme(controlText);
        });
    
        // Simple white 'X' close button
        const closeButton = this.add.text(180, -130, 'X', {
            fontSize: '24px',
            fill: '#fff'
        })
        .setInteractive();
        this.optionsContainer.add(closeButton);
    
        closeButton.on('pointerdown', () => {
            if (this.optionsContainer) {
                this.optionsContainer.destroy();
                this.optionsContainer = null;
            }
            if (this.overlay) {
                this.overlay.destroy();
                this.overlay = null;
            }
            this.isOptionsOpen = false;
            this.enableMainMenuButtons();
        });
    
        this.disableMainMenuButtons();
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
    
        // Create a full-screen overlay to prevent clicks on the background
        this.overlay = this.add.rectangle(0, 0, this.sys.game.config.width, this.sys.game.config.height, 0x000000, 0.5);
        this.overlay.setOrigin(0);
        this.overlay.setDepth(998);  // Set a high depth to ensure it's above other elements
        this.overlay.setInteractive();
    
        // Create shop container
        this.shopContainer = this.add.container(400, 300);
        this.shopContainer.setDepth(999);  // Ensure shop is above the overlay
    
        // Add background
        const bg = this.add.rectangle(0, 0, 400, 300, 0x000000, 0.8);
        this.shopContainer.add(bg);
    
        // Add title
        const title = this.add.text(0, -130, 'Shop', { fontSize: '32px', fill: '#fff' }).setOrigin(0.5);
        this.shopContainer.add(title);
    
        // Create a mask for the shop items
        const mask = this.make.graphics();
        mask.fillRect(200, 150, 400, 250);
    
        // Create a container for shop items
        this.itemsContainer = this.add.container(0, -20);
        this.itemsContainer.setMask(new Phaser.Display.Masks.GeometryMask(this, mask));
    
        // Define shop items (now including lime and black)
        const shopItems = [
            { color: 'blue', price: 100 },
            { color: 'purple', price: 150 },
            { color: 'cyan', price: 200 },
            { color: 'orange', price: 250 },
            { color: 'lime', price: 300 },
            { color: 'black', price: 500 },
            { color: 'jew', price: 1000 }
        ];
    
        // Add shop items
        let xPosition = -250;  // Adjusted starting position to accommodate more items
        shopItems.forEach(item => {
            this.addShopItem(item, xPosition);
            xPosition += 120;  // Spacing between items
        });
    
        // Set the width of the item container
        this.itemsContainer.width = xPosition + 120;
    
        this.shopContainer.add(this.itemsContainer);
    
        // Disable other buttons
    this.disableMainMenuButtons();

    // Add close button
    const closeButton = this.add.text(180, -130, 'X', { fontSize: '24px', fill: '#fff' })
        .setInteractive();
    this.shopContainer.add(closeButton);

    closeButton.on('pointerdown', () => this.closeShop());

        // Add slider
        this.addShopSlider();
    }
    
    addShopSlider() {
        const sliderBar = this.add.rectangle(0, 120, 200, 10, 0x888888).setOrigin(0.5);
        this.shopContainer.add(sliderBar);
    
        const sliderButton = this.add.circle(-100, 120, 15, 0xffffff)
            .setInteractive({ draggable: true });
        this.shopContainer.add(sliderButton);
    
        let isDragging = false;
        let lastDragX = sliderButton.x;
    
        sliderButton.on('dragstart', () => {
            isDragging = true;
            lastDragX = sliderButton.x;
        });
    
        sliderButton.on('drag', (pointer, dragX) => {
            if (!isDragging) return;
    
            dragX = Phaser.Math.Clamp(dragX, -100, 100);
            sliderButton.x = dragX;
    
            const scrollFactor = (dragX + 100) / 200;
            const scrollRange = Math.max(0, this.itemsContainer.width - 300);
            this.itemsContainer.x = -scrollRange * scrollFactor;
    
            lastDragX = dragX;
        });
    
        sliderButton.on('dragend', () => {
            isDragging = false;
        });
    
        // Remove any existing 'drag' listeners on the global input
        this.input.off('drag', this.shopSliderDragHandler);
    
        // Create a new drag handler specifically for the shop slider
        this.shopSliderDragHandler = (pointer, gameObject, dragX) => {
            if (gameObject === sliderButton) {
                const clampedDragX = Phaser.Math.Clamp(dragX, -100, 100);
                gameObject.x = clampedDragX;
                const scrollFactor = (clampedDragX + 100) / 200;
                const scrollRange = Math.max(0, this.itemsContainer.width - 300);
                this.itemsContainer.x = -scrollRange * scrollFactor;
            }
        };
    
        // Add the new drag handler
        this.input.on('drag', this.shopSliderDragHandler);
    }
    
    addShopItem(item, xPosition) {
        const itemContainer = this.add.container(xPosition, 0);
    
        // Add rabbit image
        let rabbitImage;
        if (this.textures.exists(`${item.color}-standing`)) {
            rabbitImage = this.add.image(0, -30, `${item.color}-standing`).setScale(1);
        } else {
            console.error(`${item.color} rabbit image not found: ${item.color}-standing`);
            rabbitImage = this.add.rectangle(0, -30, 50, 50, 0xFFFFFF);
        }
        itemContainer.add(rabbitImage);
    
        if (this.purchasedItems.has(`${item.color}Rabbit`)) {
            const soldText = this.add.text(0, 50, 'SOLD!', { fontSize: '20px', fill: '#ff0000' }).setOrigin(0.5);
            itemContainer.add(soldText);
        } else {
            // Create a container for price and carrot icon
            const priceContainer = this.add.container(0, 50);
            
            // Add price text
            const priceText = this.add.text(15, 0, item.price.toString(), { fontSize: '24px', fill: '#fff' }).setOrigin(1, 0.5);
            priceContainer.add(priceText);
    
            // Add carrot icon
            const carrotIcon = this.add.image(30, 0, 'carrot').setScale(0.5);
            priceContainer.add(carrotIcon);
    
            // Center the price container
            priceContainer.setSize(priceText.width + carrotIcon.width + 10, priceText.height);
            itemContainer.add(priceContainer);
    
            // Add buy button
            const buyButton = this.add.text(0, 90, 'Buy', { 
                fontSize: '20px', 
                fill: '#fff',
                backgroundColor: '#4a4'
            })
            .setOrigin(0.5)
            .setInteractive()
            .setPadding(5);
            
            itemContainer.add(buyButton);
    
            buyButton.on('pointerdown', () => this.purchaseItem(`${item.color}Rabbit`, item.price));
        }
    
        this.itemsContainer.add(itemContainer);
    }

    
    closeShop() {
        this.isShopOpen = false;
        if (this.shopContainer) {
            this.shopContainer.destroy();
            this.shopContainer = null;
        }
        if (this.itemsContainer) {
            this.itemsContainer.destroy();
            this.itemsContainer = null;
        }
        if (this.overlay) {
            this.overlay.destroy();
            this.overlay = null;
        }
        
        // Remove the shop-specific drag handler
        if (this.shopSliderDragHandler) {
            this.input.off('drag', this.shopSliderDragHandler);
            this.shopSliderDragHandler = null;
        }
    
        this.enableMainMenuButtons();
    }

disableMainMenuButtons() {
    if (this.startButton) this.startButton.disableInteractive();
    if (this.shopButton) this.shopButton.disableInteractive();
    if (this.optionsButton) this.optionsButton.disableInteractive();
    if (this.mapSelectButton) this.mapSelectButton.disableInteractive();
}

enableMainMenuButtons() {
    if (this.startButton) this.startButton.setInteractive();
    if (this.shopButton) this.shopButton.setInteractive();
    if (this.optionsButton) this.optionsButton.setInteractive();
    if (this.mapSelectButton) this.mapSelectButton.setInteractive();
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
        this.bots = [];
        this.botColors = ['white', 'yellow', 'grey', 'red', 'blue', 'purple'];
    }

    init(data) {
        console.log('Initializing GameScene with data:', JSON.stringify(data));
        
        let gameConfig = data;
        
        // If no data is passed, try to use localStorage as a fallback
        if (!gameConfig || Object.keys(gameConfig).length === 0) {
            const storedConfig = localStorage.getItem('gameConfig');
            if (storedConfig) {
                gameConfig = JSON.parse(storedConfig);
                console.log('Using localStorage gameConfig:', JSON.stringify(gameConfig));
            } else {
                console.warn('No gameConfig found in localStorage');
            }
        }
        
        console.log('Final gameConfig being used:', JSON.stringify(gameConfig));
        
        try {
            this.cpuDifficulty = gameConfig.difficulty || 'normal';
            this.currentMap = gameConfig.map || 'sky';
            this.rabbitColor = gameConfig.rabbitColor || localStorage.getItem('selectedRabbitColor') || 'white';
            
            if (gameConfig.botCount !== undefined && gameConfig.botCount !== null) {
                this.numberOfBots = parseInt(gameConfig.botCount, 10);
                if (isNaN(this.numberOfBots) || this.numberOfBots < 1 || this.numberOfBots > 3) {
                    console.warn(`Invalid bot count: ${gameConfig.botCount}, defaulting to 3`);
                    this.numberOfBots = 3;
                } else {
                    console.log(`Received bot count: ${gameConfig.botCount}, Parsed number of bots: ${this.numberOfBots}`);
                }
            } else {
                console.warn('Bot count not received or is null, using default value of 3');
                this.numberOfBots = 3;
            }
    
            console.log('GameScene initialization complete with values:', {
                cpuDifficulty: this.cpuDifficulty,
                currentMap: this.currentMap,
                rabbitColor: this.rabbitColor,
                numberOfBots: this.numberOfBots
            });
        } catch (error) {
            console.error('Error in GameScene init:', error);
            this.cpuDifficulty = 'normal';
            this.currentMap = 'sky';
            this.rabbitColor = 'white';
            this.numberOfBots = 3;
        }
    
        // Setup the bots and other game-related objects
        this.botColors = ['white', 'yellow', 'grey', 'red', 'blue', 'purple'].filter(color => color !== this.rabbitColor);
        localStorage.setItem('selectedRabbitColor', this.rabbitColor);
    
        // Initialize gameState with updated number of bots
        this.gameState = {
            player: null,
            bots: new Array(this.numberOfBots).fill(null),
            platforms: null,
            cursors: null,
            playerScoreText: null,
            botScoreTexts: new Array(this.numberOfBots).fill(null),
            timerText: null,
            timerEvent: null,
            winText: null,
            restartButton: null,
            playerHead: null,
            playerFeet: null,
            playerDead: false,
            playerScore: 0,
            botScores: new Array(this.numberOfBots).fill(0),
            lastCollisionTime: 0,
            invulnerableUntil: 0,
            botMoveEvents: new Array(this.numberOfBots).fill(null),
            gameSoundtrack: null,
            afterGameSoundtrack: null,
            shieldPowerup: null,
            shieldTimer: null,
            playerShielded: false,
            botShielded: new Array(this.numberOfBots).fill(false),
            playerShieldSprite: null,
            botShieldSprites: new Array(this.numberOfBots).fill(null)
        };
    
        console.log('GameScene initialization complete');
        
        // Clear the global gameConfig after using it
        window.gameConfig = undefined;
    }
    
    
    preload() {
        const colors = ['white', 'yellow', 'grey', 'red', 'pink', 'blue', 'purple', 'cyan', 'orange', 'lime', 'black', 'jew'];
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
        console.log('Creating game with numberOfBots:', this.numberOfBots);
        console.log('Creating game elements with rabbit color:', this.rabbitColor);
        this.sound.stopAll();

        if (this.currentMap === 'desert') {
            this.add.image(400, 300, 'desert');
            this.createCloud();
        } else if (this.currentMap === 'city') {
            this.add.image(400, 300, 'city');
        } else if (this.currentMap === 'space') {
            this.add.image(400, 300, 'space');
        }

        this.timeBox = this.add.image(400, 50, 'time_box').setScale(0.3);

        this.createPlatforms();
        this.createPlayer();
        this.createAnimations();
        console.log(`Creating game elements for ${this.numberOfBots} bots`);
        this.createBots();

        this.gameState.botScores = new Array(this.numberOfBots).fill(0);

        this.createUI();
        this.updatePlayerColor(this.rabbitColor);

        this.gameState.timerText = this.add.text(400, 27, '03:00', {
            fontSize: '24px',
            fill: '#000',
            fontFamily: 'Arial',
            fontWeight: 'bold'
        }).setOrigin(0.5);

        if (this.gameState.playerScoreText) this.gameState.playerScoreText.destroy();
        if (this.gameState.botScoreTexts) {
            this.gameState.botScoreTexts.forEach(text => text.destroy());
        }

        // Update score texts
        this.gameState.playerScoreText = this.add.text(16, 16, 'Player Score: 0', { fontSize: '24px', fill: '#000' });
        this.gameState.botScoreTexts = [];
        for (let i = 0; i < this.numberOfBots; i++) {
            const botScoreText = this.add.text(16, 50 + i * 30, `Bot ${i + 1} Score: 0`, { fontSize: '24px', fill: '#000' });
            this.gameState.botScoreTexts.push(botScoreText);
        }

        if (this.currentMap === 'space') {
            this.physics.world.setBounds(0, 0, this.sys.game.config.width, Infinity);
            this.createSpacePlatforms();
        } else {
            this.gameState.movingPlatforms = [];
        }

        this.physics.add.collider(this.gameState.player, this.gameState.platforms);
        for (let i = 0; i < this.numberOfBots; i++) {
            const bot = this.gameState.bots[i];
            if (bot) {
                this.physics.add.collider(bot, this.gameState.platforms);
                this.physics.add.overlap(this.gameState.player, bot, this.handleCharacterCollision, null, this);
                
                for (let j = i + 1; j < this.numberOfBots; j++) {
                    const otherBot = this.gameState.bots[j];
                    if (otherBot) {
                        this.physics.add.overlap(bot, otherBot, this.handleCharacterCollision, null, this);
                    }
                }
            }
        }

        this.botAI = new BotAI(this, this.gameState.bots, this.gameState.player);
        
        this.lastTime = 0;

        if (this.gameState.botMoveEvent) {
            this.gameState.botMoveEvent.remove();
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

        this.loadVolumeSetting();

        this.debugGraphics = this.add.graphics();

        this.physics.world.resume();
    }
    
    update(time, delta) {
        if (this.gameState.winText) return;
    
        if (this.gameState.player && this.gameState.player.body) {
            this.handlePlayerMovement();
            
            if (this.gameState.player.body.velocity.y > CONSTANTS.MAX_FALLING_SPEED) {
                this.gameState.player.setVelocityY(CONSTANTS.MAX_FALLING_SPEED);
            }
        }
    
        this.updateHitboxes();
        this.updateTimer();
        this.botShieldStrategy();
    
        for (let i = 0; i < this.numberOfBots; i++) {
            const bot = this.gameState.bots[i];
            if (bot && bot.body) {
                if (bot.body.velocity.y > CONSTANTS.MAX_FALLING_SPEED) {
                    bot.setVelocityY(CONSTANTS.MAX_FALLING_SPEED);
                }
    
                bot.x = Phaser.Math.Clamp(bot.x,
                    bot.width / 2,
                    this.sys.game.config.width - bot.width / 2);
    
                // Apply the same wrapping logic for bots as for the player
                if (this.currentMap === 'space') {
                    if (bot.y > this.sys.game.config.height) {
                        bot.y = 0;
                        // Preserve velocity
                        bot.body.velocity.y = Math.min(bot.body.velocity.y, CONSTANTS.MAX_FALLING_SPEED);
                    } else if (bot.y < 0) {
                        bot.y = this.sys.game.config.height;
                        // Preserve upward velocity
                        bot.body.velocity.y = Math.max(bot.body.velocity.y, -CONSTANTS.MAX_FALLING_SPEED);
                    }
                } else {
                    if (bot.y > this.sys.game.config.height) {
                        console.log(`Bot ${i} fell through platforms. Respawning.`);
                        this.respawnEntity(bot, 'bot', i);
                    }
                }
    
                bot.body.setAllowGravity(true);
    
                if (!bot.head || !bot.feet) {
                    console.log(`Recreating hitboxes for bot ${i}`);
                    bot.head = this.createHitbox(bot, -bot.height / 2);
                    bot.feet = this.createHitbox(bot, bot.height / 2);
                }
    
                this.updateHitbox(bot.head, bot, -bot.height / 2);
                this.updateHitbox(bot.feet, bot, bot.height / 2);
            }
        }
    
        if (this.currentMap === 'space') {
            this.wrapEntities();
        }
    
        if (this.botAI) {
            this.botAI.update(time, delta);
        }
    
        this.updateBotAnimation();
    
        if (this.currentMap === 'space') {
            this.handleMovingPlatforms();
        }

        if (this.gameState.playerShielded && this.gameState.playerShieldSprite && this.gameState.player) {
            this.gameState.playerShieldSprite.setPosition(
                this.gameState.player.x,
                this.gameState.player.y - this.gameState.player.height / 2
            );
        }

        for (let i = 0; i < this.numberOfBots; i++) {
            const bot = this.gameState.bots[i];
            if (bot && this.gameState.botShielded[i] && this.gameState.botShieldSprites[i]) {
                this.gameState.botShieldSprites[i].setPosition(
                    bot.x,
                    bot.y - bot.height / 2
                );
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
            if (!obj || !obj.body) return; // Skip if object or its body is undefined
            
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
    
        if (this.gameState.player) wrapObject(this.gameState.player);
        
        this.gameState.bots.forEach(bot => {
            if (bot) wrapObject(bot);
        });
    
        // Update hitboxes after wrapping
        this.updateHitboxes();
    }
    

    handleMovingPlatforms() {
        const handleEntityOnPlatform = (entity) => {
            if (!entity || !entity.body) return false;
            
            let onMovingPlatform = false;
            this.gameState.movingPlatforms.forEach(platform => {
                if (platform && entity.body.touching.down && 
                    Math.abs(entity.y - platform.y) <= platform.height / 2 + entity.height / 2) {
                    onMovingPlatform = true;
                    const deltaX = platform.x - (platform.previousX || platform.x);
                    entity.x += deltaX;
                }
            });
            return onMovingPlatform;
        };
    
        const playerOnMovingPlatform = handleEntityOnPlatform(this.gameState.player);
        
        this.gameState.bots.forEach(bot => {
            handleEntityOnPlatform(bot);
        });
    
        // Update platform previous positions
        this.gameState.movingPlatforms.forEach(platform => {
            if (platform) {
                platform.previousX = platform.x;
            }
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
        this.gameState.movingPlatforms = [topPlatform, bottomPlatform].filter(Boolean);
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
    

    createBots() {
        this.botColors = ['white', 'yellow', 'grey', 'red', 'pink', 'blue', 'purple'].filter(color => color !== this.rabbitColor);
    
        console.log(`Creating ${this.numberOfBots} bots`);
        console.log(`Available bot colors: ${this.botColors.join(', ')}`);
    
        for (let i = 0; i < this.numberOfBots; i++) {
            const spawnPoint = this.getRandomSpawnPoint();
            const botColor = this.botColors[i % this.botColors.length];
            
            console.log(`Creating bot ${i + 1} with color: ${botColor}`);
    
            const bot = this.physics.add.sprite(spawnPoint.x, spawnPoint.y, `rabbit-standing-${botColor}`)
                .setBounce(0.1)
                .setCollideWorldBounds(true);
    
            bot.setCollideWorldBounds(true);
            bot.body.onWorldBounds = true;
            bot.setOrigin(0.5, 1);
    
            const bodyWidth = bot.width * 0.8;
            const bodyHeight = bot.height * 0.9;
            const bodyOffsetX = bot.width * 0.1;
            const bodyOffsetY = bot.height * 0.1;
    
            bot.body.setSize(bodyWidth, bodyHeight);
            bot.body.setOffset(bodyOffsetX, bodyOffsetY);
    
            bot.head = this.createHitbox(bot, -bot.height / 2);
            bot.feet = this.createHitbox(bot, bot.height / 2);
    
            this.createBotAnimations(botColor);
    
            bot.color = botColor;
            this.gameState.bots[i] = bot;
    
            this.physics.add.collider(bot, this.gameState.platforms);
    
            console.log(`Bot ${i + 1} created at x: ${spawnPoint.x}, y: ${spawnPoint.y}`);
        }
    
        console.log(`Created ${this.gameState.bots.length} bots`);
    
        // Additional check to ensure the correct number of bots were created
        if (this.gameState.bots.length !== this.numberOfBots) {
            console.warn(`Mismatch in bot count. Expected: ${this.numberOfBots}, Created: ${this.gameState.bots.length}`);
        }
    }
    
    createBotAnimations(color) {
        if (!this.anims.exists(`botLeft-${color}`)) {
            this.anims.create({
                key: `botLeft-${color}`,
                frames: [
                    { key: `rabbit-lookingleft-${color}` },
                    { key: `rabbit-walkingleft1-${color}` },
                    { key: `rabbit-walkingleft2-${color}` },
                    { key: `rabbit-walkingleft1-${color}` }
                ],
                frameRate: 10,
                repeat: -1
            });
        }
    
        if (!this.anims.exists(`botRight-${color}`)) {
            this.anims.create({
                key: `botRight-${color}`,
                frames: [
                    { key: `rabbit-lookingright-${color}` },
                    { key: `rabbit-walkingright1-${color}` },
                    { key: `rabbit-walkingright2-${color}` },
                    { key: `rabbit-walkingright1-${color}` }
                ],
                frameRate: 10,
                repeat: -1
            });
        }
    
        if (!this.anims.exists(`botIdle-${color}`)) {
            this.anims.create({
                key: `botIdle-${color}`,
                frames: [{ key: `rabbit-standing-${color}` }],
                frameRate: 10,
                repeat: 0
            });
        }
    }
    
    createBotAnimations(color) {
        const animationKeys = ['Left', 'Right', 'Idle'];
        
        animationKeys.forEach(key => {
            const animKey = `bot${key}-${color}`;
            if (!this.anims.exists(animKey)) {
                let frames;
                if (key === 'Idle') {
                    frames = [{ key: `rabbit-standing-${color}` }];
                } else {
                    const direction = key.toLowerCase();
                    frames = [
                        { key: `rabbit-looking${direction}-${color}` },
                        { key: `rabbit-walking${direction}1-${color}` },
                        { key: `rabbit-walking${direction}2-${color}` },
                        { key: `rabbit-walking${direction}1-${color}` }
                    ];
                }
                
                this.anims.create({
                    key: animKey,
                    frames: frames,
                    frameRate: 10,
                    repeat: key === 'Idle' ? 0 : -1
                });
            }
        });
    }
    
    updateBotAnimation() {
        this.gameState.bots.forEach((bot) => {
            if (!bot || !bot.active) return;
    
            const onGround = bot.body.touching.down;
            const isJumping = !onGround && bot.body.velocity.y < 0;
            const isFalling = !onGround && bot.body.velocity.y > 0;
            const botColor = bot.color;
            
            if (onGround) {
                if (Math.abs(bot.body.velocity.x) > 10) {
                    const animKey = bot.body.velocity.x < 0 ? `botLeft-${botColor}` : `botRight-${botColor}`;
                    if (this.anims.exists(animKey)) {
                        bot.play(animKey, true);
                    } else {
                        console.warn(`Animation ${animKey} not found for bot color ${botColor}`);
                    }
                } else {
                    const idleAnimKey = `botIdle-${botColor}`;
                    if (this.anims.exists(idleAnimKey)) {
                        bot.play(idleAnimKey, true);
                    } else {
                        console.warn(`Animation ${idleAnimKey} not found for bot color ${botColor}`);
                    }
                }
            } else if (isJumping) {
                bot.setTexture(`rabbit-jumping${bot.body.velocity.x < 0 ? 'left' : 'right'}-${botColor}`);
            } else if (isFalling) {
                bot.setTexture(`rabbit-walking${bot.body.velocity.x < 0 ? 'left' : 'right'}2-${botColor}`);
            }
        
            bot.setFlipX(false);
        });
    }

    getRandomSpawnPoint() {
        const gameWidth = this.sys.game.config.width;
        const gameHeight = this.sys.game.config.height;
        let x, y;
        let validPosition = false;
        let attempts = 0;
        const maxAttempts = 20;
    
        while (!validPosition && attempts < maxAttempts) {
            x = Phaser.Math.Between(50, gameWidth - 50);
            y = Phaser.Math.Between(50, gameHeight - 100);
    
            // Check if the position is above any platform
            validPosition = this.isPositionAbovePlatform(x, y);
    
            attempts++;
        }
    
        // If we couldn't find a valid position, use a default elevated position
        if (!validPosition) {
            x = Phaser.Math.Between(50, gameWidth - 50);
            y = 100; // A high position to ensure it's above platforms
        }
    
        return { x, y };
    }
    
    isPositionAbovePlatform(x, y) {
        return this.gameState.platforms.children.entries.some(platform => {
            return x >= platform.x &&
                   x <= platform.x + platform.displayWidth &&
                   y < platform.y - 50; // Ensure some space above the platform
        });
    }


    createHitbox(entity, offsetY) {
        const hitbox = this.physics.add.sprite(entity.x, entity.y + offsetY, null).setOrigin(0.5, 0.5);
        hitbox.body.setSize(CONSTANTS.HITBOX_SIZE.width, CONSTANTS.HITBOX_SIZE.height);
        hitbox.body.allowGravity = false;
        hitbox.body.immovable = true;
        hitbox.setVisible(false);
        hitbox.refreshBody(); // Ensure the physics body is updated
        return hitbox;
    }

    createUI() {
        this.gameState.playerScoreText = this.add.text(16, 16, 'Player Score: 0', { fontSize: '24px', fill: '#000' });
        this.gameState.botScoreTexts = [];
        for (let i = 0; i < this.numberOfBots; i++) {
            const botScoreText = this.add.text(16, 50 + i * 30, `Bot ${i + 1} Score: 0`, { fontSize: '24px', fill: '#000' });
            this.gameState.botScoreTexts.push(botScoreText);
        }
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
            this.gameState.bots.forEach((bot, index) => {
                if (bot.dead || this.gameState.winText) return;
        
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
                    this.moveTowardsPlatform(bot, playerPlatform);
                } else if (canJumpOnPlayer) {
                    this.moveToJumpOnPlayer(bot);
                } else if (canReachPowerup) {
                    this.moveToPowerup(bot);
                } else {
                    this.moveTowardsPlayer(bot);
                }
        
                // Jump if needed, but not constantly
                if (bot.body.touching.down && this.shouldJump(bot)) {
                    bot.setVelocityY(CONSTANTS.PLAYER_JUMP_VELOCITY);
                }
        
                this.avoidFallingOffPlatform(bot);
            });
        }

        getCurrentPlatform(entity) {
            if (!entity) return null;
            
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
            if (this.gameState.player && this.gameState.playerHead && this.gameState.playerFeet) {
                this.updateHitbox(this.gameState.playerHead, this.gameState.player, -this.gameState.player.height / 2);
                this.updateHitbox(this.gameState.playerFeet, this.gameState.player, this.gameState.player.height / 2);
            }
            
            this.gameState.bots.forEach((bot, index) => {
                if (bot && bot.head && bot.feet) {
                    this.updateHitbox(bot.head, bot, -bot.height / 2);
                    this.updateHitbox(bot.feet, bot, bot.height / 2);
                }
            });
        }
        
        updateHitbox(hitbox, entity, offsetY) {
            if (hitbox && entity && entity.body) {
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
    
    removeShield(character, index) {
        if (character === this.gameState.player) {
            console.log('Removing shield from Player');
            this.gameState.playerShielded = false;
            if (this.gameState.playerShieldSprite) {
                this.gameState.playerShieldSprite.destroy();
                this.gameState.playerShieldSprite = null;
            }
        } else {
            console.log(`Removing shield from Bot ${index}`);
            this.gameState.botShielded[index] = false;
            if (this.gameState.botShieldSprites && this.gameState.botShieldSprites[index]) {
                this.gameState.botShieldSprites[index].destroy();
                this.gameState.botShieldSprites[index] = null;
            }
        }
        console.log(`Shield removed. Player shielded: ${this.gameState.playerShielded}, Bot shielded: ${this.gameState.botShielded}`);
    }
    
    handleKill(killer, victim, killerIndex) {
        killer.setVelocityY(CONSTANTS.JUMP_OFF_VELOCITY);
        if (victim === this.gameState.player) {
            this.killPlayer(victim, killer);
        } else {
            const botIndex = this.gameState.bots.indexOf(victim);
            if (botIndex !== -1) {
                this.killBot(victim, botIndex, killerIndex);
            }
        }
    }
    
    killBot(bot, victimIndex, killerIndex) {
        if (!bot.dead) {
            bot.dead = true;
            bot.setVisible(false);
            bot.body.enable = false;
            if (killerIndex !== undefined && killerIndex >= 0 && killerIndex < this.gameState.botScores.length) {
                this.gameState.botScores[killerIndex] += 1;
                if (this.gameState.botScoreTexts[killerIndex]) {
                    this.gameState.botScoreTexts[killerIndex].setText(`Bot ${killerIndex + 1} Score: ${this.gameState.botScores[killerIndex]}`);
                } else {
                    console.warn(`Bot score text not found for index ${killerIndex}`);
                }
            } else {
                this.gameState.playerScore += 1;
                this.gameState.playerScoreText.setText('Player Score: ' + this.gameState.playerScore);
            }
            this.checkWinCondition();
            if (Math.max(...this.gameState.botScores, this.gameState.playerScore) < CONSTANTS.WIN_SCORE) {
                this.time.addEvent({ 
                    delay: CONSTANTS.RESPAWN_DELAY, 
                    callback: () => this.respawnEntity(bot, 'bot', victimIndex), 
                    callbackScope: this 
                });
            }
        }
    }
    
    killPlayer(player, killerBot) {
        if (!this.gameState.playerDead) {
            this.gameState.playerDead = true;
            player.setVisible(false);
            player.body.enable = false;
            const botIndex = this.gameState.bots.indexOf(killerBot);
            if (botIndex !== -1 && this.gameState.botScoreTexts[botIndex]) {
                this.gameState.botScores[botIndex] += 1;
                this.gameState.botScoreTexts[botIndex].setText(`Bot ${botIndex + 1} Score: ${this.gameState.botScores[botIndex]}`);
            }
            this.checkWinCondition();
            if (Math.max(...this.gameState.botScores) < CONSTANTS.WIN_SCORE) {
                this.time.addEvent({ 
                    delay: CONSTANTS.RESPAWN_DELAY, 
                    callback: () => this.respawnEntity(this.gameState.player, 'player'), 
                    callbackScope: this 
                });
            }
        }
    }

    respawnEntity(entity, type, index) {
        if (!entity) {
            console.error(`Attempted to respawn a non-existent ${type}`);
            return;
        }
    
        const spawnPoint = this.getRandomSpawnPoint();
        
        entity.setPosition(spawnPoint.x, spawnPoint.y);
        entity.setVisible(true);
        entity.body.enable = true;
        entity.setVelocity(0, 0);
    
        if (type === 'player') {
            this.gameState.playerDead = false;
        } else if (type === 'bot') {
            entity.dead = false;
        }
    
        // Reset physics properties
        entity.body.setCollideWorldBounds(true);
        entity.body.onWorldBounds = true;
        entity.body.allowGravity = true;
    
        // Recreate hitboxes
        if (entity.head) entity.head.destroy();
        if (entity.feet) entity.feet.destroy();
        entity.head = this.createHitbox(entity, -entity.height / 2);
        entity.feet = this.createHitbox(entity, entity.height / 2);
    
        // Force the entity to be on top of the platform
        entity.body.reset(spawnPoint.x, spawnPoint.y);
    
        console.log(`Entity respawned at x: ${spawnPoint.x}, y: ${spawnPoint.y}`);
    
        // Refresh colliders for this specific entity
        this.refreshEntityColliders(entity);
    }

    refreshEntityColliders(entity) {
        if (entity === this.gameState.player) {
            this.physics.add.collider(entity, this.gameState.platforms);
            this.gameState.bots.forEach(bot => {
                this.physics.add.overlap(entity, bot, this.handleCharacterCollision, null, this);
            });
        } else {
            this.physics.add.collider(entity, this.gameState.platforms);
            this.physics.add.overlap(this.gameState.player, entity, this.handleCharacterCollision, null, this);
        }
        this.physics.add.overlap(entity, this.gameState.shieldPowerup, this.handleShieldCollection, null, this);
    }

    destroyBot(bot) {
        const index = this.gameState.bots.indexOf(bot);
        if (index > -1) {
            this.gameState.bots.splice(index, 1);
        }
        if (bot.body) {
            bot.body.enable = false;
        }
        bot.destroy();
        this.refreshColliders();
    }

    refreshColliders() {
        if (this.collisionManager) {
            this.collisionManager.setupColliders();
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

    moveTowardsPlayer(bot) {
        const player = this.gameState.player;
        const direction = player.x < bot.x ? -1 : 1;
        bot.setVelocityX(direction * 300);
        bot.direction = direction === -1 ? 'left' : 'right';
    }

    moveToPowerup(bot) {
        const powerup = this.gameState.shieldPowerup;
        if (powerup && powerup.active) {
            const direction = powerup.x < bot.x ? -1 : 1;
            bot.setVelocityX(direction * 300);
            bot.direction = direction === -1 ? 'left' : 'right';
    
            // If the powerup is above the bot, make it jump
            if (powerup.y < bot.y - 50 && bot.body.touching.down) {
                bot.setVelocityY(CONSTANTS.PLAYER_JUMP_VELOCITY);
            }
        }
    }

    moveTowardsPlatform(bot, targetPlatform) {
        if (!targetPlatform) return;
    
        const direction = targetPlatform.x + targetPlatform.width / 2 < bot.x ? -1 : 1;
        bot.setVelocityX(direction * 300);
        bot.direction = direction === -1 ? 'left' : 'right';
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

    moveToJumpOnPlayer(bot) {
        const player = this.gameState.player;
        const direction = player.x < bot.x ? -1 : 1;
        bot.setVelocityX(direction * 300);
        bot.direction = direction === -1 ? 'left' : 'right';
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

    avoidFallingOffPlatform(bot) {
        if (bot.body.touching.down) {
            const aheadX = bot.x + (bot.body.velocity.x > 0 ? 20 : -20);
            const groundBelow = this.physics.overlapRect(aheadX, bot.y, 5, 50, false, true, this.gameState.platforms);
            
            if (!groundBelow) {
                bot.setVelocityX(-bot.body.velocity.x);
                bot.direction = bot.direction === 'left' ? 'right' : 'left';
            }
        }
    }

    shouldJump(bot) {
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
        const aheadX = bot.x + (bot.direction === 'right' ? 50 : -50);
        const platformAbove = this.physics.overlapRect(aheadX, bot.y - 100, 10, 100, false, true, this.gameState.platforms);
        if (platformAbove) {
            return true;
        }
    
        // Random jumps, but less frequent
        return Math.random() < this.botJumpProbability * 0.3;
    }

    botShieldStrategy() {
        this.gameState.bots.forEach((bot, index) => {
            if (!this.gameState.botShielded[index]) return;
    
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
                    this.removeShield(bot, index);
                }
            }
        });
    }

    updateBotAnimation(bot, direction) {
        if (!bot || !bot.active) return;
    
        const onGround = bot.body.touching.down;
        const isJumping = !onGround && bot.body.velocity.y < 0;
        const isFalling = !onGround && bot.body.velocity.y > 0;
        const botColor = bot.color;
        
        let animationKey;
    
        if (onGround) {
            if (bot.body.velocity.x !== 0) {
                animationKey = direction < 0 ? `botLeft-${botColor}` : `botRight-${botColor}`;
            } else {
                animationKey = `botIdle-${botColor}`;
            }
        } else if (isJumping) {
            bot.setTexture(`rabbit-jumping${direction < 0 ? 'left' : 'right'}-${botColor}`);
            return; // Exit early as we're setting a static texture
        } else if (isFalling) {
            bot.setTexture(`rabbit-walking${direction < 0 ? 'left' : 'right'}2-${botColor}`);
            return; // Exit early as we're setting a static texture
        }
    
        if (animationKey && this.anims.exists(animationKey)) {
            bot.play(animationKey, true);
        } else {
            console.warn(`Animation ${animationKey} not found for bot color ${botColor}`);
            // Fallback to static texture if animation is missing
            bot.setTexture(`rabbit-standing-${botColor}`);
        }
    }


    checkBotPosition() {
        this.gameState.bots.forEach(bot => {
            if (this.currentMap === 'space') {
                // Implement wrapping for the space map
                if (bot.y > this.sys.game.config.height) {
                    bot.y = 0;
                } else if (bot.y < 0) {
                    bot.y = this.sys.game.config.height;
                }
            } else {
                // Original behavior for other maps
                if (bot.y > this.sys.game.config.height - bot.height) {
                    const spawnPoint = this.getRandomSpawnPoint();
                    bot.setPosition(spawnPoint.x, spawnPoint.y);
                    bot.setVelocity(0, 0);
                }
            }
        });
    }

    checkWinCondition() {
        if (this.gameState.playerScore >= CONSTANTS.WIN_SCORE) {
            this.showWinMessage('Player Wins!');
        } else {
            const winningBotIndex = this.gameState.botScores.findIndex(score => score >= CONSTANTS.WIN_SCORE);
            if (winningBotIndex !== -1) {
                this.showWinMessage(`Bot ${winningBotIndex + 1} Wins!`);
            }
        }
    }

    onTimerEnd() {
        const allScores = [this.gameState.playerScore, ...this.gameState.botScores];
        const maxScore = Math.max(...allScores);
        const winnerIndex = allScores.indexOf(maxScore);
        
        let winner;
        if (winnerIndex === 0) {
            winner = 'Player';
        } else {
            winner = `Bot ${winnerIndex}`;
        }

        if (allScores.filter(score => score === maxScore).length > 1) {
            this.showWinMessage(`It's a tie! Time's Up`);
        } else {
            this.showWinMessage(`${winner} Wins! Time's Up`);
        }
    }

    showWinMessage(message) {
        // Clear all timers
        this.time.removeAllEvents();
    
        // Stop all physics
        this.physics.world.pause();
    
        // Disable and hide all game objects
        if (this.gameState.player) {
            this.gameState.player.setActive(false).setVisible(false);
        }
    
        this.gameState.bots.forEach(bot => {
            if (bot) {
                bot.setActive(false).setVisible(false);
            }
        });
    
        if (this.gameState.shieldPowerup) {
            this.gameState.shieldPowerup.setActive(false).setVisible(false);
        }
    
        // Stop all sounds
        this.sound.stopAll();
    
        // Play after-game soundtrack
        if (this.gameState.afterGameSoundtrack) this.gameState.afterGameSoundtrack.play();
    
        // Update score texts
        this.gameState.playerScoreText.setText('Player Score: ' + this.gameState.playerScore);
        this.gameState.botScoreTexts.forEach((text, index) => {
            if (index < this.numberOfBots) {
                text.setText(`Bot ${index + 1} Score: ${this.gameState.botScores[index]}`);
            } else {
                text.setVisible(false);
            }
        });
    
        // Create a container for all end-game UI elements
        this.gameState.endGameContainer = this.add.container(400, 300);
    
        // Add semi-transparent background
        const bgGraphics = this.add.graphics();
        bgGraphics.fillStyle(0x000000, 0.7);
        bgGraphics.fillRect(-400, -300, 800, 600);
        this.gameState.endGameContainer.add(bgGraphics);
    
        // Add the win message
        const winText = this.add.text(0, -80, message, { fontSize: '32px', fill: '#fff' }).setOrigin(0.5);
        this.gameState.endGameContainer.add(winText);
    
        if (message.includes('Player Wins')) {
            // Add the carrot reward message and animation
            const rewardText = this.add.text(0, -20, '+10', { fontSize: '28px', fill: '#FFD700' }).setOrigin(0.5);
            const carrotImage = this.add.image(50, -20, 'carrot').setScale(0.5);
            this.gameState.endGameContainer.add([rewardText, carrotImage]);
    
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
    
        // Add restart and return to menu buttons
        const restartButton = this.add.image(-100, 100, 'button').setInteractive().setScale(0.05);
        const returnMenuButton = this.add.image(100, 100, 'returnMenuButton').setInteractive().setScale(0.15);
        const restartText = this.add.text(-100, 100, 'Restart', { fontSize: '20px', fill: '#fff' }).setOrigin(0.5);
    
        restartButton.on('pointerdown', () => this.restartGame());
        returnMenuButton.on('pointerdown', () => this.returnToMainMenu());
    
        this.gameState.endGameContainer.add([restartButton, returnMenuButton, restartText]);
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
        this.physics.add.overlap(this.gameState.player, this.gameState.shieldPowerup, this.collectShield, null, this);
        for (let i = 0; i < this.numberOfBots; i++) {
            const bot = this.gameState.bots[i];
            if (bot) {
                this.physics.add.overlap(bot, this.gameState.shieldPowerup, this.collectShield, null, this);
            }
        }
    
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
        if (character === this.gameState.player && this.gameState.playerShielded) {
            shield.destroy();
            return;
        }
    
        const botIndex = this.gameState.bots.indexOf(character);
        if (botIndex !== -1 && this.gameState.botShielded[botIndex]) {
            shield.destroy();
            return;
        }
    
        // If we reach here, the character doesn't have a shield
        shield.destroy();
        
        const shieldSprite = this.add.image(character.x, character.y, 'shieldPowerup');
        shieldSprite.setScale(0.15);
        shieldSprite.setAlpha(0.4);
        
        if (character === this.gameState.player) {
            this.gameState.playerShielded = true;
            this.gameState.playerShieldSprite = shieldSprite;
            console.log('Shield collected by Player');
        } else {
            if (!this.gameState.botShieldSprites) {
                this.gameState.botShieldSprites = [];
            }
            this.gameState.botShielded[botIndex] = true;
            this.gameState.botShieldSprites[botIndex] = shieldSprite;
            console.log(`Shield collected by Bot ${botIndex}`);
        }
    }

    handleCharacterCollision(entity1, entity2) {
        const currentTime = this.time.now;
        if (currentTime < this.gameState.invulnerableUntil) {
            return;
        }
    
        const verticalDistance = entity2.y - entity1.y;
        const horizontalDistance = Math.abs(entity1.x - entity2.x);
    
        if (Math.abs(verticalDistance) < entity1.height * 0.25 && horizontalDistance < entity1.width * 0.8) {
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
            return;
        }
    
        const victimIndex = this.gameState.bots.indexOf(victim);
        const killerIndex = this.gameState.bots.indexOf(killer);
    
        if (victim === this.gameState.player && this.gameState.playerShielded) {
            this.removeShield(this.gameState.player);
            killer.setVelocityY(CONSTANTS.JUMP_OFF_VELOCITY);
        } else if (victimIndex !== -1 && this.gameState.botShielded[victimIndex]) {
            this.removeShield(victim, victimIndex);
            killer.setVelocityY(CONSTANTS.JUMP_OFF_VELOCITY);
        } else {
            this.handleKill(killer, victim, killerIndex);
        }
    
        this.gameState.invulnerableUntil = currentTime + 300;
    }

    // debugCollisions() {
    //     if (!this.debugGraphics) {
    //         this.debugGraphics = this.add.graphics();
    //     }
    //     this.debugGraphics.clear();
    
    //     // Draw player hitbox
    //     this.drawHitbox(this.gameState.player, 0x00ff00);
    
    //     // Draw bot hitboxes
    //     this.gameState.bots.forEach((bot, index) => {
    //         const color = bot.head && bot.feet ? 0xff0000 : 0xff00ff;
    //         this.drawHitbox(bot, color);
    //         if (bot.head) this.drawHitbox(bot.head, 0x0000ff);
    //         if (bot.feet) this.drawHitbox(bot.feet, 0x0000ff);
    //     });
    // }
    
    // drawHitbox(entity, color) {
    //     if (entity && entity.body) {
    //         this.debugGraphics.lineStyle(2, color, 1);
    //         this.debugGraphics.strokeRect(
    //             entity.body.x, entity.body.y,
    //             entity.body.width, entity.body.height
    //         );
    //     }
    // }

    handleShieldCollection(character, shield) {
        if (!character || !shield) return;
        const distance = Phaser.Math.Distance.Between(character.x, character.y, shield.x, shield.y);
        if (distance < 30) {
            this.collectShield(character, shield);
        }
    }

    restartGame() {
        // Stop after-game soundtrack and replay game soundtrack
        this.sound.stopAll();
        if (this.gameState.gameSoundtrack) {
            this.gameState.gameSoundtrack.play();
        }
    
        // Reset scores
        this.gameState.playerScore = 0;
        this.gameState.botScores = new Array(this.numberOfBots).fill(0);

        // Update score texts
        this.gameState.playerScoreText.setText('Player Score: 0');
        this.gameState.botScoreTexts.forEach((text, index) => {
            if (index < this.numberOfBots) {
                text.setText(`Bot ${index + 1} Score: 0`);
                text.setVisible(true);
            } else {
                text.setVisible(false);
            }
        });
    
        // Clear all end-game UI elements
        if (this.gameState.endGameContainer) {
            this.gameState.endGameContainer.destroy();
            this.gameState.endGameContainer = null;
        }
    
        // Reset player and bot states
        this.gameState.playerDead = false;
        this.gameState.player.setActive(true).setVisible(true).enableBody(true, 0, 0, true, true);
        
        this.gameState.bots.forEach((bot, index) => {
            if (index < this.numberOfBots) {
                bot.dead = false;
                bot.setActive(true).setVisible(true).enableBody(true, 0, 0, true, true);
            } else {
                bot.setActive(false).setVisible(false);
            }
        });

        // Respawn entities
        this.respawnEntity(this.gameState.player, 'player');
        for (let i = 0; i < this.numberOfBots; i++) {
            this.respawnEntity(this.gameState.bots[i], 'bot', i);
        }
    
        // Reset invulnerability
        this.gameState.invulnerableUntil = 0;
    
        // Reset and restart the timer
        if (this.gameState.timerEvent) this.gameState.timerEvent.remove();
        this.gameState.timerEvent = this.time.addEvent({ 
            delay: CONSTANTS.GAME_DURATION, 
            callback: this.onTimerEnd, 
            callbackScope: this 
        });
    
        // Restart shield timer
        if (this.gameState.shieldTimer) this.gameState.shieldTimer.remove();
        this.gameState.shieldTimer = this.time.addEvent({
            delay: 30000,
            callback: this.spawnShieldPowerup,
            callbackScope: this,
            loop: true
        });
    
        // Remove any existing shields
        this.gameState.playerShielded = false;
        if (this.gameState.playerShieldSprite) {
            this.gameState.playerShieldSprite.destroy();
            this.gameState.playerShieldSprite = null;
        }
        this.gameState.botShielded = new Array(this.gameState.bots.length).fill(false);
        this.gameState.botShieldSprites.forEach(sprite => {
            if (sprite) sprite.destroy();
        });
        this.gameState.botShieldSprites = new Array(this.gameState.bots.length).fill(null);
    
        // Reset the timer text
        this.gameState.timerText.setText('03:00');
    
        // Resume physics
        this.physics.world.resume();
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
