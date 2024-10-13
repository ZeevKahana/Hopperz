const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// User model
const User = mongoose.model('User', {
    email: String,
    password: String,
    carrots: { type: Number, default: 0 },
    purchasedItems: [String],
    volume: { type: Number, default: 50 }
});

// IPC Handlers
ipcMain.handle('register', async (event, { email, password }) => {
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

ipcMain.handle('login', async (event, { email, password }) => {
  try {
      const user = await User.findOne({ email });
      if (user && await bcrypt.compare(password, user.password)) {
          // Construct a plain object with only the data we need
          const safeUserData = {
              email: user.email,
              carrots: user.carrots,
              purchasedItems: user.purchasedItems.map(item => item.toString()), // Convert ObjectIds to strings
          };
          return { 
              success: true, 
              user: safeUserData
          };
      } else {
          return { success: false, error: 'Invalid credentials' };
      }
  } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: error.message };
  }
});

ipcMain.handle('updateCarrots', async (event, { email, carrotsToAdd }) => {
    console.log('Updating carrots for:', email, 'Amount:', carrotsToAdd);  // Add this log
    try {
        // Check if carrotsToAdd is a valid number
        if (typeof carrotsToAdd !== 'number' || isNaN(carrotsToAdd)) {
            console.error('Invalid carrotsToAdd value:', carrotsToAdd);
            return { success: false, error: 'Invalid carrots value' };
        }
  
        const user = await User.findOne({ email });
        if (!user) {
            console.error('User not found:', email);  // Add this log
            return { success: false, error: 'User not found' };
        }
  
        // Ensure we're working with numbers
        const currentCarrots = Number(user.carrots) || 0;
        const updatedCarrots = currentCarrots + carrotsToAdd;
  
        console.log('Current carrots:', currentCarrots, 'Updated carrots:', updatedCarrots);  // Add this log
  
        // Update the user's carrots
        user.carrots = updatedCarrots;
        await user.save();
  
        return { 
            success: true, 
            newCarrotCount: user.carrots 
        };
    } catch (error) {
        console.error('Update carrots error:', error);
        return { success: false, error: error.message };
    }
  });

ipcMain.handle('getCarrotCount', async (event, { email }) => {
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
      width: 1024,  // Increased from 800
      height: 768,  // Increased from 600
      webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: path.join(__dirname, 'preload.js')
      }
  });

  win.loadFile(path.join(__dirname, 'public', 'hopz.html'));

  // Uncomment the next line to open DevTools automatically
  // win.webContents.openDevTools();
}

app.whenReady().then(createWindow);

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