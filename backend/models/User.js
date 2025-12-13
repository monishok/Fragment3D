// backend/models/User.js
const mongoose = require("mongoose");

const assetSchema = new mongoose.Schema({
    _id: {
        type: mongoose.Schema.Types.ObjectId,
        default: () => new mongoose.Types.ObjectId()
    },

    imageUrl: { type: String, required: true },
    glbUrl: { type: String, default: null },
    status: { type: String, enum: ["pending", "processing", "ready", "failed"], default: "pending" },
    meta: { type: Object, default: {} },
    createdAt: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    assets: { type: [assetSchema], default: [] } // new field
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
