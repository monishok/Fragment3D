// backend/routes/auth.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

// REGISTER
router.post("/register", async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password)
            return res.status(400).json({ error: "All fields are required" });

        if (await User.findOne({ email })) return res.status(400).json({ error: "Email already registered" });
        if (await User.findOne({ username })) return res.status(400).json({ error: "Username already taken" });

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username, email, password: hashedPassword });
        await user.save();

        // Create token for instant login
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

        res.status(201).json({
            message: "User registered",
            token,
            user: { id: user._id, username: user.username, email: user.email }
        });
    } catch (err) {
        console.error("REGISTER ERROR:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// LOGIN
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: "Email and password required" });

        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: "Invalid email or password" });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(400).json({ error: "Invalid email or password" });

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

        res.json({
            token,
            user: { id: user._id, username: user.username, email: user.email }
        });
    } catch (err) {
        console.error("LOGIN ERROR:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// GET current user (protected)
router.get("/me", authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("-password");
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json({ user });
    } catch (err) {
        console.error("ME ERROR:", err);
        res.status(500).json({ error: "Server error" });
    }
});

module.exports = router;
