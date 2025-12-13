import { useRef, useState, useEffect } from "react";
import GLBViewer from "@/components/GLBViewer";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/context/AuthContext";
import PixelStars from "@/components/PixelStars";

const SEED_MAX = 2147483647;

interface PollResult {
  segmented: string | null;
  glb: string | null;
  asset: any;
}

interface UploadResponse {
  message?: string;
  imagePath?: string;
  imageUrl?: string;
  seed?: number;
  assetId?: string;
  segmentedImageUrl?: string;
  glbUrl?: string;
}

interface AssetResponse {
  asset?: {
    meta?: {
      segmentedImage?: string;
    };
    glbUrl?: string;
  };
  meta?: {
    segmentedImage?: string;
  };
  glbUrl?: string;
}

export default function Create() {
  const { token } = useAuth();

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [seed, setSeed] = useState("");
  const [useRandomSeed, setUseRandomSeed] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  const [glbFile, setGlbFile] = useState<File | null>(null);
  const [glbUrl, setGlbUrl] = useState<string | null>(null);

  // Middle box (segmented image)
  const [processedImage, setProcessedImage] = useState<string | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const glbInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      if (glbUrl) URL.revokeObjectURL(glbUrl);
      // processedImage is a server URL (no revoke)
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onImageSelect(file: File) {
    if (!file) return;
    setImageFile(file);
    const url = URL.createObjectURL(file);
    setImagePreview(url);
    setGlbUrl(null);
    setProcessedImage(null);
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files && e.target.files[0];
    if (f) onImageSelect(f);
  }

  function handleImageDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith("image/")) onImageSelect(f);
  }

  function handleDragOver(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleClearImageInBox(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
    setProcessedImage(null);
    setGlbUrl(null);
  }

  function handleGLBChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;

    try {
      const normalized = new Blob([f], { type: "model/gltf-binary" });
      const url = URL.createObjectURL(normalized);
      if (glbUrl) URL.revokeObjectURL(glbUrl);
      setGlbFile(f);
      setGlbUrl(url);
    } catch (err) {
      console.warn("GLB wrap failed, falling back to original file:", err);
      const url = URL.createObjectURL(f);
      if (glbUrl) URL.revokeObjectURL(glbUrl);
      setGlbFile(f);
      setGlbUrl(url);
    }
  }

  function handleUploadGLBClick() {
    if (glbInputRef.current) glbInputRef.current.click();
  }

  function handleSeedInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    if (val === "") {
      setSeed("");
      setUseRandomSeed(true);
    } else {
      const num = Math.max(0, Math.min(SEED_MAX, Number(val)));
      setSeed(String(num));
      setUseRandomSeed(false);
    }
  }

  function handleSliderChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setSeed(String(val));
    setUseRandomSeed(false);
  }

  function handleClearSeed(e?: React.MouseEvent<HTMLButtonElement>) {
    e?.preventDefault();
    setSeed("");
    setUseRandomSeed(true);
  }

  function handleRemoveGLB(e?: React.MouseEvent<HTMLButtonElement>) {
    e?.preventDefault();
    if (glbUrl) URL.revokeObjectURL(glbUrl);
    setGlbFile(null);
    setGlbUrl(null);
  }

  // Poll helper: fetch asset until segmentedImage or glbUrl available (or both)
  async function pollForAsset(
    assetId: string,
    needSegmented = true,
    needGlb = true,
    maxAttempts = 30,
    intervalMs = 2000
  ): Promise<PollResult | null> {
    if (!assetId) return null;
    const url = `http://localhost:5000/api/assets/${encodeURIComponent(assetId)}`;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const resp = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });
        if (!resp.ok) {
          // for authentication errors, stop
          if (resp.status === 401 || resp.status === 403) {
            console.error("Auth error while polling asset:", resp.status);
            return null;
          }
          // other errors we'll ignore and continue polling
        } else {
          const data: AssetResponse = await resp.json();
          const asset = data.asset || data;
          const segmented = asset?.meta?.segmentedImage || null;
          const glb = asset?.glbUrl || null;

          // If both required and present -> return
          if (needSegmented && needGlb) {
            if (segmented && glb) return { segmented, glb, asset };
          } else if (needSegmented && segmented) {
            return { segmented, glb, asset };
          } else if (needGlb && glb) {
            return { segmented, glb, asset };
          } else if (!needSegmented && !needGlb) {
            return { segmented, glb, asset };
          }
        }
      } catch (err) {
        console.warn("Polling error (ignored):", err);
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return null;
  }

  // PART 1: Upload image to backend, then show segmented image and (eventually) GLB
  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();

    if (!imageFile) {
      alert("Please upload an input image first.");
      return;
    }

    setIsGenerating(true);

    // Decide seed
    let finalSeed: number;
    if (useRandomSeed) {
      finalSeed = Math.floor(Math.random() * (SEED_MAX + 1));
    } else {
      finalSeed = seed === "" ? 0 : Number(seed);
    }

    const formData = new FormData();
    formData.append("image", imageFile);
    formData.append("seed", String(finalSeed));
    // You can send other 3d params if UI exposes them:
    // formData.append("num_steps", "1");

    try {
      const response = await fetch("http://localhost:5000/api/create/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text();
        console.error("Upload failed:", text);
        alert("Failed to upload image. See console for details.");
        setIsGenerating(false);
        return;
      }

      const data: UploadResponse = await response.json();
      console.log("Upload response:", data);
      // backend returns { message, imagePath, imageUrl, seed, assetId, segmentedImageUrl, glbUrl }
      const { segmentedImageUrl, glbUrl: returnedGlbUrl, assetId } = data;

      // If backend immediately returned segmented image, show it
      if (segmentedImageUrl) {
        setProcessedImage(segmentedImageUrl);
      }

      // If backend immediately returned GLB, show it
      if (returnedGlbUrl) {
        setGlbUrl(returnedGlbUrl);
        setIsGenerating(false);
        return;
      }

      // Otherwise, poll for results (first segmented image, then GLB)
      if (assetId) {
        // First try to get segmented image (but allow it to also return glb if ready)
        const foundSeg = await pollForAsset(assetId, true, false, 20, 2000);
        if (foundSeg && foundSeg.segmented) {
          setProcessedImage(foundSeg.segmented);
        }

        // Next poll for GLB (asset.glbUrl). This may take longer.
        const foundGlb = await pollForAsset(assetId, false, true, 60, 3000); // ~3min max
        if (foundGlb && foundGlb.glb) {
          setGlbUrl(foundGlb.glb);
        } else {
          if (!foundGlb) {
            console.warn("Timed out waiting for GLB. You can check asset status later.");
          }
        }
      } else {
        console.warn("No assetId returned; cannot poll for results.");
      }
    } catch (err) {
      console.error("Upload error:", err);
      alert("Upload error. Check console.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="min-h-screen bg-space-bg relative overflow-hidden">
      <PixelStars />
      <Navbar />
      <div className="create-page card relative z-10" style={{ maxWidth: 1400, margin: "32px auto", padding: 18 }}>
        <div className="create-grid">
          {/* BOX 1: Input Image Upload */}
          <div className="left-col">
            <label
              className={`image-drop ${isDragging ? "dragging" : ""}`}
              onDrop={handleImageDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              htmlFor="imageInput"
              role="button"
              tabIndex={0}
            >
              {imagePreview ? (
                <>
                  <img src={imagePreview} alt="Selected input" />
                  <button
                    type="button"
                    className="image-clear-btn"
                    onClick={handleClearImageInBox}
                    aria-label="Clear selected image"
                    title="Clear image"
                  >
                    ×
                  </button>
                </>
              ) : (
                <div className="drop-inner">
                  <div className="drop-text">Drop an image here<br />or click to upload</div>
                  <small className="muted">PNG / JPG recommended</small>
                </div>
              )}
              <input
                ref={imageInputRef}
                id="imageInput"
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleImageChange}
              />
            </label>

            {/* Seed controls */}
            <div className="seed-row">
              <div className="seed-top">
                <label className="seed-random">
                  <input
                    type="checkbox"
                    checked={useRandomSeed}
                    onChange={(e) => setUseRandomSeed(e.target.checked)}
                  />{" "}
                  Random seed
                </label>

                <div className="seed-actions">
                  <input
                    type="number"
                    className="seed-input"
                    value={seed}
                    onChange={handleSeedInputChange}
                    disabled={useRandomSeed}
                    min="0"
                    max={SEED_MAX}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    title="Clear seed (enable random)"
                    onClick={handleClearSeed}
                  >
                    ↺
                  </button>
                </div>
              </div>

              <div className="seed-slider-row">
                <input
                  type="range"
                  min="0"
                  max={SEED_MAX}
                  step="1"
                  className="seed-slider"
                  value={seed === "" ? 0 : Number(seed)}
                  onChange={handleSliderChange}
                  disabled={useRandomSeed}
                  aria-label="Seed slider"
                />
                <div className="seed-value">{seed === "" ? "—" : seed}</div>
              </div>
            </div>

            <div className="left-actions">
              <button className="btn" onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating ? "Uploading…" : "Generate"}
              </button>
            </div>

            <input
              ref={glbInputRef}
              type="file"
              accept=".glb,model/gltf-binary,application/octet-stream"
              style={{ display: "none" }}
              onChange={handleGLBChange}
            />
          </div>

          {/* BOX 2: Middle - Processed Image */}
          <div className="middle-col">
            <div className="processed-box">
              {processedImage ? (
                <div style={{ width: "100%", height: "100%", position: "relative" }}>
                  <img src={processedImage} alt="Processed output" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  <div style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    display: "flex",
                    gap: 8,
                    pointerEvents: "auto"
                  }}>
                    <a href={processedImage} download style={{
                      background: "rgba(0,0,0,0.6)",
                      color: "#fff",
                      padding: "6px 10px",
                      borderRadius: 8,
                      textDecoration: "none",
                      fontSize: 14
                    }}>
                      ⤓
                    </a>
                    <button
                      type="button"
                      onClick={() => { setProcessedImage(null); }}
                      style={{
                        background: "rgba(0,0,0,0.6)",
                        color: "#fff",
                        padding: "6px 10px",
                        borderRadius: 8,
                        border: "none",
                        fontSize: 14,
                        cursor: "pointer"
                      }}
                      title="Clear processed image"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ) : (
                <div className="drop-inner">
                  <div className="drop-text">{isGenerating ? "Waiting for segmented image…" : "Processed image will appear here"}</div>
                  <small className="muted">Awaiting API response</small>
                </div>
              )}
            </div>
          </div>

          {/* BOX 3: GLB Viewer */}
          <div className="right-col">
            <div className="viewer-card">
              {glbUrl ? (
                <>
                  <div className="viewer-top">
                    <div className="viewer-meta">
                      <div className="muted small">Preview</div>
                      <div className="small">Generated 3D model</div>
                    </div>
                    <div className="viewer-actions" aria-hidden />
                  </div>

                  <div className="viewer-area">
                    <div className="viewer-controls">
                      <a
                        className="viewer-control-btn"
                        href={glbUrl}
                        download={glbFile?.name || "model.glb"}
                        title="Download .glb"
                      >
                        ⤓
                      </a>
                      <button
                        type="button"
                        className="viewer-control-btn"
                        onClick={handleRemoveGLB}
                        title="Remove .glb"
                      >
                        ×
                      </button>
                    </div>
                    <GLBViewer src={glbUrl} alt="Generated 3D model" />
                  </div>
                </>
              ) : (
                <div className="viewer-empty">
                  <div className="drop-inner">
                    <div className="drop-text">{isGenerating ? "Waiting for 3D model…" : "3D model will appear here"}</div>
                    <small className="muted">Awaiting generation</small>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
