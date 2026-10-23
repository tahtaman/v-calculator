import React, { useMemo, useState } from "react";

// ---------- Утилиты ----------
const MM = "мм";
const deg = (r) => (r * 180) / Math.PI;
const rad = (d) => (d * Math.PI) / 180;
const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "—");
const r10 = (v) => Math.ceil(v / 10) * 10;

const PRESETS = [
  [100, 100], [150, 150], [150, 200], [200, 200], [200, 300],
  [250, 250], [300, 300], [400, 400], [500, 500], [500, 250],
];
const ROUND_PRESETS = [100, 125, 150, 160, 200, 250, 315, 400];

const MAX_CHANGE = 10; // допустимое изменение сечения на срезе, мм

// максимальный угол реза: H / cos(a) <= H + 10
const maxAngle = (size) => (size > 0 ? Math.acos(size / (size + MAX_CHANGE)) : Math.PI / 2);
const maxTan = (size) => Math.tan(maxAngle(size));

// ---------- Расчёт ----------
function compute(state) {
  const { shape, dx, dy, mode, Lmanual } = state;
  const round = shape === "round";

  let edges = []; // {label, rise, axis}
  if (round) {
    const d1 = state.d1, d2 = state.d2;
    edges = [
      { label: "Верх", rise: dy + (d2 - d1) / 2, dim: Math.max(d1, d2), plane: "side" },
      { label: "Низ", rise: dy - (d2 - d1) / 2, dim: Math.max(d1, d2), plane: "side" },
      { label: "Бок (гориз.)", rise: dx, dim: Math.max(d1, d2), plane: "top" },
    ];
  } else {
    const { w1, h1, w2, h2 } = state;
    edges = [
      { label: "Верх (вид сбоку)", rise: dy + (h2 - h1) / 2, dim: Math.max(h1, h2), plane: "side", perp: "h" },
      { label: "Низ (вид сбоку)", rise: dy - (h2 - h1) / 2, dim: Math.max(h1, h2), plane: "side", perp: "h" },
      { label: "Правая грань (вид сверху)", rise: dx + (w2 - w1) / 2, dim: Math.max(w1, w2), plane: "top", perp: "w" },
      { label: "Левая грань (вид сверху)", rise: dx - (w2 - w1) / 2, dim: Math.max(w1, w2), plane: "top", perp: "w" },
    ];
  }

  // минимальная длина из условия: изменение сечения на срезе <= 10 мм
  let Lmin = 0;
  for (const e of edges) {
    // на обоих концах срез перпендикулярен оси, искажение зависит от сечения каждого конца
    let t;
    if (round) t = Math.min(maxTan(state.d1), maxTan(state.d2));
    else {
      const h1 = state[e.perp === "h" ? "h1" : "w1"];
      const h2 = state[e.perp === "h" ? "h2" : "w2"];
      t = Math.min(maxTan(h1), maxTan(h2));
    }
    e.maxTanPair = t;
    const needL = Math.abs(e.rise) / Math.max(t, 1e-9);
    if (needL > Lmin) Lmin = needL;
  }
  const LminR = Math.max(r10(Lmin), 50);

  const L = mode === "auto" ? LminR : Math.max(Lmanual, 1);

  const results = edges.map((e) => {
    const alpha = Math.atan(e.rise / L); // угол наклона ребра
    const edgeLen = Math.hypot(L, e.rise); // истинная длина ребра
    const cutMark = e.dim * Math.tan(alpha); // "закос" линии реза по оси на всё сечение
    const change = e.dim * (1 / Math.cos(alpha) - 1); // искажение сечения на срезе
    const ok = change <= MAX_CHANGE + 1e-9;
    const Lneed = Math.abs(e.rise) / Math.max(e.maxTanPair, 1e-9);
    return { ...e, alpha: deg(alpha), edgeLen, cutMark, change, ok, Lneed };
  });

  const maxEdge = Math.max(...results.map((r) => r.edgeLen));
  const ok = results.every((r) => r.ok);
  const maxChange = Math.max(...results.map((r) => r.change));
  return { L, Lmin: LminR, results, maxEdge, ok, maxChange, round };
}

