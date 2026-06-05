import { useEffect, useRef, useState } from "react";
import { sendCommand, emergencyStop, getHistory } from "./lib/api.js";

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

export default function App() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [last, setLast] = useState(null);
  const [history, setHistory] = useState([]);
  const inputRef = useRef(null);

  async function refreshHistory() {
    try {
      setHistory(await getHistory(30));
    } catch (e) {
      // historial es secundario; no rompemos la UI
      console.warn(e);
    }
  }

  useEffect(() => {
    refreshHistory();
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await sendCommand(text.trim());
      setLast(result);
      setText("");
      inputRef.current?.focus();
      refreshHistory();
    } catch (err) {
      setError(err.message);
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
          <div>
            <h1>Carrito RC</h1>
            <p>Control por lenguaje natural · visión + LLM</p>
          </div>
        </div>
        <button className="estop" onClick={onStop} title="Parada de emergencia">
          ⏻ PARAR
        </button>
      </header>

      <main className="grid">
        {/* Columna izquierda: control */}
        <section className="panel control">
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
            <button type="submit" disabled={loading || !text.trim()}>
              {loading ? "Procesando…" : "Enviar instrucción"}
            </button>
          </form>

          {error && <div className="alert">{error}</div>}

          {last && (
            <div className="result">
              <div className="result-row">
                <span className="tag tag-vlm">Cámara ve</span>
                <p>{last.vlm_observation}</p>
              </div>

              <div className="result-row">
                <span className="tag tag-action">Acción</span>
                <div className="action-chip">
                  <span className="glyph">
                    {ACTION_GLYPH[last.action.type] ?? "?"}
                  </span>
                  <div>
                    <strong>
                      {ACTION_LABEL[last.action.type] ?? last.action.type}
                    </strong>
                    <small>
                      lin {last.action.linear.toFixed(2)} · ang{" "}
                      {last.action.angular.toFixed(2)} · {last.action.duration_s}s
                    </small>
                  </div>
                  <span
                    className={`exec ${last.executed ? "ok" : "ko"}`}
                    title={last.executed ? "Enviado al carrito" : "No ejecutado"}
                  >
                    {last.executed ? "ejecutado" : "no ejecutado"}
                  </span>
                </div>
              </div>

              {last.action.reasoning && (
                <div className="result-row">
                  <span className="tag tag-reason">Razonamiento</span>
                  <p className="reason">{last.action.reasoning}</p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Columna derecha: historial */}
        <section className="panel history">
          <div className="history-head">
            <h2 className="panel-title">Historial</h2>
            <button className="ghost" onClick={refreshHistory}>
              ↻
            </button>
          </div>
          <ul className="history-list">
            {history.length === 0 && (
              <li className="empty">Sin instrucciones todavía.</li>
            )}
            {history.map((item) => (
              <li key={item.id} className="history-item">
                <div className="hi-top">
                  <span className="glyph small">
                    {ACTION_GLYPH[item.action?.type] ?? "?"}
                  </span>
                  <span className="hi-user">{item.user_text}</span>
                </div>
                <p className="hi-vlm">{item.vlm_observation}</p>
                <time>{new Date(item.created_at).toLocaleTimeString()}</time>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
