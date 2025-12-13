// backend/routes/create.js
// Comprehensive route that uploads an input image, calls external Gradio endpoints
// (/process_image, /get_random_seed, /process_3d), saves segmented image + generated GLB
// to disk, and updates the user's assets subdocument. It returns the segmented image URL
// to the frontend as soon as /process_image completes, while continuing the 3D work
// (fire-and-forget) and updating the database when the GLB is ready.

const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const User = require("../models/User");
const auth = require("../middleware/auth");

// OPTIONAL: Image conversion helper (sharp). Install with: npm install sharp
let sharp = null;
try {
    sharp = require("sharp");
    console.log("[create] sharp available for image conversions.");
} catch (e) {
    console.log("[create] sharp not available — install with `npm i sharp` to convert WebP -> PNG automatically.");
}

// Ensure uploads directories exist
const imagesDir = path.join(__dirname, "..", "uploads", "images");
const glbDir = path.join(__dirname, "..", "uploads", "glb");
if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
if (!fs.existsSync(glbDir)) fs.mkdirSync(glbDir, { recursive: true });

// Multer storage for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, imagesDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(
            file.originalname || ".png"
        )}`;
        cb(null, uniqueName);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(String(file.mimetype));
        if (extname && mimetype) cb(null, true);
        else cb(new Error("Only .png, .jpg, and .jpeg files are allowed"));
    },
});

/**
 * Helper: save Buffer to imagesDir and return public URL
 */
function saveBufferAsImage(buffer, ext /* without dot */, protocol, host) {
    const filename = `processed-${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext || "png"}`;
    const outPath = path.join(imagesDir, filename);
    fs.writeFileSync(outPath, buffer);
    console.log("[saveBufferAsImage] saved ->", outPath, "size:", buffer.length);
    return `${protocol}://${host}/uploads/images/${filename}`;
}

/**
 * Helper: save Buffer as GLB and return public URL
 */
function saveBufferAsGlb(buffer, ext /* without dot */, protocol, host) {
    const safeExt = ext && ext.toLowerCase() === "glb" ? "glb" : "glb";
    const filename = `generated-${Date.now()}-${Math.round(Math.random() * 1e6)}.${safeExt}`;
    const outPath = path.join(glbDir, filename);
    fs.writeFileSync(outPath, buffer);
    console.log("[saveBufferAsGlb] saved ->", outPath, "size:", buffer.length);
    return `${protocol}://${host}/uploads/glb/${filename}`;
}

/**
 * Utility: detect mime/ext from buffer magic bytes
 */
function detectMimeFromBuffer(buf) {
    if (!buf || buf.length < 12) return null;
    // PNG
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
        return { mime: "image/png", ext: "png" };
    }
    // JPEG
    if (buf[0] === 0xff && buf[1] === 0xd8) {
        return { mime: "image/jpeg", ext: "jpg" };
    }
    // WebP: "RIFF" .... "WEBP"
    if (buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP") {
        return { mime: "image/webp", ext: "webp" };
    }
    // GLB header "glTF"
    if (buf.slice(0, 4).toString() === "glTF") {
        return { mime: "model/gltf-binary", ext: "glb" };
    }
    return null;
}

/**
 * POST /api/create/upload
 *
 * Flow:
 *  1) Receive uploaded input image + seed and other optional 3D params
 *  2) Create an asset subdoc with status 'pending' and save input image URL
 *  3) Call Gradio /process_image with the uploaded image -> get segmented image
 *  4) Save segmented image locally, attach to asset.meta.segmentedImage
 *  5) RESPOND IMMEDIATELY with segmentedImageUrl + assetId (so frontend can display)
 *  6) In background (fire-and-forget), call Gradio /get_random_seed and /process_3d,
 *     save resulting GLB, update asset.glbUrl, status='ready', generatedAt
 */
