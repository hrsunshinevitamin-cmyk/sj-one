import "./style.css";

/* ============================================================
   SJ ONE PRODUCTION v3.3
   업그레이드: 영업(필터+완료체크+대안타깃) · 기업360(구조화+메모)
             투자(원화 손익분해+이벤트+지지/저항) · 비서(5점 루틴+90일)
   데이터 계약(Apps Script payload)은 v3.2와 동일 — 백엔드 수정 불필요
   ============================================================ */

const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, "0");
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const getLS = (k, def) => { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } };
const setLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

/* ---------- 데모 데이터 (연결 전 표시용, v3.2와 동일) ---------- */
const demo = {
  updatedAt: new Date().toLocaleString("ko-KR"), live: false,
  daily: [{ "결정": "오늘전화", "회사명": "예시반도체", "산업": "반도체", "직무/포지션": "품질/해외영업", "점수": "91", "근거요약": "반도체 경력직 복수 채용 + 증설/수주 신호", "추천액션": "담당자 찾기 → 전화/메일 동시", "영업멘트": "최근 경력직 채용 신호를 확인했습니다. 적합 후보자 추천 가능성이 있어 짧게 논의드리고 싶습니다.", "링크": "https://example.com" }],
  onestop: [{ "회사명": "예시반도체", "영업등급": "A", "추천결정": "오늘전화", "핵심공고/신호": "품질/해외영업 경력직 채용", "기본정보 요약": "반도체 장비·소재 관련 기업. 상세 매출/고객사는 확인 필요.", "시장평가/성장성": "증설·수주 키워드 감지.", "재직자·경력자 평가 단서": "검색 단서 부족. 평판 추가 확인 필요.", "리스크/거절가능성": "직접채용 가능성. 헤드헌팅 활용 여부 확인 필요.", "접근전략": "채용난이도와 후보자 추천 가능성으로 접근.", "추천 영업멘트": "관련 후보자 추천 가능성이 있어 짧게 논의드리고 싶습니다.", "근거링크": "https://example.com" }],
  alt: [{ "회사명": "대안소부장", "산업": "반도체", "추정직무": "품질", "영업점수": "72", "추천등급": "B-후보DB", "수집근거": "소부장 경력 채용 감지", "링크": "https://example.com" }],
  candidates: [
    { name: "김OO", role: "반도체 품질", fit: 86, risk: "연봉/거리 확인 필요", action: "품질 포지션 우선 검토" },
    { name: "박OO", role: "자동화 SW", fit: 78, risk: "독립수행 경험 확인", action: "장비 SW 후보로 보류풀" }
  ],
  investments: [
    { name: "KODEX 코스닥150", category: "ETF", ticker: "229200", avg: 16900, cur: null, pnlPct: null, judgment: "실시간 연결 전", rule: "Apps Script 연결 후 현재가 자동 반영", action: "설정에서 웹앱 URL 저장 후 갱신" },
    { name: "GME", category: "미국주식", ticker: "GME", avg: 28.15, cur: null, pnlPct: null, judgment: "실시간 연결 전", rule: "Apps Script 연결 후 현재가 자동 반영", action: "설정에서 웹앱 URL 저장 후 갱신" },
    { name: "원/달러 환율", category: "환율", ticker: "USDKRW", avg: null, cur: null, pnlPct: null, judgment: "실시간 연결 전", rule: "환율 착시 주의", action: "설정에서 웹앱 URL 저장 후 갱신" }
  ]
};

/* ---------- 상태 ---------- */
const state = {
  tab: localStorage.getItem("sjone_tab") || "home",
  apiUrl: localStorage.getItem("sjone_api_url") || "",
  data: demo, selectedCompany: null, loading: false,
  salesFilter: "전체"
};
const NAV = [["home", "홈"], ["sales", "영업"], ["company", "기업360"], ["sourcing", "소싱"], ["candidate", "후보"], ["investment", "투자"], ["assistant", "비서"]];