// ---------- Визуализация ----------
function DuctView({ state, calc, plane }) {
  const round = state.mode2 === "round";
  const isSide = plane === "side";
  const {
    w1, h1, w2, h2, d1, d2, dx, dy,
  } = state;
  const L = calc.L;
  const ext = 220; // длина показанных прямых участков

  const sizeA = round ? d1 : (isSide ? h1 : w1);
  const sizeB = round ? d2 : (isSide ? h2 : w2);
  const off = isSide ? dy : dx; // смещение центра в этой плоскости

  const zTotal = ext + L + ext;
  const yMin = Math.min(-sizeA / 2, off - sizeB / 2, off) - 60;
  const yMax = Math.max(sizeA / 2, off + sizeB / 2, off) + 60;
  const pad = 55;
  const W = 720, H = 300;
  const sx = (W - 2 * pad) / zTotal;
  const sy = (H - 2 * pad) / (yMax - yMin);
  const s = Math.min(sx, sy);
  const X = (z) => pad + (z + ext) * s;
  const Y = (v) => H - pad - (v - yMin) * s;

  // прямые участки
  const duct1 = [X(-ext), Y(-sizeA / 2), X(0) - X(-ext), sizeA * s];
  const duct2 = [X(L), Y(off - sizeB / 2), X(L + ext) - X(L), sizeB * s];

  // деталь (полигон между срезами)
  const poly = [
    [X(0), Y(sizeA / 2)],
    [X(L), Y(off + sizeB / 2)],
    [X(L), Y(off - sizeB / 2)],
    [X(0), Y(-sizeA / 2)],
  ];
  const center1 = Y(0), center2 = Y(off);

  const topEdge = results => results.find(r => r.plane === plane && r.rise >= 0) || results.find(r => r.plane === plane);
  const botEdge = results => results.find(r => r.plane === plane && r.rise < 0) || results.find(r => r.plane === plane);
  const te = topEdge(calc.results), be = botEdge(calc.results);

  // ГДЕ И СКОЛЬКО СРЕЗАТЬ: заготовка показывается целиком —
  // срезаемый материал выступает НАРУЖУ за плоскость стыка (как на детали до реза)
  const planeEdges = calc.results.filter(r => r.plane === plane);
  const mark = Math.max(...planeEdges.map(r => Math.abs(r.cutMark)));
  const hasCut = mark > 0.5;
  const apexSide = off >= 0 ? 1 : -1; // 1 = верхняя кромка, -1 = нижняя

  // левый торец: треугольник выступает наружу (в сторону входного короба)
  const lTop = [X(0), Y(sizeA / 2)];
  const lBot = [X(0), Y(-sizeA / 2)];
  const lApex = [X(0) - mark * s, Y(apexSide > 0 ? sizeA / 2 : -sizeA / 2)];
  const lTri = [lTop, lBot, lApex];
  const lCut = apexSide > 0 ? [lBot, lApex] : [lTop, lApex]; // линия реза (наклонная грань)
  // правый торец: треугольник выступает наружу (в сторону выходного короба)
  const rTop = [X(L), Y(off + sizeB / 2)];
  const rBot = [X(L), Y(off - sizeB / 2)];
  const rApex = [X(L) + mark * s, Y(off + (apexSide > 0 ? sizeB / 2 : -sizeB / 2))];
  const rTri = [rTop, rBot, rApex];
  const rCut = apexSide > 0 ? [rBot, rApex] : [rTop, rApex]; // линия реза
  const tri2pts = t => t.map(p => p.join(",")).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl border border-slate-200 bg-white">
      <defs>
        <pattern id={`h${plane}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#94a3b8" strokeWidth="1" opacity="0.5" />
        </pattern>
      </defs>
      <text x={16} y={22} fontSize="14" fill="#475569" fontWeight="600">
        {isSide ? "Вид сбоку (профиль — смещение по высоте)" : "Вид сверху (план — смещение по ширине)"}
      </text>
      {hasCut && (
        <text x={W - 16} y={22} fontSize="11" fill="#c2410c" textAnchor="end" fontWeight="600">
          оранжевое — срезаемое на торцах
        </text>
      )}
      {/* прямые участки */}
      <rect x={duct1[0]} y={duct1[1]} width={duct1[2]} height={duct1[3]} fill={`url(#h${plane})`} stroke="#64748b" strokeWidth="2" />
      <rect x={duct2[0]} y={duct2[1]} width={duct2[2]} height={duct2[3]} fill={`url(#h${plane})`} stroke="#64748b" strokeWidth="2" />
      {/* осевые линии */}
      <line x1={duct1[0] - 10} y1={center1} x2={duct2[0] + duct2[2] + 10} y2={center1} stroke="#cbd5e1" strokeDasharray="8 5" />
      <line x1={duct2[0]} y1={center2} x2={duct2[0] + duct2[2] + 10} y2={center2} stroke="#cbd5e1" strokeDasharray="8 5" />
      {/* деталь */}
      <polygon points={poly.map(p => p.join(",")).join(" ")} fill="#38bdf8" fillOpacity="0.18" stroke="#0284c7" strokeWidth="2.5" />
      {/* срезы */}
      <line x1={X(0)} y1={Y(sizeA/2)} x2={X(0)} y2={Y(-sizeA/2)} stroke="#0284c7" strokeWidth="2" strokeDasharray="4 3" />
      <line x1={X(L)} y1={Y(off + sizeB/2)} x2={X(L)} y2={Y(off - sizeB/2)} stroke="#0284c7" strokeWidth="2" strokeDasharray="4 3" />

      {/* ГДЕ И СКОЛЬКО СРЕЗАТЬ (срезаемый материал — снаружи, как на заготовке до реза) */}
      {hasCut && (
        <g>
          <polygon points={tri2pts(lTri)} fill="#f97316" fillOpacity="0.35" stroke="#ea580c" strokeWidth="1.8" />
          <polygon points={tri2pts(rTri)} fill="#f97316" fillOpacity="0.35" stroke="#ea580c" strokeWidth="1.8" />
          {/* величина среза на левом торце (размер вдоль оси) */}
          {(() => {
            const dyL = apexSide > 0 ? -26 : 30;
            const yL = lApex[1] + dyL;
            return (
              <g>
                <g stroke="#ea580c" strokeWidth="1.2">
                  <line x1={X(0)} y1={yL} x2={lApex[0]} y2={yL} />
                  <line x1={X(0)} y1={yL - 5} x2={X(0)} y2={yL + 5} />
                  <line x1={lApex[0]} y1={yL - 5} x2={lApex[0]} y2={yL + 5} />
                </g>
                <text x={(X(0) + lApex[0]) / 2} y={dyL < 0 ? yL - 8 : yL + 16}
                  fontSize="12" fill="#c2410c" textAnchor="middle" fontWeight="700">
                  срезать {fmt(mark, 1)} {MM}
                </text>
              </g>
            );
          })()}
          {/* величина среза на правом торце */}
          {(() => {
            const dyR = apexSide > 0 ? -26 : 30;
            const yR = rApex[1] + dyR;
            return (
              <g>
                <g stroke="#ea580c" strokeWidth="1.2">
                  <line x1={X(L)} y1={yR} x2={rApex[0]} y2={yR} />
                  <line x1={X(L)} y1={yR - 5} x2={X(L)} y2={yR + 5} />
                  <line x1={rApex[0]} y1={yR - 5} x2={rApex[0]} y2={yR + 5} />
                </g>
                <text x={(X(L) + rApex[0]) / 2} y={dyR < 0 ? yR - 8 : yR + 16}
                  fontSize="12" fill="#c2410c" textAnchor="middle" fontWeight="700">
                  срезать {fmt(mark, 1)} {MM}
                </text>
              </g>
            );
          })()}
        </g>
      )}
      {/* угол наклона верхнего ребра */}
      {te && Math.abs(te.rise) > 0.5 && (
        <g>
          <line x1={X(0)} y1={Y(sizeA/2)} x2={X(L)} y2={Y(off + sizeB/2)} stroke="#f59e0b" strokeWidth="1.5" />
          <text x={(X(0)+X(L))/2 - 6} y={Math.min(Y(sizeA/2), Y(off+sizeB/2)) - 8} fontSize="12" fill="#b45309" fontWeight="600">
            α = {fmt(te.alpha, 2)}°
          </text>
        </g>
      )}
      {be && Math.abs(be.rise) > 0.5 && (
        <g>
          <line x1={X(0)} y1={Y(-sizeA/2)} x2={X(L)} y2={Y(off - sizeB/2)} stroke="#f59e0b" strokeWidth="1.5" />
          <text x={(X(0)+X(L))/2 - 6} y={Math.max(Y(-sizeA/2), Y(off-sizeB/2)) + 16} fontSize="12" fill="#b45309" fontWeight="600">
            α = {fmt(be.alpha, 2)}°
          </text>
        </g>
      )}
      {/* размер длины детали */}
      <g stroke="#0f172a" strokeWidth="1">
        <line x1={X(0)} y1={H - 28} x2={X(L)} y2={H - 28} />
        <line x1={X(0)} y1={H - 34} x2={X(0)} y2={H - 22} />
        <line x1={X(L)} y1={H - 34} x2={X(L)} y2={H - 22} />
      </g>
      <text x={(X(0)+X(L))/2} y={H - 34} fontSize="12" fill="#0f172a" textAnchor="middle" fontWeight="600">
        L = {fmt(L, 0)} {MM}
      </text>
      {/* смещение */}
      {Math.abs(off) > 0.5 && (
        <g>
          <line x1={X(L)+28} y1={center1} x2={X(L)+28} y2={center2} stroke="#dc2626" strokeWidth="1.5" />
          <text x={X(L)+34} y={(center1+center2)/2 + 4} fontSize="12" fill="#dc2626" fontWeight="600">
            {isSide ? "Δh" : "Δw"} = {fmt(off, 0)} {MM}
          </text>
        </g>
      )}
      {/* подписи сечений */}
      <text x={duct1[0] + duct1[2]/2} y={duct1[1] - 6} fontSize="11" fill="#475569" textAnchor="middle">
        {round ? `Ø${d1}` : isSide ? `${w1}×${h1}` : `${w1}×${h1}`}
      </text>
      <text x={duct2[0] + duct2[2]/2} y={duct2[1] - 6} fontSize="11" fill="#475569" textAnchor="middle">
        {round ? `Ø${d2}` : `${w2}×${h2}`}
      </text>
    </svg>
  );
}

// ---------- UI-элементы ----------
function NumField({ label, value, onChange, step = 10, min = 0 }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-slate-600 font-medium">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        step={step}
        min={min}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        className="rounded-lg border border-slate-300 px-3 py-2.5 w-full text-base focus:border-sky-500 focus:outline-none"
      />
    </label>
  );
}