router.post("/upload", auth, (req, res) => {
    // Run multer manually to handle errors as JSON
    upload.single("image")(req, res, async function (err) {
        if (err) {
            if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message });
            return res.status(400).json({ error: err.message || "Upload failed" });
        }

        try {
            if (!req.file) return res.status(400).json({ error: "No image file provided" });

            // auth sets req.userId
            const uid = req.userId;
            if (!uid) return res.status(401).json({ error: "Authorization required" });

            const user = await User.findById(uid);
            if (!user) return res.status(404).json({ error: "User not found" });

            // parse body params (seed etc.)
            const {
                seed: seedRaw,
                num_steps = 50,
                cfg_scale = 7,
                grid_res = 384,
                simplify_mesh = false,
                target_num_faces = 100000,
                randomize_seed = false,
            } = req.body || {};

            const providedSeed =
                typeof seedRaw !== "undefined" && seedRaw !== null && seedRaw !== "" ? Number(seedRaw) : null;

            const host = req.get("host") || "localhost:5000";
            const protocol = req.protocol || "http";
            const imagePath = `/uploads/images/${req.file.filename}`;
            const imageUrl = `${protocol}://${host}${imagePath}`;

            // Create asset subdoc and save (Mongoose generates _id)
            const newAsset = {
                imageUrl,
                glbUrl: null,
                status: "pending",
                meta: {
                    seed: providedSeed ?? null,
                    uploadedAt: new Date(),
                },
                createdAt: new Date(),
            };

            user.assets = user.assets || [];
            user.assets.push(newAsset);
            await user.save();

            // The recently pushed subdoc
            const createdAsset = user.assets[user.assets.length - 1];
            const assetId = String(createdAsset._id);

            // ========== STEP A: call Gradio /process_image ==========
            let segmentedImageUrl = null;
            try {
                console.log("[create] calling /process_image for assetId:", assetId);
                const { Client } = await import("@gradio/client");
                const GRADIO_URL = "https://474f55c971fdba7789.gradio.live/"; // <- replace if needed
                const client = await Client.connect(GRADIO_URL);

                // read uploaded file as buffer
                const uploadedFilePath = path.join(imagesDir, req.file.filename);
                const fileBuffer = fs.readFileSync(uploadedFilePath);
                console.log("[create] uploadedFilePath:", uploadedFilePath, "size:", fileBuffer.length);

                // prepare blob / Buffer for gradio client
                let blobForGradio;
                try {
                    // Node 18+ has global Blob
                    blobForGradio = new Blob([fileBuffer], { type: req.file.mimetype || "image/png" });
                    console.log("[create] using Blob for Gradio (Node Blob available). mime:", req.file.mimetype);
                } catch (e) {
                    blobForGradio = fileBuffer; // fallback
                    console.log("[create] Blob not available; sending Buffer to Gradio. mime:", req.file.mimetype);
                }

                // call Gradio
                console.log("[create] sending to Gradio /process_image ...");
                const procRes = await client.predict("/process_image", { image_path: blobForGradio });
                console.log("[create] /process_image returned (raw):", typeof procRes?.data, Array.isArray(procRes?.data) ? procRes.data.length : null);

                const rawOut = Array.isArray(procRes?.data) ? procRes.data[0] : procRes?.data;
                // Log a short preview of the response
                if (typeof rawOut === "string") {
                    console.log("[create] /process_image returned string length:", rawOut.length, " startsWith data?:", rawOut.startsWith?.("data:"), "startsWith http?:", rawOut.startsWith?.("http"));
                } else if (rawOut && typeof rawOut === "object") {
                    console.log("[create] /process_image returned object keys:", Object.keys(rawOut));
                } else if (rawOut instanceof ArrayBuffer || ArrayBuffer.isView(rawOut)) {
                    console.log("[create] /process_image returned binary buffer length (ArrayBuffer view).");
                } else {
                    console.log("[create] /process_image returned unknown type - saving diagnostic.");
                }

                // normalize output (string, URL, base64, ArrayBuffer, or Gradio FileData object)
                if (typeof rawOut === "string") {
                    if (rawOut.startsWith("data:")) {
                        const m = rawOut.match(/^data:(.+);base64,(.+)$/);
                        if (m) {
                            const mime = m[1];
                            const base64 = m[2];
                            const ext = mime.split("/")[1].split("+")[0] || "png";
                            const buffer = Buffer.from(base64, "base64");
                            segmentedImageUrl = saveBufferAsImage(buffer, ext, protocol, host);
                        } else {
                            // try treating as remote URL
                            try {
                                const fetched = await fetch(rawOut);
                                if (fetched.ok) {
                                    const ab = await fetched.arrayBuffer();
                                    const buffer = Buffer.from(ab);
                                    const extFromPath =
                                        path.extname(new URL(rawOut).pathname).replace(".", "") || "png";
                                    segmentedImageUrl = saveBufferAsImage(buffer, extFromPath, protocol, host);
                                }
                            } catch (e) {
                                console.warn("Unable to fetch string URL returned by Gradio /process_image:", e);
                            }
                        }
                    } else if (rawOut.startsWith("http://") || rawOut.startsWith("https://")) {
                        try {
                            const fetched = await fetch(rawOut);
                            if (fetched.ok) {
                                const ab = await fetched.arrayBuffer();
                                const buffer = Buffer.from(ab);
                                const extFromPath =
                                    path.extname(new URL(rawOut).pathname).replace(".", "") || "png";
                                segmentedImageUrl = saveBufferAsImage(buffer, extFromPath, protocol, host);
                            }
                        } catch (e) {
                            console.warn("Error fetching remote segmented image URL:", e);
                        }
                    } else {
                        // maybe base64 without data prefix
                        const maybeBase64 = rawOut.replace(/\s/g, "");
                        const isBase64 = /^[A-Za-z0-9+/=]+$/.test(maybeBase64);
                        if (isBase64 && maybeBase64.length > 100) {
                            const buffer = Buffer.from(maybeBase64, "base64");
                            segmentedImageUrl = saveBufferAsImage(buffer, "png", protocol, host);
                        } else {
                            console.warn("Unrecognized Gradio /process_image string output; saving as diagnostic.");
                            const buffer = Buffer.from(rawOut, "utf8");
                            segmentedImageUrl = saveBufferAsImage(buffer, "txt", protocol, host);
                        }
                    }
                } else if (rawOut instanceof ArrayBuffer || ArrayBuffer.isView(rawOut)) {
                    const buffer = Buffer.from(rawOut);
                    segmentedImageUrl = saveBufferAsImage(buffer, "png", protocol, host);
                } else if (rawOut && typeof rawOut === "object") {
                    // Gradio FileData-like object: prefer .url
                    const candidateUrl = rawOut.url || rawOut.link || rawOut.path || rawOut.file;
                    if (candidateUrl && (candidateUrl.startsWith("http://") || candidateUrl.startsWith("https://"))) {
                        try {
                            const fetched = await fetch(candidateUrl);
                            if (fetched.ok) {
                                const ab = await fetched.arrayBuffer();
                                const buffer = Buffer.from(ab);
                                const extFromPath =
                                    path.extname(new URL(candidateUrl).pathname).replace(".", "") || "png";
                                segmentedImageUrl = saveBufferAsImage(buffer, extFromPath, protocol, host);
                            }
                        } catch (e) {
                            console.warn("Error fetching Gradio file URL:", e);
                        }
                    } else if (rawOut.path && typeof rawOut.path === "string") {
                        console.warn("Gradio returned a server-local path for segmented image:", rawOut.path);
                        const diagnostic = JSON.stringify(rawOut);
                        segmentedImageUrl = saveBufferAsImage(Buffer.from(diagnostic, "utf8"), "txt", protocol, host);
                    } else {
                        const diagnostic = JSON.stringify(rawOut);
                        segmentedImageUrl = saveBufferAsImage(Buffer.from(diagnostic, "utf8"), "txt", protocol, host);
                    }
                } else {
                    const diag = JSON.stringify(rawOut || {});
                    segmentedImageUrl = saveBufferAsImage(Buffer.from(diag, "utf8"), "txt", protocol, host);
                }

                // attach segmentedImageUrl to the asset subdoc and save
                if (segmentedImageUrl) {
                    console.log("[create] segmentedImageUrl saved:", segmentedImageUrl);
                    // reload fresh user and set meta
                    const freshUser = await User.findById(uid);
                    const sub = (freshUser.assets || []).id(assetId);
                    if (sub) {
                        sub.meta = sub.meta || {};
                        sub.meta.segmentedImage = segmentedImageUrl;
                        await freshUser.save();
                        console.log("[create] asset updated with segmentedImage in DB");
                    } else {
                        createdAsset.meta = createdAsset.meta || {};
                        createdAsset.meta.segmentedImage = segmentedImageUrl;
                        await user.save();
                        console.log("[create] fallback asset updated with segmentedImage in DB");
                    }
                }
            } catch (grErr) {
                console.error("Gradio /process_image error:", grErr);
            }

            // Return immediately to frontend with segmentedImageUrl (if produced)
            // so frontend can display segmented image as soon as segmentation completes.
            const immediateResponse = {
                message: "Image uploaded successfully",
                imagePath,
                imageUrl,
                seed: providedSeed ?? null,
                assetId,
                segmentedImageUrl: segmentedImageUrl || null,
            };

            // send response now (frontend can show segmented image). The 3D processing continues.
            res.json(immediateResponse);

            // ========== BACKGROUND: continue 3D processing (fire-and-forget) ==========
            (async () => {
                try {
                    // Determine seed for 3D (call /get_random_seed)
                    let seedFor3d = providedSeed;
                    try {
                        console.log("[bg] calling /get_random_seed (providedSeed):", providedSeed, "randomize_seed:", !!randomize_seed);
                        const { Client } = await import("@gradio/client");
                        const GRADIO_URL = "https://474f55c971fdba7789.gradio.live/";
                        const client = await Client.connect(GRADIO_URL);

                        const seedRes = await client.predict("/get_random_seed", {
                            randomize_seed: !!randomize_seed,
                            seed: typeof providedSeed === "number" && !isNaN(providedSeed) ? providedSeed : 0,
                        });
                        const seedOut = Array.isArray(seedRes?.data) ? seedRes.data[0] : seedRes?.data;
                        console.log("[bg] /get_random_seed returned:", seedOut);
                        if (typeof seedOut === "number" || (typeof seedOut === "string" && /^\d+$/.test(seedOut))) {
                            seedFor3d = Number(seedOut);
                        } else {
                            if (seedFor3d == null) seedFor3d = 0;
                        }
                    } catch (seedErr) {
                        console.warn("Gradio /get_random_seed failed, continuing with provided seed:", seedErr);
                        if (seedFor3d == null) seedFor3d = providedSeed ?? 0;
                    }

                    // Call /process_3d
                    let glbUrl = null;
                    try {
                        console.log("[bg] preparing to call /process_3d with seed:", seedFor3d);
                        const { Client } = await import("@gradio/client");
                        const GRADIO_URL = "https://474f55c971fdba7789.gradio.live/";
                        const client = await Client.connect(GRADIO_URL);

                        // choose segmented image local path if available and valid image, else use original upload
                        let segLocalPath = null;
                        if (segmentedImageUrl) {
                            try {
                                const filename = path.basename(new URL(segmentedImageUrl).pathname);
                                segLocalPath = path.join(imagesDir, filename);
                            } catch {
                                segLocalPath = null;
                            }
                        }
                        // fallback to original uploaded file
                        if (!segLocalPath || !fs.existsSync(segLocalPath)) {
                            segLocalPath = path.join(imagesDir, req.file.filename);
                        }

                        console.log("[bg] segLocalPath for process_3d:", segLocalPath, "exists:", fs.existsSync(segLocalPath));
                        const segBuffer = fs.readFileSync(segLocalPath);
                        console.log("[bg] segBuffer size:", segBuffer.length);
                        const detected = detectMimeFromBuffer(segBuffer);
                        console.log("[bg] detected mime for segBuffer:", detected);

                        if (!detected || !detected.mime.startsWith("image/")) {
                            console.warn("segment buffer is not recognized as image. Falling back to uploaded image.");
                            const origPath = path.join(imagesDir, req.file.filename);
                            const origBuf = fs.readFileSync(origPath);
                            const origDetected = detectMimeFromBuffer(origBuf);
                            if (!origDetected || !origDetected.mime.startsWith("image/")) {
                                console.error("Neither segmented nor original is a valid image. Aborting 3D processing.");
                                const freshUser3 = await User.findById(uid);
                                const sub3 = (freshUser3.assets || []).id(assetId);
                                if (sub3) {
                                    sub3.status = sub3.status || "pending";
                                    await freshUser3.save();
                                }
                                return;
                            } else {
                                var bufferToSend = origBuf;
                                var mimeToSend = origDetected.mime;
                            }
                        } else {
                            var bufferToSend = segBuffer;
                            var mimeToSend = detected.mime;
                        }

                        // If segmented image is WebP and sharp is available, convert to PNG to improve compatibility
                        if (detected && detected.ext === "webp") {
                            if (sharp) {
                                try {
                                    console.log("[bg] converting segmented WebP -> PNG using sharp (improve 3D input)...");
                                    const pngBuf = await sharp(bufferToSend).png().toBuffer();
                                    bufferToSend = pngBuf;
                                    mimeToSend = "image/png";
                                    console.log("[bg] conversion done. png size:", bufferToSend.length);
                                } catch (convErr) {
                                    console.warn("[bg] sharp conversion failed; using original WebP buffer:", convErr);
                                    // Keep bufferToSend as original segBuffer
                                }
                            } else {
                                console.log("[bg] sharp not available; sending WebP as-is (consider installing sharp)");
                            }
                        }

                        // prepare blob-like object
                        let blobForGradio;
                        try {
                            blobForGradio = new Blob([bufferToSend], { type: mimeToSend });
                            console.log("[bg] using Blob for /process_3d, mime:", mimeToSend);
                        } catch (e) {
                            blobForGradio = bufferToSend;
                            console.log("[bg] Blob not available for /process_3d; using Buffer, mime:", mimeToSend);
                        }

                        // Build payload (allow overrides via incoming req.body)
                        const payload = {
                            input_image: blobForGradio,
                            num_steps: Number(req.body.num_steps ?? num_steps),
                            cfg_scale: Number(req.body.cfg_scale ?? cfg_scale),
                            grid_res: Number(req.body.grid_res ?? grid_res),
                            seed: Number(seedFor3d ?? 0),
                            simplify_mesh:
                                typeof req.body.simplify_mesh !== "undefined"
                                    ? req.body.simplify_mesh === "false" || req.body.simplify_mesh === false
                                    : simplify_mesh,
                            target_num_faces: Number(req.body.target_num_faces ?? target_num_faces),
                        };

                        console.log("[bg] Calling Gradio /process_3d with payload (seed/num_steps/grid_res/cfg/mesh/faces):", {
                            seed: payload.seed,
                            num_steps: payload.num_steps,
                            grid_res: payload.grid_res,
                            cfg_scale: payload.cfg_scale,
                            simplify_mesh: payload.simplify_mesh,
                            target_num_faces: payload.target_num_faces,
                        });

                        const proc3dRes = await client.predict("/process_3d", payload);
                        const raw3d = Array.isArray(proc3dRes?.data) ? proc3dRes.data[0] : proc3dRes?.data;
                        console.log("[bg] /process_3d returned type:", typeof raw3d);

                        // Normalize GLB output
                        if (typeof raw3d === "string") {
                            if (raw3d.startsWith("data:")) {
                                const m = raw3d.match(/^data:(.+);base64,(.+)$/);
                                if (m) {
                                    const mime = m[1];
                                    const base64 = m[2];
                                    const ext = mime.split("/")[1].split("+")[0] || "glb";
                                    const buffer = Buffer.from(base64, "base64");
                                    console.log("[bg] Received base64 GLB, bytes:", buffer.length, "header:", buffer.slice(0, 4).toString());
                                    glbUrl = saveBufferAsGlb(buffer, ext, protocol, host);
                                    if (buffer.slice(0, 4).toString() !== "glTF") console.warn("Saved GLB missing glTF header");
                                } else {
                                    try {
                                        const fetched = await fetch(raw3d);
                                        if (fetched.ok) {
                                            const ab = await fetched.arrayBuffer();
                                            const buffer = Buffer.from(ab);
                                            const extFromPath =
                                                path.extname(new URL(raw3d).pathname).replace(".", "") || "glb";
                                            console.log("[bg] downloaded GLB size:", buffer.length, "header:", buffer.slice(0, 4).toString());
                                            glbUrl = saveBufferAsGlb(buffer, extFromPath, protocol, host);
                                            if (buffer.slice(0, 4).toString() !== "glTF") console.warn("Downloaded GLB missing glTF header");
                                        }
                                    } catch (e) {
                                        console.warn("Unable to handle string output from Gradio /process_3d:", e);
                                    }
                                }
                            } else if (raw3d.startsWith("http://") || raw3d.startsWith("https://")) {
                                try {
                                    const fetched = await fetch(raw3d);
                                    if (fetched.ok) {
                                        const ab = await fetched.arrayBuffer();
                                        const buffer = Buffer.from(ab);
                                        const extFromPath =
                                            path.extname(new URL(raw3d).pathname).replace(".", "") || "glb";
                                        console.log("[bg] downloaded remote GLB size:", buffer.length, "header:", buffer.slice(0, 4).toString());
                                        glbUrl = saveBufferAsGlb(buffer, extFromPath, protocol, host);
                                        if (buffer.slice(0, 4).toString() !== "glTF") console.warn("Downloaded GLB missing glTF header");
                                    }
                                } catch (e) {
                                    console.warn("Error fetching remote GLB URL:", e);
                                }
                            } else {
                                const maybeBase64 = raw3d.replace(/\s/g, "");
                                const isBase64 = /^[A-Za-z0-9+/=]+$/.test(maybeBase64);
                                if (isBase64 && maybeBase64.length > 100) {
                                    const buffer = Buffer.from(maybeBase64, "base64");
                                    console.log("[bg] GLB (base64) bytes:", buffer.length, "header:", buffer.slice(0, 4).toString());
                                    glbUrl = saveBufferAsGlb(buffer, "glb", protocol, host);
                                    if (buffer.slice(0, 4).toString() !== "glTF") console.warn("GLB (base64) missing glTF header");
                                } else {
                                    console.warn("Unrecognized Gradio /process_3d string output; saving diagnostic.");
                                }
                            }
                        } else if (raw3d instanceof ArrayBuffer || ArrayBuffer.isView(raw3d)) {
                            const buffer = Buffer.from(raw3d);
                            console.log("[bg] GLB buffer bytes:", buffer.length, "header:", buffer.slice(0, 4).toString());
                            glbUrl = saveBufferAsGlb(buffer, "glb", protocol, host);
                            if (buffer.slice(0, 4).toString() !== "glTF") console.warn("GLB buffer missing glTF header");
                        } else if (raw3d && typeof raw3d === "object") {
                            const candidateUrl = raw3d.url || raw3d.link || raw3d.path || raw3d.file;
                            if (candidateUrl && (candidateUrl.startsWith("http://") || candidateUrl.startsWith("https://"))) {
                                try {
                                    const fetched = await fetch(candidateUrl);
                                    if (fetched.ok) {
                                        const ab = await fetched.arrayBuffer();
                                        const buffer = Buffer.from(ab);
                                        const extFromPath =
                                            path.extname(new URL(candidateUrl).pathname).replace(".", "") || "glb";
                                        console.log("[bg] downloaded GLB from object.url bytes:", buffer.length, "header:", buffer.slice(0, 4).toString());
                                        glbUrl = saveBufferAsGlb(buffer, extFromPath, protocol, host);
                                        if (buffer.slice(0, 4).toString() !== "glTF") console.warn("Downloaded GLB missing glTF header");
                                    }
                                } catch (e) {
                                    console.warn("Error fetching GLB from Gradio file URL:", e);
                                }
                            } else {
                                const diag = JSON.stringify(raw3d);
                                saveBufferAsImage(Buffer.from(diag, "utf8"), "txt", protocol, host);
                                console.warn("Gradio /process_3d returned an object; saved diagnostic.");
                            }
                        } else {
                            console.warn("Unrecognized /process_3d output:", raw3d);
                        }

                        // Attach GLB to asset and mark ready
                        if (glbUrl) {
                            const freshUser2 = await User.findById(uid);
                            const sub2 = (freshUser2.assets || []).id(assetId);
                            if (sub2) {
                                sub2.glbUrl = glbUrl;
                                sub2.status = "ready";
                                sub2.updatedAt = new Date();
                                sub2.generatedAt = new Date();
                                await freshUser2.save();
                                console.log("Asset updated with GLB:", glbUrl);
                            } else {
                                // fallback
                                createdAsset.glbUrl = glbUrl;
                                createdAsset.status = "ready";
                                createdAsset.updatedAt = new Date();
                                createdAsset.generatedAt = new Date();
                                await user.save();
                                console.log("Fallback: user object updated with GLB.");
                            }
                        } else {
                            console.warn("No GLB produced by Gradio /process_3d.");
                        }
                    } catch (gr3DErr) {
                        console.error("Gradio /process_3d error:", gr3DErr);
                    }
                } catch (bgErr) {
                    console.error("Background 3D processing error:", bgErr);
                }
            })(); // end background IIFE

            // end main try
        } catch (error) {
            console.error("Upload error:", error);
            // If response hasn't been sent yet, send 500
            if (!res.headersSent) {
                return res.status(500).json({ error: "Server error during upload" });
            }
        }
    });
});

module.exports = router;
