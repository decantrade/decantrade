"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PnlCardData = {
  marketLabel: string;
  isLong: boolean;
  leverage: number;
  entry: number;
  mark: number;
  roiPct: number; // e.g. 12.5 for +12.5%
  pnlUsd: number;
};

const C = {
  bg: "#0a0807",
  panel: "#141110",
  line: "#2a241f",
  ink: "#ede6da",
  inkSoft: "#b8ad9c",
  inkDim: "#7c7264",
  amber: "#e8b84b",
  wine: "#c2566a",
  green: "#6fcf97",
};

function money(n: number, dp = 2) {
  return n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** Draw the branded PnL card onto a canvas (1200×675, 16:9). */
function draw(ctx: CanvasRenderingContext2D, d: PnlCardData) {
  const W = 1200;
  const H = 675;
  const win = d.pnlUsd >= 0;
  const accent = win ? C.green : C.wine;

  // Background + subtle frame.
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.panel;
  roundRect(ctx, 40, 40, W - 80, H - 80, 28);
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  roundRect(ctx, 40, 40, W - 80, H - 80, 28);
  ctx.stroke();

  // Accent bar down the left edge.
  ctx.fillStyle = accent;
  roundRect(ctx, 40, 40, 10, H - 80, 6);
  ctx.fill();

  // Header: brand + market.
  ctx.fillStyle = C.amber;
  ctx.font = "700 34px Inter, Arial, sans-serif";
  ctx.fillText("◆ DECANT", 90, 110);
  ctx.fillStyle = C.inkDim;
  ctx.font = "500 22px Inter, Arial, sans-serif";
  ctx.fillText("decantrade.com", 90, 142);

  // Side / leverage pill.
  const sideText = `${d.isLong ? "LONG" : "SHORT"} · ${d.leverage}×`;
  ctx.font = "700 26px Inter, Arial, sans-serif";
  const pillW = ctx.measureText(sideText).width + 48;
  ctx.fillStyle = d.isLong ? "rgba(111,207,151,0.14)" : "rgba(194,86,106,0.14)";
  roundRect(ctx, W - 90 - pillW, 84, pillW, 48, 24);
  ctx.fill();
  ctx.fillStyle = d.isLong ? C.green : C.wine;
  ctx.fillText(sideText, W - 90 - pillW + 24, 117);

  // Market label.
  ctx.fillStyle = C.ink;
  ctx.font = "600 40px Inter, Arial, sans-serif";
  ctx.fillText(d.marketLabel, 90, 230);

  // Big ROI %.
  const roiText = `${d.roiPct >= 0 ? "+" : ""}${money(d.roiPct, 2)}%`;
  ctx.fillStyle = accent;
  ctx.font = "800 132px Inter, Arial, sans-serif";
  ctx.fillText(roiText, 86, 360);

  // PnL USD subtitle.
  ctx.fillStyle = C.inkSoft;
  ctx.font = "600 34px Inter, Arial, sans-serif";
  ctx.fillText(`${d.pnlUsd >= 0 ? "+" : "-"}$${money(Math.abs(d.pnlUsd))} PnL`, 90, 412);

  // Footer stats: entry + mark.
  const fy = H - 110;
  ctx.fillStyle = C.inkDim;
  ctx.font = "500 22px Inter, Arial, sans-serif";
  ctx.fillText("ENTRY", 90, fy);
  ctx.fillText("MARK", 360, fy);
  ctx.fillStyle = C.ink;
  ctx.font = "600 34px Inter, Arial, sans-serif";
  ctx.fillText(`$${money(d.entry)}`, 90, fy + 40);
  ctx.fillText(`$${money(d.mark)}`, 360, fy + 40);

  // Tagline bottom-right.
  ctx.fillStyle = C.inkDim;
  ctx.font = "500 22px Inter, Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("Permissionless perps on Base", W - 90, fy + 40);
  ctx.textAlign = "left";
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function PnlCard({ data, onClose }: { data: PnlCardData; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    draw(ctx, data);
    canvas.toBlob((blob) => {
      if (blob) setUrl(URL.createObjectURL(blob));
    }, "image/png");
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const download = useCallback(() => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `decant-pnl-${data.marketLabel.replace(/\W+/g, "")}.png`;
    a.click();
  }, [url, data.marketLabel]);

  const shareText = `${data.roiPct >= 0 ? "+" : ""}${money(data.roiPct, 2)}% on my ${
    data.isLong ? "long" : "short"
  } ${data.marketLabel} ${data.leverage}× on @_decantrade 🔵\n\npermissionless perps for any Base token. live on testnet:`;
  const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    shareText,
  )}&url=${encodeURIComponent("https://decantrade.com/trade")}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-line bg-panel p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
            Share PnL
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink-soft hover:border-wine hover:text-wine"
          >
            Close
          </button>
        </div>
        <canvas
          ref={canvasRef}
          width={1200}
          height={675}
          className="w-full rounded-xl border border-line-soft"
        />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={download}
            className="rounded-lg border border-line px-4 py-2.5 text-sm text-ink-soft hover:border-amber hover:text-amber"
          >
            Download PNG
          </button>
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-amber px-4 py-2.5 text-center text-sm font-semibold text-bg hover:opacity-90"
          >
            Share on X
          </a>
        </div>
        <p className="mt-2 text-center text-[11px] text-ink-dim">
          Image downloads to your device — attach it to the X post.
        </p>
      </div>
    </div>
  );
}
