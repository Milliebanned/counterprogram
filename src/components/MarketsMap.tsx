"use client";

import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import type { Market } from "@/lib/agent";

export default function MarketsMap({ markets, picked }: { markets: Market[]; picked: string[] }) {
  return (
    <MapContainer bounds={[[24.5, -124], [49, -67]]} scrollWheelZoom={false} className="dark-tiles h-80 w-full border border-line">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {markets.map((m, i) => {
        const on = picked.includes(m.name);
        return (
          <CircleMarker
            key={m.name}
            center={[m.lat, m.lon]}
            radius={5 + m.score * 16}
            pathOptions={{ color: on ? "#f0ed12" : "#8a8a80", weight: on ? 2 : 1, fillColor: on ? "#f0ed12" : "#8a8a80", fillOpacity: on ? 0.5 : 0.18 }}
          >
            <Tooltip>
              #{i + 1} {m.name} · {m.score.toFixed(2)}
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
