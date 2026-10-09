"use client";

import { useEffect, useRef, useState } from "react";
import mqtt, { type MqttClient } from "mqtt";
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
  const client = useRef<MqttClient | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);

  useEffect(() => {
    const room = target || crypto.randomUUID().replaceAll("-", "");
    const topic = `tierra-viva-3d/${room}`;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    const mq = mqtt.connect("wss://broker.hivemq.com:8884/mqtt", {
      clientId: `tierra_${crypto.randomUUID().slice(0, 12)}`,
      clean: true,
      reconnectPeriod: 1500,
      connectTimeout: 12000,
      keepalive: 20,
    });
    client.current = mq;
    setStatus("CONECTANDO AL CONTROL…");
    mq.on("connect", async () => {
      if (heartbeat) clearInterval(heartbeat);
      mq.subscribe(topic, { qos: 1 }, async (error) => {
        if (error) return setStatus("ERROR AL CREAR LA SALA");
        if (isPhone) {
          setStatus("BUSCANDO LA COMPUTADORA…");
          const hello = () => mq.publish(topic, JSON.stringify({ sender: "phone", kind: "hello", at: Date.now() }), { qos: 1 });
          hello();
          heartbeat = setInterval(hello, 2000);
        } else {
          const url = `${window.location.origin}${window.location.pathname}?control=${encodeURIComponent(room)}`;
          setQr(await QRCode.toDataURL(url, { width: 520, margin: 3, errorCorrectionLevel: "H" }));
          setStatus("ESCANEA EL QR CON TU TELÉFONO");
          const announce = () => mq.publish(topic, JSON.stringify({ sender: "desktop", kind: "ready", at: Date.now() }), { qos: 1, retain: true });
          announce();
          heartbeat = setInterval(announce, 2000);
        }
      });
    });
    mq.on("message", (_topic, payload) => {
      try {
        const message = JSON.parse(payload.toString());
        if (!isPhone && message.sender === "phone") {
          if (message.kind === "hello") {
            setStatus("TELÉFONO CONECTADO");
            mq.publish(topic, JSON.stringify({ sender: "desktop", kind: "ready", at: Date.now() }), { qos: 1, retain: true });
          } else if (message.command) {
            window.dispatchEvent(new CustomEvent("remote-globe", { detail: message.command }));
          }
        } else if (isPhone && message.sender === "desktop" && message.kind === "ready" && Date.now() - message.at < 7000) {
          setStatus("CONECTADO AL GLOBO");
        }
      } catch {}
    });
    mq.on("reconnect", () => setStatus("RECONECTANDO AUTOMÁTICAMENTE…"));
    mq.on("offline", () => setStatus("SIN RED · ESPERANDO CONEXIÓN…"));
    mq.on("error", () => setStatus("ERROR DE RED · REINTENTANDO…"));
    return () => {
      if (heartbeat) clearInterval(heartbeat);
      if (!isPhone && mq.connected) mq.publish(topic, "", { retain: true });
      client.current = null;
      mq.end(true);
    };
  }, [isPhone, target]);

  const send = (command: Command) => {
    const room = target;
    if (client.current?.connected && room) {
      client.current.publish(`tierra-viva-3d/${room}`, JSON.stringify({ sender: "phone", command }), { qos: 1 });
    }
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
