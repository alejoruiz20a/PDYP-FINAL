import { useCallback, useEffect, useRef, useState } from "react";
import { sendCommand, emergencyStop, getCameraConfig, getHistory } from "./lib/api.js";

const ACTION_LABEL = {
  forward: "Avanzar",
  backward: "Retroceder",
  left: "Girar izquierda",
  right: "Girar derecha",
  stop: "Detener",
};

const ACTION_GLYPH = {
  forward: "↑",
  backward: "↓",
  left: "↺",
  right: "↻",
  stop: "■",
};

function CameraPlaceholder() {
  return (
    <div className="camera-placeholder">
      <div className="camera-placeholder-icon">
        <svg viewBox="0 0 24 24">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      </div>
      <div className="camera-placeholder-text">Vista de la cámara no disponible</div>
    </div>
  );
}

function CameraView({ cameraUrl, feedTs, cameraError, onConfigClick, onFeedError }) {
  const src = cameraUrl
    ? `${cameraUrl}${cameraUrl.includes("?") ? "&" : "?"}t=${feedTs}`
    : "";

  return (
    <section className="camera-section">
      <div className={`camera-frame${cameraUrl ? " has-feed" : ""}${cameraError ? " feed-error" : ""}`}>
        {cameraUrl ? (
          <img
            className="camera-feed"
            src={src}
            alt="Vista de la cámara frontal"
            onError={() => onFeedError(true)}
            onLoad={() => onFeedError(false)}
          />
        ) : (
          <CameraPlaceholder />
        )}
        <div className="live-badge">
          <span className={`live-badge-dot${cameraUrl && !cameraError ? "" : " offline"}`} />
          {cameraUrl ? (cameraError ? "SIN SEÑAL" : "EN VIVO") : "SIN SEÑAL"}
        </div>
        {!cameraUrl && <div className="no-feed-hint">Conectá tu cámara IP para ver lo que ve el carrito</div>}
        <button className="camera-config-btn" onClick={onConfigClick} title="Configurar cámara">
          ⚙
        </button>
      </div>
    </section>
  );
}

