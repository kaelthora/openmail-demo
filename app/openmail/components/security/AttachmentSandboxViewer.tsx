"use client";

import { useMemo } from "react";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildSandboxSrcDoc(fileName: string, mimeType: string | null): string {
  const fn = escapeHtml(fileName);
  const mt = mimeType?.trim() ? escapeHtml(mimeType.trim()) : "—";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{box-sizing:border-box;margin:0;padding:20px;font-family:ui-sans-serif,system-ui,sans-serif;background:#0a0a0a;color:#c4c4c4;font-size:13px;line-height:1.55;min-height:100%}
.h{color:#f1f1f1;font-weight:600;font-size:14px;margin:0 0 12px;letter-spacing:0.02em}
.p{margin:0 0 10px}
.meta{font-family:ui-monospace,monospace;font-size:11px;color:#7b7b7b;word-break:break-all}
.foot{margin-top:20px;padding-top:14px;border-top:1px solid #1f1f1f;font-size:10px;color:#5c5c5c;line-height:1.45}
.accent{color:rgba(255,59,59,0.9)}
</style></head><body>
<p class="h">Isolated preview <span class="accent">(simulation)</span></p>
<p class="p"><strong>File</strong></p>
<p class="meta">${fn}</p>
<p class="p"><strong>Declared type</strong></p>
<p class="meta">${mt}</p>
<p class="p">Attachment bytes are not executed or opened as a native file. This is static HTML inside a sandboxed iframe with no script capability.</p>
<p class="foot">iframe sandbox attribute: empty token set — scripts, forms, and top navigation blocked.</p>
</body></html>`;
}

type AttachmentSandboxViewerProps = {
  fileName: string;
  mimeType?: string | null;
  onClose?: () => void;
};

/**
 * Simulated safe preview: sandboxed iframe + BLACKEN "Secure Mode Active" chrome.
 * Does not load real file bytes — no execution path.
 */
export function AttachmentSandboxViewer({
  fileName,
  mimeType,
  onClose,
}: AttachmentSandboxViewerProps) {
  const srcDoc = useMemo(
    () => buildSandboxSrcDoc(fileName, mimeType ?? null),
    [fileName, mimeType]
  );

  return (
    <div className="attachment-sandbox-root mt-5 w-full">
      <div className="attachment-sandbox-banner" role="status" aria-live="polite">
        <span className="attachment-sandbox-banner-glow" aria-hidden />
        <span className="attachment-sandbox-banner-dot" aria-hidden />
        <div className="attachment-sandbox-banner-text">
          <p className="attachment-sandbox-banner-title">Secure Mode Active</p>
          <p className="attachment-sandbox-banner-sub">
            Isolated viewer — simulated safe environment · no file execution
          </p>
        </div>
        {onClose ? (
          <button type="button" className="attachment-sandbox-banner-close" onClick={onClose}>
            Close preview
          </button>
        ) : null}
      </div>
      <div className="attachment-sandbox-frame-shell">
        <iframe
          className="attachment-sandbox-iframe"
          title={`Sandbox preview: ${fileName}`}
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={srcDoc}
        />
      </div>
    </div>
  );
}
