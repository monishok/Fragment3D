// backend/routes/assets.js
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const User = require("../models/User");
const auth = require("../middleware/auth");

const router = express.Router();

// ensure upload directories exist
const IMAGES_DIR = path.join(__dirname, "..", "uploads", "images");
const GLB_DIR = path.join(__dirname, "..", "uploads", "glb");
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
if (!fs.existsSync(GLB_DIR)) fs.mkdirSync(GLB_DIR, { recursive: true });

// storage for images
const imageStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, IMAGES_DIR);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
    }
});

// storage for glb files
const glbStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, GLB_DIR);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
    }
});

const imageUpload = multer({ storage: imageStorage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB
const glbUpload = multer({ storage: glbStorage, limits: { fileSize: 200 * 1024 * 1024 } }); // 200MB

// POST /api/assets/upload-image
// multipart form with field 'image'
router.post("/upload-image", auth, imageUpload.single("image"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No image uploaded" });

        const imageUrl = `${req.protocol}://${req.get("host")}/uploads/images/${req.file.filename}`;

        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        const asset = {
            _id: new mongoose.Types.ObjectId(),
            imageUrl,
            glbUrl: null,
            status: "pending",
            meta: {},
            createdAt: new Date()
        };

        user.assets = user.assets || [];
        user.assets.unshift(asset); // newest first
        await user.save();

        return res.status(201).json({ asset });
    } catch (err) {
        console.error("UPLOAD IMAGE ERROR:", err);
        return res.status(500).json({ error: "Server error uploading image" });
    }
});

// POST /api/assets/:assetId/attach-glb
// multipart form with field 'glb' OR JSON { glbUrl: "..." }
router.post("/:assetId/attach-glb", auth, glbUpload.single("glb"), async (req, res) => {
    try {
        const { assetId } = req.params;
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        const asset = (user.assets || []).id(assetId);
        if (!asset) return res.status(404).json({ error: "Asset not found" });

        let glbUrl = null;
        if (req.file) {
            glbUrl = `${req.protocol}://${req.get("host")}/uploads/glb/${req.file.filename}`;
        } else if (req.body && req.body.glbUrl) {
            glbUrl = req.body.glbUrl;
        } else {
            return res.status(400).json({ error: "No GLB file or URL provided" });
        }

        asset.glbUrl = glbUrl;
        asset.status = "ready";
        asset.updatedAt = new Date();
        asset.generatedAt = new Date(); // set generation timestamp

        await user.save();

        return res.json({ asset });
    } catch (err) {
        console.error("ATTACH GLB ERROR:", err);
        return res.status(500).json({ error: "Server error attaching GLB" });
    }
});

// GET /api/assets
router.get("/", auth, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("assets username email");
        if (!user) return res.status(404).json({ error: "User not found" });
        return res.json({ assets: user.assets || [], username: user.username });
    } catch (err) {
        console.error("GET ASSETS ERROR:", err);
        return res.status(500).json({ error: "Server error fetching assets" });
    }
});

// GET /api/assets/:assetId
router.get("/:assetId", auth, async (req, res) => {
    try {
        const { assetId } = req.params;
        const user = await User.findById(req.userId).select("assets");
        if (!user) return res.status(404).json({ error: "User not found" });
        const asset = (user.assets || []).id(assetId);
        if (!asset) return res.status(404).json({ error: "Asset not found" });
        return res.json({ asset });
    } catch (err) {
        console.error("GET ASSET ERROR:", err);
        return res.status(500).json({ error: "Server error fetching asset" });
    }
});

// DELETE /api/assets/:assetId
// remove asset subdocument and attempt to delete files on disk
router.delete("/:assetId", auth, async (req, res) => {
    try {
        const { assetId } = req.params;
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        const asset = (user.assets || []).id(assetId);
        if (!asset) return res.status(404).json({ error: "Asset not found" });

        // attempt to unlink files if stored in uploads
        try {
            if (asset.imageUrl && asset.imageUrl.includes("/uploads/images/")) {
                const imgName = path.basename(asset.imageUrl);
                const imgPath = path.join(IMAGES_DIR, imgName);
                if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
            }
        } catch (e) {
            console.warn("Could not delete image file:", e.message || e);
        }

        try {
            if (asset.glbUrl && asset.glbUrl.includes("/uploads/glb/")) {
                const glbName = path.basename(asset.glbUrl);
                const glbPath = path.join(GLB_DIR, glbName);
                if (fs.existsSync(glbPath)) fs.unlinkSync(glbPath);
            }
        } catch (e) {
            console.warn("Could not delete glb file:", e.message || e);
        }

        // remove asset subdoc
        const sub = user.assets.id(assetId);
        if (sub) {
            await sub.deleteOne();
            await user.save();
        }


        return res.json({ success: true });
    } catch (err) {
        console.error("DELETE ASSET ERROR:", err);
        return res.status(500).json({ error: "Server error deleting asset" });
    }
});

module.exports = router;
