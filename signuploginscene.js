// SignUpLoginScene.js

class SignUpLoginScene extends Phaser.Scene {
    constructor() {
        super({ key: 'signuploginscene' });
    }

    preload() {
        this.load.image('signupLogin', 'assets/Start.png'); // Load the sign-up/login PNG image
    }

    create() {
        // Display the sign-up/login PNG image
        this.add.image(400, 300, 'signupLogin');

        // Define interactive areas on the image
        // For example, you can define rectangles or circles as clickable areas
        // Here, I'll use a rectangle for the sign-up button and another for the login button
        const signUpArea = new Phaser.Geom.Rectangle(200, 200, 200, 50);
        const loginArea = new Phaser.Geom.Rectangle(200, 300, 200, 50);

        // Add event listeners to handle user clicks
        this.input.on('pointerdown', (pointer) => {
            if (Phaser.Geom.Rectangle.ContainsPoint(signUpArea, pointer)) {
                // Handle sign-up action
                // Transition to the main menu scene if sign-up is successful
                this.scene.start('MainMenuScene');
            } else if (Phaser.Geom.Rectangle.ContainsPoint(loginArea, pointer)) {
                // Handle login action
                // Transition to the main menu scene if login is successful
                this.scene.start('MainMenuScene');
            }
        });
    }
}

// Phaser Configuration

var config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    scene: [SignUpLoginScene, MainMenuScene] // Load SignUpLoginScene first
};

var game = new Phaser.Game(config);
