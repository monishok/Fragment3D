// backend/server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const createRoutes = require("./routes/create");

require("dotenv").config();

const authRoutes = require("./routes/auth");
const assetsRoutes = require("./routes/assets");

const app = express();

app.use(cors());
app.use(express.json());

// serve uploads folder statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// connect to mongodb
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB connected!"))
    .catch((err) => console.error("MongoDB connection error:", err));

// routes
app.use("/api/auth", authRoutes);
app.use("/api/assets", assetsRoutes);
app.use("/api/create", createRoutes);

app.get("/", (req, res) => res.send("Backend running"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