/* ---------- 공용 헬퍼 ---------- */
const esc = x => String(x ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const num = x => x == null || x === "" || isNaN(Number(String(x).replace(/,/g, ""))) ? null : Number(String(x).replace(/,/g, ""));
const won = n => n == null ? "-" : (n < 0 ? "-" : "") + Math.abs(Math.round(n)).toLocaleString("ko-KR") + "원";
const signWon = n => n == null ? "-" : (n >= 0 ? "+" : "-") + Math.abs(Math.round(n)).toLocaleString("ko-KR") + "원";
function badge(t, c = "warn") { return `<span class="badge ${c}">${esc(t)}</span>`; }
function tone(d) { d = String(d || ""); return d.includes("오늘전화") ? "bad" : d.includes("오늘메일") ? "warn" : d.includes("접촉") ? "good" : ""; }
function kv(k, v) { return v ? `<div class="kv"><b>${esc(k)}</b><span>${esc(v)}</span></div>` : ""; }

/* ---------- 레이아웃 ---------- */
function layout(content, note = "") {
  return `<div class="app"><header class="top"><div><div class="brand">SJ <b>ONE</b> PRODUCTION <span class="version">v3.3</span></div><div class="sub">영업 · 후보 · 소싱 · 투자 · 개인비서 통합 대시보드</div></div><div class="pillRow"><button class="btn" data-tab="settings">설정</button><button class="btn gold" id="refreshBtn">갱신</button></div></header>${note ? `<div class="notice">${esc(note)}</div>` : ""}${content}<nav class="bottom">${NAV.map(([k, l]) => `<button class="${state.tab === k ? "on" : ""}" data-tab="${k}">${l}</button>`).join("")}</nav></div>`;
}
function stats() {
  const d = state.data || demo, dy = d.daily || [], os = d.onestop || [], alt = d.alt || [];
  return {
    call: dy.filter(x => String(x["결정"]).includes("오늘전화")).length,
    mail: dy.filter(x => String(x["결정"]).includes("오늘메일")).length,
    a: os.filter(x => String(x["영업등급"]).includes("A")).length,
    alt: alt.length
  };
}

/* ============================================================
   영업 탭 — 필터 + 처리완료 체크 + 대안타깃
   완료 상태는 날짜별로 이 기기(localStorage)에 저장됩니다.
   ============================================================ */
const doneKey = () => "sjone_done_" + todayKey();
const getDone = () => getLS(doneKey(), []);
const isDone = name => getDone().includes(name);
function toggleDone(name) {
  const d = getDone(), i = d.indexOf(name);
  if (i >= 0) d.splice(i, 1); else d.push(name);
  setLS(doneKey(), d);
}

function salesCard(r) {
  const name = r["회사명"] || "";
  const done = isDone(name);
  return `<div class="item companyItem ${done ? "doneItem" : ""}" data-company="${esc(name)}">
    <div class="row"><div><div class="company">${esc(name || "회사명 확인필요")}</div><div class="muted">${esc(r["산업"] || "")} · ${esc(r["직무/포지션"] || "")}</div></div>
    <div class="pillRow">${badge(r["결정"] || "판단", tone(r["결정"]))}<button class="doneBtn ${done ? "on" : ""}" data-done="${esc(name)}">${done ? "완료 ✓" : "완료체크"}</button></div></div>
    <p>${esc(r["근거요약"] || "")}</p>
    <div class="actionBox">${esc(r["추천액션"] || "")}</div>
    ${r["영업멘트"] ? `<details><summary>영업멘트</summary><p>${esc(r["영업멘트"])}</p></details>` : ""}
    ${r["링크"] ? `<a class="link" href="${esc(r["링크"])}" target="_blank">근거 열기</a>` : ""}
  </div>`;
}

function sales() {
  const dy = state.data.daily || [];
  const filters = ["전체", "오늘전화", "오늘메일", "기타"];
  const f = state.salesFilter;
  const rows = dy.filter(r => {
    const d = String(r["결정"] || "");
    if (f === "전체") return true;
    if (f === "기타") return !d.includes("오늘전화") && !d.includes("오늘메일");
    return d.includes(f);
  });
  const doneCount = dy.filter(r => isDone(r["회사명"] || "")).length;
  const pct = dy.length ? Math.round(doneCount / dy.length * 100) : 0;
  const alt = state.data.alt || [];
  return `<main class="grid">
    <section class="card"><div class="sectionTitle">Sales Radar — 오늘_영업판단</div>
      <div class="progressWrap"><div class="progressBar" style="width:${pct}%"></div></div>
      <div class="muted" style="margin-top:6px">오늘 처리 ${doneCount} / ${dy.length}건 (${pct}%) · 완료 체크는 이 기기에 저장</div>
      <div class="pillRow" style="margin-top:10px">${filters.map(x => `<button class="btn small filterBtn ${f === x ? "goldOutline" : ""}" data-filter="${x}">${x}</button>`).join("")}</div>
    </section>
    <section class="list">${rows.map(salesCard).join("") || `<div class="card">해당 필터 데이터 없음</div>`}</section>
    <section class="card"><div class="sectionTitle">대안타깃 — 거절 시 이동</div>
      <div class="list">${alt.map(r => `<div class="item"><div class="row"><div><div class="company">${esc(r["회사명"] || "")}</div><div class="muted">${esc(r["산업"] || "")} · ${esc(r["추정직무"] || "")}</div></div>${badge((r["추천등급"] || "-") + " · " + (r["영업점수"] || "-") + "점", String(r["추천등급"]).startsWith("B") ? "warn" : "")}</div><p>${esc(r["수집근거"] || "")}</p>${r["링크"] ? `<a class="link" href="${esc(r["링크"])}" target="_blank">근거 열기</a>` : ""}</div>`).join("") || `<div class="muted">대안타깃 데이터 없음</div>`}</div>
    </section>
  </main>`;
}

/* ============================================================
   기업360 탭 — 구조화 양식 + 기업별 메모
   메모는 기업별로 이 기기(localStorage)에 저장됩니다.
   ============================================================ */
const memoKey = name => "sjone_memo_" + name;
function company() {
  const rows = state.data.onestop || [];
  const sel = state.selectedCompany || (rows[0] && rows[0]["회사명"]);
  const r = rows.find(x => x["회사명"] === sel) || rows[0];
  if (!r) return `<main class="grid"><div class="card">기업_원스탑 데이터 없음</div></main>`;
  const name = r["회사명"] || "";
  const memo = getLS(memoKey(name), { text: "", at: "" });
  const links = String(r["근거링크"] || "").split(/\n+/).map(s => s.trim()).filter(s => s.startsWith("http"));
  const SECTIONS = [
    ["핵심공고/신호", r["핵심공고/신호"]],
    ["기본정보", r["기본정보 요약"]],
    ["시장평가/성장성", r["시장평가/성장성"]],
    ["평판 단서", r["재직자·경력자 평가 단서"]],
    ["리스크/거절가능성", r["리스크/거절가능성"]]
  ];
  return `<main class="grid">
    <section class="card hero"><div class="row"><div><div class="eyebrow">Company 360</div><h1>${esc(name)}</h1></div>${badge((r["영업등급"] || "-") + " · " + (r["추천결정"] || "-"), String(r["영업등급"]).includes("A") ? "bad" : "warn")}</div>
      <div class="actionBox">${esc(r["접근전략"] || "접근전략 없음")}</div>
      ${r["추천 영업멘트"] ? `<details style="margin-top:10px"><summary>추천 영업멘트 (통화 전 확인)</summary><p>${esc(r["추천 영업멘트"])}</p></details>` : ""}
    </section>
    <section class="card"><div class="sectionTitle">기업 선택</div><div class="pillRow">${rows.slice(0, 20).map(x => `<button class="btn small companyPick ${x["회사명"] === name ? "goldOutline" : ""}" data-company="${esc(x["회사명"])}">${esc(x["회사명"])}</button>`).join("")}</div></section>
    <section class="card"><div class="sectionTitle">기업 정보 (구조화)</div>
      ${SECTIONS.map(([k, v]) => kv(k, v)).join("") || `<div class="muted">항목 없음</div>`}
      ${links.length ? `<div class="kv"><b>근거 링크</b><span>${links.map((u, i) => `<a class="link" href="${esc(u)}" target="_blank">링크 ${i + 1} 열기</a>`).join(" · ")}</span></div>` : ""}
    </section>
    <section class="card"><div class="sectionTitle">내 메모 — ${esc(name)}</div>
      <p class="muted">통화 결과·담당자·다음 액션을 남기세요. 이 기기에 저장됩니다.</p>
      <textarea id="memoBox" placeholder="예: 7/7 민 과장 통화. 품질 JD 재확인 요청. 금요일 재통화.">${esc(memo.text)}</textarea>
      <div class="row" style="margin-top:8px;align-items:center"><span class="muted">${memo.at ? "마지막 저장: " + esc(memo.at) : "저장된 메모 없음"}</span><button class="btn gold" id="saveMemo" data-company="${esc(name)}">메모 저장</button></div>
    </section>
  </main>`;
}

/* ============================================================
   투자 탭 — 원화 기준 손익 분해 + 지지/저항 + 이벤트 캘린더
   매수/매도 추천이 아니라 감정매매 차단용 계기판입니다.
   ============================================================ */
const INV_CFG_DEFAULT = { kodexQty: 100, gmeQty: 100, entryFx: 1418, sup: {}, res: {} };
const getInvCfg = () => ({ ...INV_CFG_DEFAULT, ...getLS("sjone_inv_cfg", {}) });
const DEFAULT_EVENTS = [
  { date: "2026-07-10", label: "SK하이닉스 나스닥 ADR 상장" },
  { date: "2026-07-16", label: "한국은행 금통위 (기준금리)" },
  { date: "2026-07-29", label: "SK하이닉스 2분기 실적" },
  { date: "2026-07-30", label: "삼성전자 확정실적 콘퍼런스콜(잠정)" }
];
const getEvents = () => getLS("sjone_events", DEFAULT_EVENTS);
function dday(dateStr) {
  const t = new Date(todayKey()), d = new Date(dateStr);
  const diff = Math.round((d - t) / 86400000);
  return diff === 0 ? "D-DAY" : diff > 0 ? "D-" + diff : "지남";
}
function srLine(cfg, key, cur) {
  const s = num(cfg.sup[key]), r = num(cfg.res[key]);
  if (s == null && r == null) return "";
  let pos = "";
  if (cur != null) {
    if (s != null && cur <= s) pos = badge("지지선 이탈 주의", "bad");
    else if (r != null && cur >= r) pos = badge("저항선 도달", "good");
    else pos = badge("지지-저항 사이", "");
  }
  return `<div class="kv"><b>지지 / 저항</b><span>${s != null ? s.toLocaleString() : "-"} / ${r != null ? r.toLocaleString() : "-"} ${pos}</span></div>`;
}

function investment() {
  const inv = state.data.investments || demo.investments;
  const cfg = getInvCfg();
  const find = t => inv.find(x => String(x.ticker) === t) || {};
  const kodex = find("229200"), gme = find("GME"), fx = find("USDKRW");
  const kCur = num(kodex.cur), kAvg = num(kodex.avg) ?? 16900;
  const gCur = num(gme.cur), gAvg = num(gme.avg) ?? 28.15;
  const fCur = num(fx.cur), fEntry = num(cfg.entryFx) ?? 1418;

  /* KODEX 원화 손익 */
  const kPnl = kCur != null ? (kCur - kAvg) * cfg.kodexQty : null;
  const kPct = kCur != null ? ((kCur - kAvg) / kAvg * 100) : null;

  /* GME 원화 손익 분해: 총 = 주가분 + 환율분
     주가분 = (현재$ − 평단$) × 현재환율 × 수량
     환율분 = 평단$ × (현재환율 − 진입환율) × 수량 */
  let gTot = null, gPrice = null, gFx = null, gPct = null;
  if (gCur != null && fCur != null) {
    gPrice = (gCur - gAvg) * fCur * cfg.gmeQty;
    gFx = gAvg * (fCur - fEntry) * cfg.gmeQty;
    gTot = gPrice + gFx;
    gPct = (gCur - gAvg) / gAvg * 100;
  }
  const totAll = (kPnl != null && gTot != null) ? kPnl + gTot : null;
  const events = getEvents();

  return `<main class="grid">
    <section class="card hero"><div class="eyebrow">Investment Desk</div><h1>총 평가손익 <span class="${totAll == null ? "" : totAll >= 0 ? "profit" : "loss"}">${totAll == null ? "연결 필요" : signWon(totAll)}</span></h1>
      <p>추천 매수/매도가 아니라 감정매매 차단용 계기판입니다. 모든 손익은 원화 기준.</p>
      <div class="actionBox">${state.data.live ? "실시간 연결됨: " + esc(state.data.updatedAt) : "실시간 연결 전: 설정에서 Apps Script 웹앱 URL 저장 후 갱신"}</div>
    </section>

    <section class="grid2">
      <div class="card"><div class="row"><div><div class="company">KODEX 코스닥150</div><div class="muted">ETF · 229200 · ${cfg.kodexQty}주</div></div>${badge(kPct == null ? "-" : (kPct >= 0 ? "+" : "") + kPct.toFixed(2) + "%", kPct == null ? "" : kPct >= 0 ? "good" : "bad")}</div>
        <table class="table"><tbody>
          <tr><th>평단</th><td>${kAvg.toLocaleString()}원</td></tr>
          <tr><th>현재</th><td>${kCur != null ? kCur.toLocaleString() + "원" : "체크필요"}</td></tr>
          <tr><th>평가손익</th><td class="${kPnl == null ? "" : kPnl >= 0 ? "profit" : "loss"}">${kPnl == null ? "-" : signWon(kPnl)}</td></tr>
        </tbody></table>
        ${srLine(cfg, "kodex", kCur)}
        <div class="actionBox">코스닥 반등 확인 신호: 지수 등락이 아니라 코스피 대비 상대강도 + 외국인 코스닥 순매수 전환.</div>
      </div>

      <div class="card"><div class="row"><div><div class="company">GME</div><div class="muted">미국주식 · ${cfg.gmeQty}주 · 진입환율 ${fEntry.toLocaleString()}원</div></div>${badge(gPct == null ? "-" : (gPct >= 0 ? "+" : "") + gPct.toFixed(2) + "%", gPct == null ? "" : gPct >= 0 ? "good" : "bad")}</div>
        <table class="table"><tbody>
          <tr><th>평단</th><td>$${gAvg}</td></tr>
          <tr><th>현재</th><td>${gCur != null ? "$" + gCur : "체크필요"} ${fCur != null ? `<span class="muted">(환율 ${fCur.toLocaleString()}원)</span>` : ""}</td></tr>
          <tr><th>총 손익(원화)</th><td class="${gTot == null ? "" : gTot >= 0 ? "profit" : "loss"}">${gTot == null ? "-" : signWon(gTot)}</td></tr>
          <tr><th>└ 주가 요인</th><td class="${gPrice == null ? "" : gPrice >= 0 ? "profit" : "loss"}">${gPrice == null ? "-" : signWon(gPrice)}</td></tr>
          <tr><th>└ 환율 요인</th><td class="${gFx == null ? "" : gFx >= 0 ? "profit" : "loss"}">${gFx == null ? "-" : signWon(gFx)}</td></tr>
        </tbody></table>
        ${srLine(cfg, "gme", gCur)}
        <div class="actionBox">환율 착시 주의: 주가가 빠져도 환율이 벌어주는 구간이 있습니다. 판단은 주가 요인 기준으로.</div>
      </div>
    </section>

    <section class="card"><div class="sectionTitle">이벤트 캘린더</div>
      <div class="list">${events.map((e, i) => `<div class="item eventItem"><div class="row"><div><div class="company" style="font-size:14px">${esc(e.label)}</div><div class="muted">${esc(e.date)}</div></div><div class="pillRow">${badge(dday(e.date), dday(e.date) === "D-DAY" ? "bad" : dday(e.date) === "지남" ? "" : "warn")}<button class="doneBtn" data-delevent="${i}">삭제</button></div></div></div>`).join("") || `<div class="muted">이벤트 없음</div>`}</div>
      <div class="row" style="margin-top:10px;gap:8px"><input id="evDate" type="date" style="max-width:160px"><input id="evLabel" placeholder="이벤트 이름 (예: 미 CPI 발표)"><button class="btn gold" id="addEvent">추가</button></div>
    </section>

    <section class="card"><div class="sectionTitle">투자 설정 (이 기기에 저장)</div>
      <div class="cfgGrid">
        <label>KODEX 수량<input id="cfgKQty" type="number" value="${cfg.kodexQty}"></label>
        <label>GME 수량<input id="cfgGQty" type="number" value="${cfg.gmeQty}"></label>
        <label>GME 진입환율<input id="cfgFx" type="number" value="${cfg.entryFx}"></label>
        <label>KODEX 지지<input id="cfgKSup" type="number" value="${cfg.sup.kodex ?? ""}"></label>
        <label>KODEX 저항<input id="cfgKRes" type="number" value="${cfg.res.kodex ?? ""}"></label>
        <label>GME 지지($)<input id="cfgGSup" type="number" step="0.01" value="${cfg.sup.gme ?? ""}"></label>
        <label>GME 저항($)<input id="cfgGRes" type="number" step="0.01" value="${cfg.res.gme ?? ""}"></label>
      </div>
      <div style="height:8px"></div><button class="btn gold" id="saveInvCfg">설정 저장</button>
    </section>
  </main>`;
}

/* ============================================================
   비서 탭 — 매일 5점 루틴 + 90일 습관 트래커
   기록은 날짜별로 이 기기(localStorage)에 저장됩니다.
   ============================================================ */
const ROUTINE_ITEMS = ["후보자 연락", "고객사 커뮤니케이션", "제안서 제출", "신규 고객 개척", "미팅"];
const getRoutine = () => getLS("sjone_routine", {});
function routineScore(day) { const r = getRoutine()[day]; return r ? r.filter(Boolean).length : 0; }
function toggleRoutine(idx) {
  const all = getRoutine(), t = todayKey();
  const arr = all[t] || ROUTINE_ITEMS.map(() => false);
  arr[idx] = !arr[idx]; all[t] = arr; setLS("sjone_routine", all);
}
function lastNDays(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  return out;
}
function streak() {
  let s = 0;
  for (let i = 0; ; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (routineScore(k) >= 3) s++;
    else { if (i === 0) continue; break; } /* 오늘 미달성은 스트릭 유지, 어제부터 판단 */
    if (i > 365) break;
  }
  return s;
}

function assistant() {
  const t = todayKey();
  const todayArr = getRoutine()[t] || ROUTINE_ITEMS.map(() => false);
  const score = todayArr.filter(Boolean).length;
  const days90 = lastNDays(90);
  const week = lastNDays(7);
  const weekAvg = (week.reduce((a, d) => a + routineScore(d), 0) / 7).toFixed(1);
  const st = streak();
  return `<main class="grid">
    <section class="card hero"><div class="eyebrow">SJ Assistant — 데일리 5점</div>
      <h1>오늘 ${score} <span class="muted" style="font-size:18px">/ 5점</span></h1>
      <div class="row"><span class="muted">주간 평균 ${weekAvg}점 · 3점 이상 연속 ${st}일</span>${badge(score >= 5 ? "만점" : score >= 3 ? "목표 달성" : "진행 중", score >= 3 ? "good" : "warn")}</div>
      <div class="actionBox">시스템 수정은 하루 1회, 영업 행동은 즉시 실행. 5점은 결과가 아니라 행동 점수입니다.</div>
    </section>
    <section class="card"><div class="sectionTitle">오늘의 5점 체크 (${esc(t)})</div>
      <div class="list">${ROUTINE_ITEMS.map((label, i) => `<button class="routineRow ${todayArr[i] ? "on" : ""}" data-ri="${i}"><span class="rCheck">${todayArr[i] ? "✓" : ""}</span><span>${esc(label)}</span></button>`).join("")}</div>
    </section>
    <section class="card"><div class="sectionTitle">90일 습관 트래커</div>
      <p class="muted">색이 진할수록 점수가 높은 날. 목표: 90일 습관화.</p>
      <div class="habitGrid">${days90.map(d => { const s = routineScore(d); return `<span class="hCell h${s}" title="${d} · ${s}점"></span>`; }).join("")}</div>
      <div class="row" style="margin-top:8px"><span class="muted">← ${esc(days90[0])}</span><span class="muted">${esc(days90[89])} →</span></div>
    </section>
    <section class="card"><div class="sectionTitle">운영 원칙</div>
      <ol class="todo"><li>SJ ONE은 하루 2회만 확인</li><li>시트는 오늘_영업판단 / 기업_원스탑만 보기</li><li>새 기능 추가는 월 1회 이하</li><li>매출과 직접 관련 없는 자동화는 보류</li></ol>
    </section>
  </main>`;
}

/* ---------- 홈 / 소싱 / 후보 / 설정 (v3.2 유지 + 소폭 보강) ---------- */
function home() {
  const d = state.data || demo, dy = d.daily || [], top = dy[0] || {}, s = stats();
  const score = routineScore(todayKey());
  return `<main class="grid"><section class="card hero"><div class="eyebrow">오늘의 최우선 판단</div><h1>${esc(top["회사명"] || "오늘 영업판단 생성 필요")}</h1><div class="row"><div>${badge(top["결정"] || "대기", tone(top["결정"]))}</div><span class="muted">점수 ${esc(top["점수"] || "-")}</span></div><p>${esc(top["근거요약"] || "Apps Script URL 연결 후 갱신하세요.")}</p><div class="actionBox">${esc(top["추천액션"] || "오늘_영업판단과 기업_원스탑 2개만 보고 움직이세요.")}</div></section><section class="grid4"><div class="card"><div class="metric">${s.call}</div><div class="label">오늘 전화</div></div><div class="card"><div class="metric">${s.mail}</div><div class="label">오늘 메일</div></div><div class="card"><div class="metric">${s.a}</div><div class="label">A등급 기업</div></div><div class="card"><div class="metric">${score}/5</div><div class="label">오늘 루틴</div></div></section><section class="card"><div class="sectionTitle">오늘 할 일</div><ol class="todo"><li>오늘전화 기업 TOP부터 연락</li><li>기업360에서 리스크 확인</li><li>담당자 찾기 → 짧은 메일/전화</li><li>거절 시 대안타깃 B등급 이상으로 이동</li></ol></section><section class="card"><div class="sectionTitle">오늘 영업 TOP5</div><div class="list">${dy.slice(0, 5).map(salesCard).join("")}</div></section></main>`;
}
function sourcing() { return `<main class="grid"><section class="card"><div class="sectionTitle">SJ 소싱 루트북</div><a class="link" href="/sourcing.html" target="_blank">새 창으로 크게 열기</a></section><div class="sourceFrameWrap"><iframe title="SJ 소싱 루트북" src="/sourcing.html" class="sourceFrame"></iframe></div></main>`; }
function candidate() {
  const rows = state.data.candidates || demo.candidates;
  return `<main class="grid"><section class="card"><div class="sectionTitle">Candidate AI</div><p>후보자는 적합도·리스크·추천 액션만 봅니다.</p></section><section class="list">${rows.map(r => `<div class="item"><div class="row"><div><div class="company">${esc(r.name)}</div><div class="muted">${esc(r.role)}</div></div>${badge("적합도 " + esc(r.fit) + "%", Number(r.fit) >= 85 ? "good" : "warn")}</div>${kv("리스크", r.risk)}${kv("추천액션", r.action)}</div>`).join("")}</section></main>`;
}
function settings() {
  return `<main class="grid"><section class="card"><div class="sectionTitle">Google Sheets / Apps Script 연결</div><p>Apps Script 웹앱 URL을 붙여넣고 저장하세요.</p><textarea id="apiUrl" placeholder="https://script.google.com/macros/s/....../exec">${esc(state.apiUrl)}</textarea><div style="height:10px"></div><button class="btn gold" id="saveApi">저장하고 연결</button></section><section class="card"><div class="sectionTitle">연결 후 작동</div><ol class="todo"><li>투자탭: KODEX / GME / 원달러 환율 현재가 반영</li><li>영업탭: 오늘_영업판단 시트 반영</li><li>기업360: 기업_원스탑 시트 반영</li></ol></section></main>`;
}

/* ---------- 데이터 연결 (v3.2와 동일) ---------- */
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = "__sjone_cb_" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
    const s = document.createElement("script");
    window[cb] = d => { delete window[cb]; s.remove(); resolve(d); };
    s.onerror = () => { delete window[cb]; s.remove(); reject(new Error("JSONP 연결 실패")); };
    s.src = url + (url.includes("?") ? "&" : "?") + "callback=" + cb + "&ts=" + Date.now();
    document.body.appendChild(s);
    setTimeout(() => { if (window[cb]) { delete window[cb]; s.remove(); reject(new Error("응답 시간초과")); } }, 15000);
  });
}
async function refreshData() {
  if (!state.apiUrl) { state.data = demo; render("Apps Script URL 없음: 데모 데이터 표시 중"); return; }
  render("데이터 갱신 중...");
  try {
    const data = await jsonp(state.apiUrl);
    state.data = { ...demo, ...data, live: true };
    render("갱신 완료: " + new Date().toLocaleString("ko-KR"));
  } catch (e) { state.data = demo; render("연결 실패: " + e.message); }
}

