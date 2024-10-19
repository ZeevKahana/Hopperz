const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const fs = require('fs');

// Environment variable loading
let envPath;
if (app.isPackaged) {
    envPath = path.join(process.resourcesPath, '.env');
} else {
    envPath = path.join(__dirname, '.env');
}

if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    console.log('Loaded .env file from:', envPath);
} else {
    console.error('.env file not found at:', envPath);
}

console.log('MONGODB_URI:', process.env.MONGODB_URI);

// MongoDB connection
let mongoConnected = false;

async function connectToMongoDB() {
    console.log('Attempting to connect to MongoDB...');
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 10000 // 10 seconds timeout
        });
        console.log('Connected to MongoDB successfully');
        mongoConnected = true;
    } catch (error) {
        console.error('MongoDB connection error:', error);
        mongoConnected = false;
    }
}

// User model
const User = mongoose.model('User', {
    email: String,
    password: String,
    carrots: { type: Number, default: 0 },
    purchasedItems: [String],
    volume: { type: Number, default: 50 }
});

// IPC Handlers
ipcMain.handle('login', async (event, { email, password }) => {
    if (!mongoConnected) {
        console.error('Attempted login, but MongoDB is not connected');
        return { success: false, error: 'Database connection not established' };
    }
    try {
        const user = await User.findOne({ email });
        if (user && await bcrypt.compare(password, user.password)) {
            const safeUserData = {
                email: user.email,
                carrots: user.carrots,
                purchasedItems: user.purchasedItems.map(item => item.toString()),
            };
            return { success: true, user: safeUserData };
        } else {
            return { success: false, error: 'Invalid credentials' };
        }
    } catch (error) {
        console.error('Login error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('register', async (event, { email, password }) => {
    if (!mongoConnected) {
        console.error('Attempted registration, but MongoDB is not connected');
        return { success: false, error: 'Database connection not established' };
    }
    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return { success: false, error: 'Email already registered' };
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ email, password: hashedPassword });
        await user.save();
        return { success: true };
    } catch (error) {
        console.error('Registration error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('updateCarrots', async (event, { email, carrotsToAdd }) => {
    if (!mongoConnected) {
        console.error('Attempted to update carrots, but MongoDB is not connected');
        return { success: false, error: 'Database connection not established' };
    }
    console.log('Updating carrots for:', email, 'Amount:', carrotsToAdd);
    try {
        if (typeof carrotsToAdd !== 'number' || isNaN(carrotsToAdd)) {
            console.error('Invalid carrotsToAdd value:', carrotsToAdd);
            return { success: false, error: 'Invalid carrots value' };
        }
        const user = await User.findOne({ email });
        if (!user) {
            console.error('User not found:', email);
            return { success: false, error: 'User not found' };
        }
        user.carrots = (user.carrots || 0) + carrotsToAdd;
        await user.save();
        return { success: true, newCarrotCount: user.carrots };
    } catch (error) {
        console.error('Update carrots error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('getCarrotCount', async (event, { email }) => {
    if (!mongoConnected) {
        console.error('Attempted to get carrot count, but MongoDB is not connected');
        return { success: false, error: 'Database connection not established' };
    }
    try {
        const user = await User.findOne({ email });
        if (user) {
            return { 
                success: true, 
                carrotCount: user.carrots,
                purchasedItems: user.purchasedItems.map(item => item.toString())
            };
        } else {
            return { success: false, error: 'User not found' };
        }
    } catch (error) {
        console.error('Get carrot count error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('purchaseItem', async (event, { email, itemId, price }) => {
    if (!mongoConnected) {
        console.error('Attempted to purchase item, but MongoDB is not connected');
        return { success: false, error: 'Database connection not established' };
    }
    try {
        const user = await User.findOne({ email });
        if (user) {
            if (user.purchasedItems.includes(itemId)) {
                return { success: false, error: 'Item already purchased' };
            }
            if (user.carrots >= price) {
                user.carrots -= price;
                user.purchasedItems.push(itemId);
                await user.save();
                return { 
                    success: true, 
                    newCarrotCount: user.carrots,
                    purchasedItems: user.purchasedItems.map(item => item.toString())
                };
            } else {
                return { success: false, error: 'Not enough carrots' };
            }
        } else {
            return { success: false, error: 'User not found' };
        }
    } catch (error) {
        console.error('Purchase item error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('getVolume', async (event, { email }) => {
    if (!mongoConnected) {
        console.error('Attempted to get volume, but MongoDB is not connected');
        return { success: false, error: 'Database connection not established' };
    }
    try {
        const user = await User.findOne({ email });
        if (user) {
            return { success: true, volume: user.volume };
        } else {
            return { success: false, error: 'User not found' };
        }
    } catch (error) {
        console.error('Get volume error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('saveVolume', async (event, { email, volume }) => {
    if (!mongoConnected) {
        console.error('Attempted to save volume, but MongoDB is not connected');
        return { success: false, error: 'Database connection not established' };
    }
    try {
        const user = await User.findOneAndUpdate(
            { email },
            { volume },
            { new: true }
        );
        if (user) {
            return { success: true };
        } else {
            return { success: false, error: 'User not found' };
        }
    } catch (error) {
        console.error('Save volume error:', error);
        return { success: false, error: error.message };
    }
});

function createWindow() {
    const win = new BrowserWindow({
        width: 815,
        height: 660,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: false,
            backgroundThrottling: false  // Add this line
        }
    });

    let htmlPath;
    if (app.isPackaged) {
        htmlPath = path.join(__dirname, '../public/hopz.html');
    } else {
        htmlPath = path.join(__dirname, 'public/hopz.html');
    }

    console.log('Loading HTML from:', htmlPath);

    win.loadFile(htmlPath);

    win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('Failed to load:', errorCode, errorDescription);
    });

    win.webContents.on('console-message', (event, level, message, line, sourceId) => {
        console.log('Renderer Console:', message);
    });

    // Uncomment the next line to open DevTools automatically
    // win.webContents.openDevTools();

    win.webContents.on('did-finish-load', () => {
        console.log('Window loaded successfully');
    });

    process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
}

app.whenReady().then(async () => {
    await connectToMongoDB();
    createWindow();
    app.commandLine.appendSwitch('disable-background-timer-throttling');
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});