function SizeSelect({ label, presets, value, onChange }) {
  const isPair = Array.isArray(presets[0]);
  const cur = isPair ? `${value[0]}×${value[1]}` : `${value}`;
  const known = isPair ? presets.some(p => p[0]===value[0] && p[1]===value[1]) : presets.includes(value);
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-slate-600 font-medium">{label}</span>
      <div className="flex gap-1.5">
        <select
          value={known ? cur : "custom"}
          onChange={(e) => {
            const v = e.target.value;
            if (v !== "custom") onChange(isPair ? v.split("×").map(Number) : Number(v));
          }}
          className="rounded-lg border border-slate-300 px-1.5 py-2.5 flex-1 min-w-0 bg-white text-sm"
        >
          {isPair
            ? presets.map(([a, b]) => <option key={`${a}x${b}`} value={`${a}×${b}`}>{a}×{b}</option>)
            : presets.map((d) => <option key={d} value={d}>Ø{d}</option>)}
          <option value="custom">Другое…</option>
        </select>
        {isPair ? (
          <input type="number" inputMode="numeric" value={value[0]} min={50} step={10}
            onChange={(e)=>onChange([Number(e.target.value), value[1]])}
            className="w-16 rounded-lg border border-slate-300 px-2 py-2.5 text-base" title="Ширина" />
        ) : (
          <input type="number" inputMode="numeric" value={value} min={50} step={5}
            onChange={(e)=>onChange(Number(e.target.value))}
            className="w-16 rounded-lg border border-slate-300 px-2 py-2.5 text-base" title="Диаметр" />
        )}
        {isPair && (
          <input type="number" inputMode="numeric" value={value[1]} min={50} step={10}
            onChange={(e)=>onChange([value[0], Number(e.target.value)])}
            className="w-16 rounded-lg border border-slate-300 px-2 py-2.5 text-base" title="Высота" />
        )}
      </div>
    </div>
  );
}

