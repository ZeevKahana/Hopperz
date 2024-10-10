const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const path = require('path');
require('dotenv').config();

const app = express();

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected successfully to hopperzdb'))
  .catch(err => console.error('MongoDB connection error:', err));

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create an updated User model
const User = mongoose.model('User', {
    email: String,
    password: String,
    carrots: { type: Number, default: 0 },
    purchasedItems: [String]  // Array to store IDs of purchased items
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'hopz.html'));
});

app.post('/api/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check if a user with this email already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, error: 'Email already registered' });
        }

        // If no existing user, proceed with registration
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ email, password: hashedPassword, purchasedItems: [] });
        await user.save();
        res.json({ success: true });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (user && await bcrypt.compare(password, user.password)) {
            res.json({ 
                success: true, 
                carrots: user.carrots, 
                purchasedItems: user.purchasedItems 
            });
        } else {
            res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/updateCarrots', async (req, res) => {
    try {
        const { email, carrotsToAdd } = req.body;
        const user = await User.findOne({ email });
        if (user) {
            user.carrots += carrotsToAdd;
            await user.save();
            res.json({ success: true, newCarrotCount: user.carrots });
        } else {
            res.status(404).json({ success: false, error: 'User not found' });
        }
    } catch (error) {
        console.error('Update carrots error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/getCarrotCount', async (req, res) => {
    console.log('Received request to /api/getCarrotCount');
    console.log('Request body:', req.body);
    try {
        const { email } = req.body;
        if (!email) {
            console.log('No email provided in request');
            return res.status(400).json({ success: false, error: 'Email is required' });
        }
        console.log('Fetching carrot count for email:', email);
        const user = await User.findOne({ email });
        if (user) {
            console.log('User found, carrot count:', user.carrots);
            const responseData = { 
                success: true, 
                carrotCount: user.carrots,
                purchasedItems: user.purchasedItems
            };
            console.log('Sending response:', responseData);
            return res.json(responseData);
        } else {
            console.log('User not found');
            return res.status(404).json({ success: false, error: 'User not found' });
        }
    } catch (error) {
        console.error('Get carrot count error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/purchaseItem', async (req, res) => {
    try {
        const { email, itemId, price } = req.body;
        const user = await User.findOne({ email });
        if (user) {
            if (user.purchasedItems.includes(itemId)) {
                return res.status(400).json({ success: false, error: 'Item already purchased' });
            }
            if (user.carrots >= price) {
                user.carrots -= price;
                user.purchasedItems.push(itemId);
                await user.save();
                res.json({ 
                    success: true, 
                    newCarrotCount: user.carrots,
                    purchasedItems: user.purchasedItems
                });
            } else {
                res.status(400).json({ success: false, error: 'Not enough carrots' });
            }
        } else {
            res.status(404).json({ success: false, error: 'User not found' });
        }
    } catch (error) {
        console.error('Purchase item error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Serving files from: ${path.join(__dirname, 'public')}`);
});