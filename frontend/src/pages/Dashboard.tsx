import { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import ImageModal from "@/components/ImageModal";
import GLBViewerD from "@/components/GLBViewerD";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import PixelStars from "@/components/PixelStars";

interface Asset {
  _id?: string;
  id?: string;
  imageUrl: string;
  glbUrl?: string;
  status: "processing" | "ready" | "failed";
  createdAt?: string;
  updatedAt?: string;
  generatedAt?: string;
}

interface AssetsResponse {
  assets: Asset[];
}

export default function Dashboard() {
  const { user, token } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalImage, setModalImage] = useState<string | null>(null);
  const navigate = useNavigate();

  // which asset menu is open (asset._id string) or null
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAssets() {
      setLoading(true);
      try {
        const res = await axios.get<AssetsResponse>("http://localhost:5000/api/assets", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setAssets(res.data.assets || []);
      } catch (err) {
        console.error("Error fetching assets:", err);
      } finally {
        setLoading(false);
      }
    }

    if (token) fetchAssets();
  }, [token]);

  // Close menu when clicking outside any asset card
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      // if click not inside an asset card, close open menu
      if (!(e.target as HTMLElement).closest(".asset-card")) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function handleAddClick() {
    navigate("/create");
  }

  function toggleMenu(assetId: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    setOpenMenuId((prev) => (prev === assetId ? null : assetId));
  }

  function formatDate(d?: string) {
    if (!d) return "Unknown";
    try {
      const dt = new Date(d);
      return dt.toLocaleString();
    } catch {
      return String(d);
    }
  }

  // helper to extract a stable id to send to backend
  function getAssetId(a: Asset): string | null {
    // Prefer Mongo subdocument _id (most reliable). If not present, fall back to `id`.
    if (a && (a._id || a.id)) {
      return String(a._id || a.id);
    }
    return null;
  }

  async function handleDeleteAsset(asset: Asset) {
    const assetId = getAssetId(asset);
    if (!assetId) {
      alert("Cannot delete: asset has no ID on the server.");
      return;
    }

    const ok = window.confirm("Delete this asset (image + 3D)? This cannot be undone.");
    if (!ok) return;

    try {
      await axios.delete(`http://localhost:5000/api/assets/${encodeURIComponent(assetId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // remove from UI
      setAssets((prev) => prev.filter((a) => (String(a._id || a.id) !== assetId)));
      setOpenMenuId(null);
    } catch (err: any) {
      console.error("Failed to delete asset:", err);
      // show helpful message if server returned 404 (asset not found)
      if (err.response?.status === 404) {
        alert("Delete failed: asset not found on server (it may already be removed).");
      } else {
        alert("Failed to delete. Check console for details.");
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-space-bg relative overflow-hidden">
        <PixelStars />
        <Navbar />
        <div className="card relative z-10" style={{ maxWidth: 900, margin: "40px auto" }}>
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-space-bg relative overflow-hidden">
      <PixelStars />
      <Navbar />
      <div className="relative z-10" style={{ maxWidth: 1000, margin: "24px auto" }}>
        <div className="dashboard-header">
          <h1 className="dashboard-title">Objects</h1>

          <div className="top-controls">
            <div
              className="plus-box"
              title="Generate new object"
              onClick={handleAddClick}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleAddClick();
                }
              }}
            >
              +
              <div className="tooltip">Generate new object</div>
            </div>
          </div>
        </div>

        <div className="assets-wrap">
          {assets.length === 0 ? (
            <div className="card empty-placeholder">No objects yet — click +</div>
          ) : (
            assets.map((a) => {
              const id = getAssetId(a) || String(a.createdAt || a.updatedAt || Math.random());
              const generatedAt = a.generatedAt || a.createdAt || a.updatedAt;
              return (
                <div
                  className="asset-card"
                  key={id}
                  data-asset-id={id}
                  onClick={() => setOpenMenuId(null)}
                >
                  {/* menu container (top-right inside the wrapping card, outside the viewer) */}
                  <div className="asset-card-menu">
                    <button
                      className="asset-menu-btn"
                      aria-haspopup="true"
                      aria-expanded={openMenuId === id}
                      onClick={(e) => toggleMenu(id, e)}
                      title="More"
                    >
                      ⋮
                    </button>

                    {openMenuId === id && (
                      <div
                        className="asset-menu-dropdown"
                        role="menu"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Info: show the formatted generated date directly so user doesn't have to hover */}
                        <div className="asset-menu-item info" role="menuitem" tabIndex={0}>
                          <div>
                            <div style={{ fontWeight: 600 }}>Info</div>
                            <div style={{ marginTop: 6, fontSize: 13, color: "var(--muted)" }}>
                              {formatDate(generatedAt)}
                            </div>
                          </div>
                        </div>

                        <div
                          className="asset-menu-item danger"
                          role="menuitem"
                          tabIndex={0}
                          onClick={() => handleDeleteAsset(a)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              handleDeleteAsset(a);
                            }
                          }}
                        >
                          Delete
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="asset-row">
                    <div className="asset-left">
                      <div
                        className="asset-image-square"
                        onClick={() => setModalImage(a.imageUrl)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            setModalImage(a.imageUrl);
                          }
                        }}
                      >
                        <img src={a.imageUrl} alt="asset thumbnail" />
                      </div>
                    </div>

                    <div className="asset-right">
                      {a.status === "ready" && a.glbUrl ? (
                        <div className="glb-box">
                          <GLBViewerD src={a.glbUrl} alt="3D model preview" />
                        </div>
                      ) : (
                        <div className="glb-placeholder">
                          {a.status === "processing" ? "Processing..." : "No 3D model yet"}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {modalImage && <ImageModal src={modalImage} onClose={() => setModalImage(null)} />}
      </div>
    </div>
  );
}