export default function App() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [last, setLast] = useState(null);
  const [history, setHistory] = useState([]);
  const [cameraUrl, setCameraUrl] = useState(null);
  const [cameraError, setCameraError] = useState(false);
  const [pendingIds, setPendingIds] = useState(new Set());
  const [feedTs, setFeedTs] = useState(Date.now());
  const [showCameraConfig, setShowCameraConfig] = useState(false);
  const [cameraInput, setCameraInput] = useState("");
  const inputRef = useRef(null);
  const resultRef = useRef(null);
  const pollRef = useRef(null);

  const setCamera = useCallback((url) => {
    setCameraUrl(url);
    setCameraError(false);
    setFeedTs(Date.now());
    if (url) {
      localStorage.setItem("camera_url", url);
    } else {
      localStorage.removeItem("camera_url");
    }
  }, []);

  async function refreshHistory() {
    try {
      setHistory(await getHistory(30));
    } catch (e) {
      console.warn(e);
    }
  }

  useEffect(() => {
    refreshHistory();
    const saved = localStorage.getItem("camera_url");
    if (saved) {
      setCameraUrl(saved);
    }
    getCameraConfig().then((cfg) => {
      if (cfg?.snapshot_url && !localStorage.getItem("camera_url")) {
        setCamera(cfg.snapshot_url);
      }
    }).catch(() => {});
  }, [setCamera]);

  useEffect(() => {
    if (!cameraUrl) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(() => setFeedTs(Date.now()), 200);
    return () => clearInterval(pollRef.current);
  }, [cameraUrl]);

  const hasPending = pendingIds.size > 0;

  useEffect(() => {
    if (!hasPending) return;
    const interval = setInterval(async () => {
      try {
        const fresh = await getHistory(30);
        setHistory(fresh);
        const stillPending = new Set(pendingIds);
        for (const item of fresh) {
          if (pendingIds.has(item.id) && (item.status === "completed" || item.status === "failed")) {
            stillPending.delete(item.id);
            if (last?.id === item.id) setLast(item);
          }
        }
        setPendingIds(stillPending);
      } catch (e) {
        console.warn(e);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [hasPending, pendingIds, last?.id]);

  function classifyError(msg) {
    if (!msg) return "error";
    const m = msg.toLowerCase();
    if (m.includes("cámara") && (m.includes("no respondió") || m.includes("no se pudo capturar"))) return "camera";
    if (m.includes("internet") || m.includes("wifi") || m.includes("conexión") || m.includes("tardó")) return "network";
    if (m.includes("clave") || m.includes("api_key") || m.includes("autenticación") || m.includes("401")) return "auth";
    if (m.includes("crédito") || m.includes("credits")) return "billing";
    if (m.includes("modelo") || m.includes("descontinuado") || m.includes("deprecated")) return "model";
    if (m.includes("demasiadas") || m.includes("429") || m.includes("rate limit")) return "ratelimit";
    return "error";
  }

  const errorType = classifyError(error);
  const errorIcon = { camera: "📷", network: "📡", auth: "🔑", billing: "💳", model: "🤖", ratelimit: "⏳", error: "⚠️" }[errorType] || "⚠️";

  async function onSubmit(e) {
    e.preventDefault();
    if (!text.trim() || loading) return;
    const userText = text.trim();
    setText("");
    setLoading(true);
    setError(null);
    try {
      const result = await sendCommand(userText);
      const pendingItem = {
        id: result.id,
        user_text: userText,
        status: "pending",
        created_at: new Date().toISOString(),
      };
      setHistory((prev) => [pendingItem, ...prev]);
      setPendingIds((prev) => new Set(prev).add(result.id));
      setLast(pendingItem);
      inputRef.current?.focus();
    } catch (err) {
      setError(err.message);
      setText(userText);
    } finally {
      setLoading(false);
    }
  }

  async function onStop() {
    try {
      await emergencyStop();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-dot" />
          <div className="brand-text">
            <h1>Carrito RC</h1>
            <p>Control por inteligencia artificial</p>
          </div>
        </div>
        <button className="estop" onClick={onStop} title="Parada de emergencia">
          ⏻ PARAR
        </button>
      </header>

      <CameraView
        cameraUrl={cameraUrl}
        feedTs={feedTs}
        cameraError={cameraError}
        onFeedError={setCameraError}
        onConfigClick={() => {
          setCameraInput(cameraUrl || "");
          setShowCameraConfig((v) => !v);
        }}
      />
      {showCameraConfig && (
        <section className="camera-config">
          <label className="camera-config-label">URL de la cámara (IP Webcam / snapshot)</label>
          <div className="camera-config-row">
            <input
              className="camera-config-input"
              value={cameraInput}
              onChange={(e) => setCameraInput(e.target.value)}
              placeholder="http://192.168.1.50:8080/shot.jpg"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setCamera(cameraInput.trim() || null);
                  setShowCameraConfig(false);
                }
              }}
            />
            <button
              className="camera-config-apply"
              onClick={() => {
                setCamera(cameraInput.trim() || null);
                setShowCameraConfig(false);
              }}
            >
              Aplicar
            </button>
          </div>
        </section>
      )}

      <div className="columns">
        <section className="panel">
          <h2 className="panel-title">Instrucción</h2>
          <form onSubmit={onSubmit} className="command-form">
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ej. avanza hasta acercarte a la pared y detente"
              rows={3}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) onSubmit(e);
              }}
            />
            <div className="btn-row">
              <button
                type="submit"
                disabled={loading || !text.trim()}
                className={`btn-send${loading ? " loading" : ""}`}
              >
                {loading && <span className="spinner" />}
                {loading ? "Procesando…" : "Enviar instrucción"}
              </button>
            </div>
          </form>

          {error && (
            <div className={`alert alert-${errorType}`}>
              <span className="alert-icon">{errorIcon}</span>
              <span>{error}</span>
            </div>
          )}
        </section>

        <section className="panel">
          <h2 className="panel-title">Última acción</h2>
          {last ? (
            <div className="result-enter" ref={resultRef}>
              {last.status === "pending" ? (
                <div className="pending-action">
                  <span className="spinner" />
                  <p>Procesando instrucción…</p>
                </div>
              ) : last.status === "failed" ? (
                <>
                  <div className="section-label">Instrucción</div>
                  <p className="observation">{last.user_text}</p>
                  <div style={{ height: 12 }} />
                  <div className="alert">
                    <span className="alert-icon">❌</span>
                    <span>{last.vlm_observation || "Error desconocido"}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="section-label">Lo que vio la cámara</div>
                  <p className="observation">{last.vlm_observation}</p>

                  <div style={{ height: 12 }} />

                  <div className="section-label">Movimiento decidido</div>
                  <div className="action-chip">
                    <span className="action-glyph">
                      {ACTION_GLYPH[last.action?.type] ?? "?"}
                    </span>
                    <div className="action-info">
                      <strong>{ACTION_LABEL[last.action?.type] ?? last.action?.type}</strong>
                      <small>
                        lin {Number(last.action?.linear).toFixed(2)} · ang{" "}
                        {Number(last.action?.angular).toFixed(2)} · {Number(last.action?.duration_s).toFixed(1)}s
                      </small>
                    </div>
                    <span
                      className={`action-status ${last.executed ? "ok" : "ko"}`}
                    >
                      {last.executed ? "Ejecutado" : "No ejecutado"}
                    </span>
                  </div>

                  {last.action?.reasoning && (
                    <p className="reasoning">{last.action.reasoning}</p>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="empty-action">
              Enviá una instrucción para ver el resultado aquí
            </div>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="history-header">
          <h2 className="panel-title" style={{ margin: 0 }}>Historial</h2>
          <button className="btn-refresh" onClick={refreshHistory} title="Actualizar historial">
            ↻
          </button>
        </div>
        <ul className="history-list">
          {history.length === 0 && (
            <li className="empty-history">Sin instrucciones todavía</li>
          )}
          {history.map((item) => (
            <li key={item.id} className={`history-item${item.status === "pending" ? " pending" : ""}${item.status === "failed" ? " failed" : ""}`}>
              <span className="history-glyph">
                {item.status === "pending" ? "⏳" : item.status === "failed" ? "❌" : (ACTION_GLYPH[item.action?.type] ?? "?")}
              </span>
              <div className="history-body">
                <span className="hi-user">{item.user_text}</span>
                {item.status === "pending" && <p className="hi-status">Procesando instrucción…</p>}
                {item.status === "failed" && <p className="hi-status error">{item.vlm_observation || "Error al procesar"}</p>}
                {item.status === "completed" && <p className="hi-vlm">{item.vlm_observation}</p>}
                {item.status === "processing" && <p className="hi-status">Analizando escena…</p>}
                <time>{new Date(item.created_at).toLocaleTimeString()}</time>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