/* ---------- 렌더 & 바인딩 ---------- */
function render(note = "") {
  const map = { home, sales, company, sourcing, candidate, investment, assistant, settings };
  $("#app").innerHTML = layout((map[state.tab] || home)(), note);
  bind();
}
function bind() {
  document.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => {
    state.tab = b.dataset.tab;
    if (state.tab === "sourcing") { localStorage.setItem("sjone_tab", "home"); location.href = "/sourcing.html"; return; }
    localStorage.setItem("sjone_tab", state.tab); render();
  });
  const r = $("#refreshBtn"); if (r) r.onclick = refreshData;
  const sv = $("#saveApi"); if (sv) sv.onclick = () => { state.apiUrl = $("#apiUrl").value.trim(); localStorage.setItem("sjone_api_url", state.apiUrl); refreshData(); };

  /* 영업: 완료 체크 (카드 클릭 이동과 분리) */
  document.querySelectorAll("[data-done]").forEach(el => el.onclick = e => { e.stopPropagation(); toggleDone(el.dataset.done); render(); });
  document.querySelectorAll("[data-filter]").forEach(el => el.onclick = () => { state.salesFilter = el.dataset.filter; render(); });

  document.querySelectorAll(".companyItem").forEach(el => el.onclick = () => { state.selectedCompany = el.dataset.company; state.tab = "company"; localStorage.setItem("sjone_tab", "company"); render(); });
  document.querySelectorAll(".companyPick").forEach(el => el.onclick = () => { state.selectedCompany = el.dataset.company; render(); });

  /* 기업360: 메모 저장 */
  const sm = $("#saveMemo");
  if (sm) sm.onclick = () => {
    const name = sm.dataset.company, text = $("#memoBox").value;
    setLS(memoKey(name), { text, at: new Date().toLocaleString("ko-KR") });
    render("메모 저장됨: " + name);
  };

  /* 투자: 설정 저장 / 이벤트 추가·삭제 */
  const sic = $("#saveInvCfg");
  if (sic) sic.onclick = () => {
    const cfg = getInvCfg();
    cfg.kodexQty = num($("#cfgKQty").value) ?? cfg.kodexQty;
    cfg.gmeQty = num($("#cfgGQty").value) ?? cfg.gmeQty;
    cfg.entryFx = num($("#cfgFx").value) ?? cfg.entryFx;
    cfg.sup = { kodex: num($("#cfgKSup").value), gme: num($("#cfgGSup").value) };
    cfg.res = { kodex: num($("#cfgKRes").value), gme: num($("#cfgGRes").value) };
    setLS("sjone_inv_cfg", cfg); render("투자 설정 저장됨");
  };
  const ae = $("#addEvent");
  if (ae) ae.onclick = () => {
    const d = $("#evDate").value, l = $("#evLabel").value.trim();
    if (!d || !l) { render("이벤트 날짜와 이름을 모두 입력하세요"); return; }
    const ev = getEvents(); ev.push({ date: d, label: l });
    ev.sort((a, b) => a.date.localeCompare(b.date));
    setLS("sjone_events", ev); render("이벤트 추가됨");
  };
  document.querySelectorAll("[data-delevent]").forEach(el => el.onclick = () => {
    const ev = getEvents(); ev.splice(Number(el.dataset.delevent), 1);
    setLS("sjone_events", ev); render();
  });

  /* 비서: 루틴 토글 */
  document.querySelectorAll("[data-ri]").forEach(el => el.onclick = () => { toggleRoutine(Number(el.dataset.ri)); render(); });
}

if ("serviceWorker" in navigator) { window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {})); }
render();
if (state.apiUrl) refreshData();
