import { useState, useEffect, useRef, Children, isValidElement } from "react";
import { createPortal } from "react-dom";

let _styleInjected = false;

export default function CustomSelect({ value, onChange, children, style, disabled }) {
  const [open,       setOpen]       = useState(false);
  const [pos,        setPos]        = useState({ top: 0, left: 0, width: 0, maxHeight: 240, openUp: false });
  const [hoveredIdx, setHoveredIdx] = useState(-1);
  const triggerRef                  = useRef(null);
  const dropRef                     = useRef(null);

  // Inject animation keyframe once
  useEffect(() => {
    if (_styleInjected) return;
    _styleInjected = true;
    const s = document.createElement("style");
    s.textContent = `
      @keyframes csOpen {
        from { opacity:0; transform:translateY(-8px) scale(0.98) }
        to   { opacity:1; transform:translateY(0)    scale(1)    }
      }
    `;
    document.head.appendChild(s);
  }, []);

  // Parse <option> children into [{value, label, disabled}]
  const options = Children.toArray(children)
    .filter(child => isValidElement(child) && child.type === "option")
    .map(child => ({
      value:    child.props.value !== undefined ? child.props.value : child.props.children,
      label:    child.props.children ?? child.props.value,
      disabled: !!child.props.disabled,
    }));

  const selectedOpt = options.find(o => String(o.value) === String(value ?? ""));

  // position: fixed → use viewport coords directly (no scrollY/X)
  const calcPos = () => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    const width = Math.max(r.width, 140);

    let left = r.left;
    if (left + width > vw - margin) left = vw - margin - width;
    if (left < margin) left = margin;

    const spaceBelow = vh - r.bottom - margin;
    const spaceAbove = r.top - margin;
    const openUp = spaceBelow < 120 && spaceAbove > spaceBelow;
    const maxHeight = Math.min(240, Math.max(120, openUp ? spaceAbove : spaceBelow));

    setPos({ top: r.bottom, bottom: vh - r.top, left, width: r.width, maxHeight, openUp });
  };

  const toggle = () => {
    if (disabled) return;
    if (!open) calcPos();
    setOpen(v => !v);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (
        !triggerRef.current?.contains(e.target) &&
        !dropRef.current?.contains(e.target)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open]);

  // Close on any scroll (dropdown is fixed → se desconecta del trigger al scrollear)
  useEffect(() => {
    if (!open) return;
    const h = () => setOpen(false);
    window.addEventListener("scroll", h, true);
    return () => window.removeEventListener("scroll", h, true);
  }, [open]);

  const handleSelect = (optValue) => {
    onChange({ target: { value: optValue } });
    setOpen(false);
    setHoveredIdx(-1);
  };

  /* ─── Trigger ────────────────────────────────────────────────── */
  const triggerStyle = {
    background:   "rgba(255,255,255,0.06)",
    border:       open
      ? "1px solid rgba(139,92,246,0.6)"
      : "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10,
    padding:      "6px 30px 6px 11px",
    color:        "white",
    fontSize:     11,
    fontFamily:   "inherit",
    cursor:       disabled ? "not-allowed" : "pointer",
    display:      "flex",
    alignItems:   "center",
    position:     "relative",
    userSelect:   "none",
    boxSizing:    "border-box",
    width:        "100%",
    transition:   "border-color 0.18s, box-shadow 0.18s, background 0.18s",
    opacity:      disabled ? 0.5 : 1,
    boxShadow:    open ? "0 0 0 3px rgba(139,92,246,0.12)" : "none",
    ...style,
    paddingRight: style?.paddingRight ?? 30,
  };

  /* ─── Dropdown portal ────────────────────────────────────────── */
  const dropdown = open ? createPortal(
    <div
      ref={dropRef}
      style={{
        position:             "fixed",
        ...(pos.openUp ? { bottom: pos.bottom + 6 } : { top: pos.top + 6 }),
        left:                 pos.left,
        minWidth:             Math.max(pos.width, 140),
        maxHeight:            pos.maxHeight,
        overflowY:            "auto",
        background:           "rgba(7, 8, 18, 0.96)",
        backdropFilter:       "blur(40px) saturate(180%)",
        WebkitBackdropFilter: "blur(40px) saturate(180%)",
        border:               "1px solid rgba(139,92,246,0.3)",
        borderTop:            "1px solid rgba(139,92,246,0.5)",
        borderRadius:         14,
        zIndex:               999999,
        boxShadow: `
          0 4px  12px rgba(0,0,0,0.4),
          0 16px 40px  rgba(0,0,0,0.6),
          0 32px 80px  rgba(0,0,0,0.35),
          inset 0 1px 0 rgba(255,255,255,0.06)
        `,
        animation:            "csOpen 0.16s cubic-bezier(0.16,1,0.3,1)",
        scrollbarWidth:       "thin",
        scrollbarColor:       "rgba(139,92,246,0.3) transparent",
        padding:              "4px",
      }}
    >
      {options.map((opt, i) => {
        const isSel  = String(opt.value) === String(value ?? "");
        const isHov  = hoveredIdx === i;

        let bg = "transparent";
        if (isSel)       bg = "rgba(139,92,246,0.22)";
        else if (isHov)  bg = "rgba(139,92,246,0.14)";

        return (
          <div
            key={i}
            onMouseDown={(e) => { e.preventDefault(); if (!opt.disabled) handleSelect(opt.value); }}
            onMouseEnter={() => !opt.disabled && setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(-1)}
            style={{
              padding:      "9px 14px",
              fontSize:     11,
              fontFamily:   "inherit",
              color:        opt.disabled
                ? "rgba(255,255,255,0.22)"
                : isSel
                  ? "#c4b5fd"
                  : isHov
                    ? "rgba(255,255,255,0.96)"
                    : "rgba(255,255,255,0.75)",
              background:   bg,
              cursor:       opt.disabled ? "not-allowed" : "pointer",
              borderRadius: 9,
              transition:   "background 0.1s, color 0.1s",
              display:      "flex",
              alignItems:   "center",
              gap:          8,
            }}
          >
            {isSel && (
              <span style={{ fontSize: 9, color: "#a78bfa", flexShrink: 0 }}>✓</span>
            )}
            <span style={{ flex: 1 }}>{opt.label}</span>
          </div>
        );
      })}
    </div>,
    document.body
  ) : null;

  return (
    <>
      <div ref={triggerRef} onClick={toggle} style={triggerStyle}>
        <span style={{
          flex:         1,
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap",
        }}>
          {selectedOpt?.label ?? String(value ?? " ")}
        </span>
        <span style={{
          position:      "absolute",
          right:         10,
          fontSize:      9,
          opacity:       open ? 0.7 : 0.4,
          color:         open ? "#a78bfa" : "white",
          transform:     open ? "rotate(180deg)" : "rotate(0deg)",
          transition:    "transform 0.18s, opacity 0.18s, color 0.18s",
          pointerEvents: "none",
        }}>
          ▼
        </span>
      </div>
      {dropdown}
    </>
  );
}
