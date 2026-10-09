"use client";

import { useEffect, useRef, useState } from "react";
import { Peer, type DataConnection } from "peerjs";
import QRCode from "qrcode";

type Command =
  | { type: "rotate"; dx: number; dy: number }
  | { type: "zoom"; direction: "in" | "out" }
  | { type: "tap"; x: number; y: number }
  | { type: "select-marker"; country: string }
  | { type: "reset" };

export default function RemoteControl() {
  const target = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("control") : null;
  const isPhone = Boolean(target);
  const [open, setOpen] = useState(isPhone);
  const [status, setStatus] = useState("PREPARANDO CONEXIÓN…");
  const [qr, setQr] = useState("");
  const connection = useRef<DataConnection | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);

  useEffect(() => {
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const peer = new Peer({
      host: "0.peerjs.com",
      port: 443,
      path: "/",
      secure: true,
      config: {
        iceServers: [
          { urls: "stun:stun.cloudflare.com:3478" },
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      },
    });
    if (isPhone && target) {
      const connect = () => {
        if (stopped || peer.destroyed || connection.current?.open) return;
        setStatus("CONECTANDO CON EL GLOBO…");
        const conn = peer.connect(target, { reliable: true });
        connection.current = conn;
        conn.on("open", () => {
          if (retryTimer) clearTimeout(retryTimer);
          setStatus("CONECTADO AL GLOBO");
          conn.send({ type: "ping" });
        });
        const retry = () => {
          if (stopped) return;
          setStatus("RECONECTANDO… MANTÉN AMBAS PANTALLAS ABIERTAS");
          retryTimer = setTimeout(connect, 2500);
        };
        conn.on("close", retry);
        conn.on("error", retry);
      };
      peer.on("open", connect);
      peer.on("disconnected", () => {
        setStatus("RECUPERANDO CONEXIÓN…");
        if (!peer.destroyed) peer.reconnect();
      });
    } else {
      peer.on("open", async (id) => {
        const url = `${window.location.origin}${window.location.pathname}?control=${encodeURIComponent(id)}&session=${Date.now()}`;
        setQr(await QRCode.toDataURL(url, { width: 520, margin: 3, errorCorrectionLevel: "H" }));
        setStatus("ESCANEA EL QR CON TU TELÉFONO");
      });
      peer.on("connection", (conn) => {
        connection.current = conn;
        conn.on("open", () => setStatus("TELÉFONO CONECTADO"));
        conn.on("data", (data) => window.dispatchEvent(new CustomEvent("remote-globe", { detail: data })));
        conn.on("close", () => setStatus("TELÉFONO DESCONECTADO"));
      });
      peer.on("disconnected", () => {
        setStatus("RECONECTANDO EL GLOBO…");
        if (!peer.destroyed) peer.reconnect();
      });
    }
    peer.on("error", (error) => setStatus(`ERROR DE CONEXIÓN · ${error.type.toUpperCase()}`));
    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      connection.current?.close();
      peer.destroy();
    };
  }, [isPhone, target]);

  const send = (command: Command) => {
    if (connection.current?.open) connection.current.send(command);
  };

  if (isPhone) {
    return (
      <section className="phoneRemote">
        <div className="remoteBrand">TIERRA VIVA</div>
        <h2>Control remoto</h2>
        <p className={status.includes("CONECTADO") ? "connected" : ""}>{status}</p>
        <div
          className="touchPad"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            dragged.current = false;
            pointer.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerMove={(event) => {
            if (!pointer.current) return;
            const dx = event.clientX - pointer.current.x;
            const dy = event.clientY - pointer.current.y;
            if (Math.abs(dx) + Math.abs(dy) > 2) dragged.current = true;
            pointer.current = { x: event.clientX, y: event.clientY };
            send({ type: "rotate", dx, dy });
          }}
          onPointerUp={(event) => {
            if (!dragged.current) {
              const rect = event.currentTarget.getBoundingClientRect();
              send({ type: "tap", x: ((event.clientX - rect.left) / rect.width) * 2 - 1, y: -(((event.clientY - rect.top) / rect.height) * 2 - 1) });
            }
            pointer.current = null;
          }}
          onPointerCancel={() => (pointer.current = null)}
        >
          <span>ARRASTRA PARA GIRAR · TOCA PARA ABRIR</span>
          <i>◎</i>
        </div>
        <div className="remoteButtons">
          <button onClick={() => send({ type: "zoom", direction: "out" })}>−</button>
          <button className="resetRemote" onClick={() => send({ type: "reset" })}>CENTRAR</button>
          <button onClick={() => send({ type: "zoom", direction: "in" })}>+</button>
        </div>
        <div className="remoteMarkers">
          <span>PUNTOS ROJOS</span>
          <button onClick={() => send({ type: "select-marker", country: "Bangladesh" })}><i />Roberto Pérez · Bangladesh</button>
          <button onClick={() => send({ type: "select-marker", country: "Senegal" })}><i />Fernando Cruz · Senegal</button>
          <button onClick={() => send({ type: "select-marker", country: "Tanzania" })}><i />Luis López · Tanzania</button>
          <button onClick={() => send({ type: "select-marker", country: "India" })}><i />Lydia · India</button>
        </div>
      </section>
    );
  }

  return (
    <>
      <button className="remoteToggle" onClick={() => setOpen(true)}>▣ CONTROL MÓVIL</button>
      {open && (
        <section className="remoteModal">
          <button className="remoteClose" onClick={() => setOpen(false)} aria-label="Cerrar">×</button>
          <small>CONTROL REMOTO</small>
          <h2>Mueve el mundo<br />desde tu teléfono</h2>
          {qr ? <img src={qr} alt="Código QR para conectar el teléfono" /> : <div className="qrLoading" />}
          <p>{status}</p>
          <span>Deja esta ventana abierta mientras usas el teléfono.</span>
        </section>
      )}
    </>
  );
}
