import { useEffect, useRef, useState } from "react";
// Use the dist build to avoid some bundler/registration edge-cases
import "@google/model-viewer/dist/model-viewer";

interface GLBViewerDProps {
    src: string;
    alt?: string;
}

// Extend the JSX namespace to include model-viewer custom element
declare global {
    namespace JSX {
        interface IntrinsicElements {
            'model-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
                src?: string;
                alt?: string;
                'auto-rotate'?: boolean;
                'camera-controls'?: boolean;
                'reveal'?: string;
                'exposure'?: string;
                'shadow-intensity'?: string;
                'interaction-prompt'?: string;
                'interaction-prompt-style'?: string;
                'disable-gesture-prompts'?: boolean;
                ref?: React.Ref<any>;
            }, HTMLElement>;
        }
    }
}

export default function GLBViewerD({ src, alt }: GLBViewerDProps) {
    const mvRef = useRef<any>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const el = mvRef.current;
        if (!el) return;

        function onLoad(ev: Event) {
            setError(null);
            console.log("[model-viewer] load event — model should be visible", { src });
            // try to nudge camera/exposure so model isn't off-screen or too dark
            try {
                el.setAttribute("camera-orbit", "0deg 75deg 2m");
                el.setAttribute("exposure", "1.05");
                if (typeof el.jumpCameraToGoal === "function") {
                    el.jumpCameraToGoal();
                }
            } catch (err) {
                console.warn("[model-viewer] camera nudges failed:", err);
            }
        }

        function onProgress(ev: Event) {
            // optional: show progress in future
            // console.log("[model-viewer] progress", ev?.detail);
        }

        function onError(ev: any) {
            console.error("[model-viewer] error event:", ev, "element.error:", el?.error);
            // prefer a readable message
            const msg = ev?.detail?.message || el?.error || "Failed to load model";
            setError(String(msg));
        }

        el.addEventListener("load", onLoad);
        el.addEventListener("progress", onProgress);
        el.addEventListener("error", onError);

        return () => {
            el.removeEventListener("load", onLoad);
            el.removeEventListener("progress", onProgress);
            el.removeEventListener("error", onError);
        };
    }, [src]);

    // If src changes, explicitly set attribute and call .load() to force re-decoding for blob URLs
    useEffect(() => {
        const el = mvRef.current;
        if (!el) return;

        if (!src) {
            try { el.removeAttribute("src"); } catch { }
            return;
        }

        try {
            el.setAttribute("src", src);
            if (typeof el.load === "function") {
                // call load() and catch rejection to surface it
                el.load().catch((err: any) => {
                    console.error("[model-viewer] load() rejected:", err);
                    setError(String(err?.message || err));
                });
            }
        } catch (err: any) {
            console.error("[GLBViewerD] setting src/load failed:", err);
            setError(String(err?.message || err));
        }
    }, [src]);

    return (
        <div style={{ width: "100%", height: "100%", position: "relative" }}>
            {error && (
                <div style={{
                    position: "absolute",
                    top: 12,
                    left: 12,
                    zIndex: 40,
                    pointerEvents: "none",
                    color: "#ffb3b3",
                    background: "rgba(20,10,10,0.35)",
                    padding: 8,
                    borderRadius: 6,
                }}>
                    {String(error)}
                </div>
            )}

            <model-viewer
                ref={mvRef}
                src={src || ""}
                alt={alt || "3D model"}
                auto-rotate
                camera-controls
                reveal="auto"
                exposure="1"
                shadow-intensity="1"
                interaction-prompt="none"
                interaction-prompt-style="none"
                disable-gesture-prompts
                style={{
                    width: "100%",
                    height: "100%",
                    background: "transparent",
                    "--interaction-prompt-opacity": 0
                } as React.CSSProperties}
            />
        </div>
    );
}