// ---------- Приложение ----------
export default function App() {
  const [shape, setShape] = useState("rect");
  const [w1, setW1] = useState(200);
  const [h1, setH1] = useState(200);
  const [w2, setW2] = useState(150);
  const [h2, setH2] = useState(200);
  const [d1, setD1] = useState(200);
  const [d2, setD2] = useState(150);
  const [dx, setDx] = useState(100);
  const [dy, setDy] = useState(150);
  const [diffSection, setDiffSection] = useState(false);
  const [mode, setMode] = useState("auto");
  const [Lmanual, setLmanual] = useState(300);

  const state = {
    shape, w1, h1,
    w2: diffSection ? w2 : w1,
    h2: diffSection ? h2 : h1,
    d1, d2: diffSection ? d2 : d1,
    dx, dy, mode, Lmanual,
  };
  const enableDiff = (v) => {
    if (v) { // при включении переход стартует с одинаковых сечений
      setW2(w1); setH2(h1); setD2(d1);
    }
    setDiffSection(v);
  };
  const calc = useMemo(() => compute(state), [shape, w1, h1, w2, h2, d1, d2, dx, dy, mode, Lmanual]);

  const card = "rounded-2xl bg-white border border-slate-200 shadow-sm p-3 sm:p-5";
  const th = "text-left text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wide px-2 sm:px-3 py-2 whitespace-nowrap";
  const td = "px-2 sm:px-3 py-2 border-t border-slate-100 whitespace-nowrap";

  return (
    <div className="min-h-screen bg-slate-100 p-2.5 sm:p-6 md:p-8 text-slate-900">
      <div className="max-w-6xl mx-auto flex flex-col gap-3 sm:gap-5">
        <header>
          <h1 className="text-xl md:text-3xl font-bold">Калькулятор закосов венткоробов 🔧</h1>
          <p className="text-slate-600 mt-1 text-xs sm:text-sm md:text-base">
            Переходная деталь между коробами разных сечений со смещением по высоте/ширине.
            Контроль изменения сечения на срезе — не более 10 мм.
          </p>
        </header>

        {/* Параметры */}
        <section className={card}>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            <div className="flex flex-col gap-1 text-sm col-span-2 md:col-span-1">
              <span className="text-slate-600 font-medium">Тип короба</span>
              <div className="flex rounded-lg border border-slate-300 overflow-hidden">
                <button onClick={()=>setShape("rect")}
                  className={`flex-1 px-3 py-2.5 font-medium text-sm ${shape==="rect"?"bg-sky-600 text-white":"bg-white"}`}>Прямоугольный</button>
                <button onClick={()=>setShape("round")}
                  className={`flex-1 px-3 py-2.5 font-medium text-sm ${shape==="round"?"bg-sky-600 text-white":"bg-white"}`}>Круглый</button>
              </div>
            </div>

            {shape === "rect" ? (
              <>
                <div><SizeSelect label="Сечение короба (Ш×В)" presets={PRESETS} value={[w1, h1]} onChange={([a,b])=>{setW1(a);setH1(b);}} /></div>
                <div className={diffSection ? "" : "hidden"}><SizeSelect label="Выходное сечение (Ш×В)" presets={PRESETS} value={[w2, h2]} onChange={([a,b])=>{setW2(a);setH2(b);}} /></div>
              </>
            ) : (
              <>
                <div><SizeSelect label="Диаметр короба Ø" presets={ROUND_PRESETS} value={d1} onChange={setD1} /></div>
                <div className={diffSection ? "" : "hidden"}><SizeSelect label="Выходной Ø" presets={ROUND_PRESETS} value={d2} onChange={setD2} /></div>
              </>
            )}

            <label className="col-span-2 md:col-span-1 flex items-center gap-2 self-end pb-1 cursor-pointer select-none">
              <input type="checkbox" checked={diffSection} onChange={(e)=>enableDiff(e.target.checked)}
                className="w-5 h-5 accent-sky-600" />
              <span className="text-sm font-medium text-slate-600">Разное сечение на концах (переход)</span>
            </label>

            <NumField label="Смещение Δw (ширина), мм" value={dx} onChange={setDx} />
            <NumField label="Смещение Δh (высота), мм" value={dy} onChange={setDy} />

            <div className="col-span-2 flex flex-col gap-1 text-sm">
              <span className="text-slate-600 font-medium">Длина детали</span>
              <div className="flex flex-wrap gap-2 items-stretch">
                <button onClick={()=>setMode("auto")}
                  className={`px-3 py-2.5 rounded-lg font-medium text-sm flex-1 ${mode==="auto"?"bg-sky-600 text-white":"bg-white border border-slate-300"}`}>
                  Авто (мин.)
                </button>
                <button onClick={()=>setMode("manual")}
                  className={`px-3 py-2.5 rounded-lg font-medium text-sm flex-1 ${mode==="manual"?"bg-sky-600 text-white":"bg-white border border-slate-300"}`}>
                  Своя длина
                </button>
                {mode === "manual" && (
                  <input type="number" inputMode="numeric" value={Lmanual} step={10} min={10}
                    onChange={(e)=>setLmanual(Math.max(1,Number(e.target.value)))}
                    className="w-full sm:w-28 rounded-lg border border-slate-300 px-3 py-2.5 text-base" />
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Статус */}
        <section className={`rounded-2xl border p-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8 gap-y-1 font-semibold text-sm md:text-base
          ${calc.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"}`}>
          <span className="sm:w-full">
            {calc.ok
              ? "✅ Сечение на срезе изменяется не более чем на 10 мм"
              : `⚠️ Сечение на срезе изменится на ${fmt(calc.maxChange, 1)} мм (допуск 10 мм) — увеличьте длину детали до ≥ ${fmt(calc.Lmin, 0)} мм`}
          </span>
          <span>Длина детали L = <b>{fmt(calc.L,0)} мм</b></span>
          <span>Мин. допустимая длина = <b>{fmt(calc.Lmin,0)} мм</b></span>
          <span>Заготовка (макс. ребро) = <b>{fmt(calc.maxEdge,0)} мм</b></span>
          {!calc.ok && <span>Изменение сечения: до <b>{fmt(calc.maxChange,1)} мм</b></span>}
        </section>

        {/* Визуализация */}
        <section className="flex flex-col gap-4">
          <DuctView state={{...state, mode2: shape}} calc={calc} plane="side" />
          <DuctView state={{...state, mode2: shape}} calc={calc} plane="top" />
        </section>

        {/* Разметка: сколько срезать */}
        <section className={card}>
          {(() => {
            const sideEdges = calc.results.filter(r => r.plane === "side");
            const topEdges = calc.results.filter(r => r.plane === "top");
            const markSide = Math.max(...sideEdges.map(r => Math.abs(r.cutMark)));
            const markTop = Math.max(...topEdges.map(r => Math.abs(r.cutMark)));
            const hasSide = Math.abs(markSide) > 0.01;
            const hasTop = Math.abs(markTop) > 0.01;
            return (
              <>
                <h2 className="font-bold text-lg mb-1">Разметка и резка детали 📏</h2>
                <p className="text-xs text-slate-500 mb-3">
                  Деталь делается из куска такого же короба. Ниже — сколько и как срезать с каждого торца.
                </p>
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex flex-wrap gap-x-6 gap-y-1">
                    <span>1. Отрезать заготовку длиной <b className="text-sky-700 text-base">{fmt(calc.maxEdge, 0)} мм</b></span>
                    <span>2. Осевая длина детали между срезами: <b>{fmt(calc.L, 0)} мм</b></span>
                  </div>
                  {hasSide ? (
                    <div className="rounded-lg bg-sky-50 border border-sky-200 px-4 py-3">
                      <b>Рез на обоих торцах по высоте (вид сбоку):</b> линия реза идёт под углом
                      <b className="text-sky-700"> {fmt(sideEdges.map(r=>r.alpha).reduce((a,b)=>Math.abs(a)>Math.abs(b)?a:b), 2)}°</b> —
                      от края до края высоты сечения она уходит по длине короба на
                      <b className="text-sky-700 text-base"> {fmt(markSide, 1)} мм</b>.
                      Скос — в сторону смещения по высоте ({dy > 0 ? "вверх" : dy < 0 ? "вниз" : "—"}).
                    </div>
                  ) : (
                    <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
                      По высоте смещения нет — торцы срезать по высоте не нужно (только переход сечения).
                    </div>
                  )}
                  {hasTop ? (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
                      <b>Рез на обоих торцах по ширине (вид сверху):</b> линия реза идёт под углом
                      <b className="text-amber-700"> {fmt(topEdges.map(r=>r.alpha).reduce((a,b)=>Math.abs(a)>Math.abs(b)?a:b), 2)}°</b> —
                      от края до края ширины сечения она уходит по длине на
                      <b className="text-amber-700 text-base"> {fmt(markTop, 1)} мм</b>.
                      Скос — в сторону смещения по ширине ({dx > 0 ? "вправо" : dx < 0 ? "влево" : "—"}).
                    </div>
                  ) : (
                    <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
                      По ширине смещения нет — скоса по ширине не требуется.
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </section>

        {/* Таблица результатов */}
        <section className={card}>
          <h2 className="font-bold text-base sm:text-lg mb-3">Результаты по граням</h2>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-xs sm:text-sm min-w-[560px]">
              <thead>
                <tr>
                  <th className={th}>Грань / ребро</th>
                  <th className={th}>Смещение ребра, мм</th>
                  <th className={th}>Угол наклона α, °</th>
                  <th className={th}>Скос реза (уход линии по длине), мм</th>
                  <th className={th}>Длина ребра, мм</th>
                  <th className={th}>Искажение сечения, мм</th>
                  <th className={th}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {calc.results.map((r, i) => (
                  <tr key={i}>
                    <td className={`${td} font-medium`}>{r.label}</td>
                    <td className={td}>{fmt(r.rise, 1)}</td>
                    <td className={td}>{fmt(r.alpha, 2)}°</td>
                    <td className={td}>{fmt(r.cutMark, 1)}</td>
                    <td className={td}>{fmt(r.edgeLen, 1)}</td>
                    <td className={`${td} ${r.ok ? "" : "text-rose-600 font-semibold"}`}>{fmt(r.change, 1)}</td>
                    <td className={td}>{r.ok ? "✅" : `⚠️ нужно L ≥ ${fmt(r.Lneed,0)} мм`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500 mt-3">
            «Закос линии реза» — насколько линия реза уходит по длине короба поперёк всего сечения
            (при разметке реза на торце). «Длина ребра» — истинная длина наклонной кромки детали.
            Искажение сечения на косом срезе = D·(1/cos α − 1); ограничено 10 мм.
          </p>
        </section>
      </div>
    </div>
  );
}