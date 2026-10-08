"use client";

import { useEffect, useRef, useState } from "react";
import { Peer, type DataConnection } from "peerjs";
import QRCode from "qrcode";

type Command =
  | { type: "rotate"; dx: number; dy: number }
  | { type: "zoom"; direction: "in" | "out" }
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

  useEffect(() => {
    const peer = new Peer();
    if (isPhone && target) {
      peer.on("open", () => {
        const conn = peer.connect(target, { reliable: true });
        connection.current = conn;
        conn.on("open", () => setStatus("CONECTADO AL GLOBO"));
        conn.on("close", () => setStatus("CONEXIÓN CERRADA"));
        conn.on("error", () => setStatus("NO SE PUDO CONECTAR"));
      });
    } else {
      peer.on("open", async (id) => {
        const url = `${window.location.origin}${window.location.pathname}?control=${encodeURIComponent(id)}`;
        setQr(await QRCode.toDataURL(url, { width: 520, margin: 3, errorCorrectionLevel: "H" }));
        setStatus("ESCANEA EL QR CON TU TELÉFONO");
      });
      peer.on("connection", (conn) => {
        connection.current = conn;
        conn.on("open", () => setStatus("TELÉFONO CONECTADO"));
        conn.on("data", (data) => window.dispatchEvent(new CustomEvent("remote-globe", { detail: data })));
        conn.on("close", () => setStatus("TELÉFONO DESCONECTADO"));
      });
    }
    peer.on("error", () => setStatus("ERROR DE CONEXIÓN · INTENTA DE NUEVO"));
    return () => peer.destroy();
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
            pointer.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerMove={(event) => {
            if (!pointer.current) return;
            const dx = event.clientX - pointer.current.x;
            const dy = event.clientY - pointer.current.y;
            pointer.current = { x: event.clientX, y: event.clientY };
            send({ type: "rotate", dx, dy });
          }}
          onPointerUp={() => (pointer.current = null)}
          onPointerCancel={() => (pointer.current = null)}
        >
          <span>ARRASTRA PARA GIRAR</span>
          <i>◎</i>
        </div>
        <div className="remoteButtons">
          <button onClick={() => send({ type: "zoom", direction: "out" })}>−</button>
          <button className="resetRemote" onClick={() => send({ type: "reset" })}>CENTRAR</button>
          <button onClick={() => send({ type: "zoom", direction: "in" })}>+</button>
        </div>
        <div className="remoteMarkers">
          <span>PUNTOS ROJOS</span>
          <button onClick={() => send({ type: "select-marker", country: "Bangladesh" })}><i />Bangladesh</button>
          <button onClick={() => send({ type: "select-marker", country: "Senegal" })}><i />Senegal</button>
          <button onClick={() => send({ type: "select-marker", country: "Tanzania" })}><i />Tanzania</button>
          <button onClick={() => send({ type: "select-marker", country: "India" })}><i />India</button>
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
