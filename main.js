// キャッチコピーの書き換えと、言語の切り替え。
// 書き換えのアニメーション自体は CSS（style.css）で行い、ここでは文字を部品に分けて
// 「何ミリ秒後に現れる / 打ち消される」を CSS 変数（--in / --strike）として割り当てるだけにしている。
// カーソルは --in に現れ、--out に消える。

// 書き換えの手順。caret: カーソルの位置（文字数。"end" は末尾）、
// strike: カーソルの後ろの文字に打ち消し線を引く文字数（カーソルは線の終わりに進む）、type: 打つ文字（"\n" は改行）。
// 文字は消さずに打ち消し線を引き、直した文字は赤にする（書き換え後も、どこを直したかがわかるように）。
// 直しではなく書き足す文は { plain: true } を付けて、元の文と同じ黒で打つ
const SCRIPTS = {
  en: {
    from: "Show your workings.",
    steps: [
      ["wait", 1700],
      ["caret", 0],          // 「Show」の前
      ["wait", 700],
      ["strike", 4],         // 「Show」
      ["wait", 300],
      ["type", " Don’t show"],
      ["wait", 600],
      ["caret", "end"],
      ["wait", 650],
      ["type", "\nWe’ve got them ; )", { plain: true }],
    ],
  },
  ja: {
    from: "解答の過程も明記しなさい。",
    steps: [
      ["wait", 1700],
      ["caret", 5],          // 「解答の過程」の後ろ
      ["wait", 700],
      ["strike", 7],         // 「も明記しなさい」
      ["wait", 300],
      ["type", "は必要ありません"],
      ["wait", 600],
      ["caret", "end"],
      ["wait", 650],
      ["type", "\nこちらで把握しておきます 😉", { plain: true }],
    ],
  },
};

// 周りの行がぼけ終わるまで（style.css の defocus: 0.7s 待ち + 1.1s）
const START_DELAY = 1800;
const TYPE_INTERVAL = 85;
const STRIKE_INTERVAL = 65;

/** 書き換えの手順から、文字とカーソルの部品を作り、表示・非表示の時刻を割り当てる。終了時刻（ms）を返す */
function buildEdit(container, script) {
  const nodes = [];   // 文書の並び順の部品（過去のカーソルも含む）
  const visible = []; // その時点で見えている文字（並び順）
  let time = START_DELAY;
  let caretIndex = script.from.length; // カーソルの前にある文字の数
  let caret = null;

  const insertAfter = (reference, node) => {
    const index = reference ? nodes.indexOf(reference) + 1 : 0;
    nodes.splice(index, 0, node);
  };
  // 打った文字は、その位置にあった（もう消えた）カーソルより後ろに置く。
  // 改行の直前で待っている間、カーソルが改行の手前（1 行目の末尾）に表示されるようにするため
  const insertTyped = (reference, node) => {
    let index = reference ? nodes.indexOf(reference) + 1 : 0;
    while (nodes[index]?.kind === "caret") index += 1;
    nodes.splice(index, 0, node);
  };
  const openCaret = () => {
    caret = { kind: "caret", in: time, out: null };
    insertAfter(visible[caretIndex - 1] ?? null, caret);
  };
  const closeCaret = () => { caret.out = time; };
  // 打鍵の間隔に少し揺らぎを付ける（毎回同じ動きになるよう、乱数ではなく文字位置から決める）
  const jitter = (i) => [0, 30, -15, 45, 10, -20, 25][i % 7];

  for (const ch of script.from) {
    const node = { kind: "ch", ch, in: 0 };
    nodes.push(node);
    visible.push(node);
  }
  openCaret();

  let keystroke = 0;
  for (const [action, value, options] of script.steps) {
    switch (action) {
      case "wait":
        time += value;
        break;
      case "caret":
        closeCaret();
        caretIndex = value === "end" ? visible.length : value < 0 ? visible.length + value : value;
        openCaret();
        break;
      case "strike":
        for (let i = 0; i < value; i++) {
          time += STRIKE_INTERVAL;
          closeCaret();
          visible[caretIndex].strike = time;
          caretIndex += 1;
          openCaret();
        }
        break;
      case "type":
        for (const ch of value) {
          time += TYPE_INTERVAL + jitter(keystroke++);
          closeCaret();
          const node = { kind: "ch", ch, in: time, typed: !options?.plain };
          insertTyped(visible[caretIndex - 1] ?? null, node);
          visible.splice(caretIndex, 0, node);
          caretIndex += 1;
          openCaret();
        }
        break;
    }
  }

  const fragment = document.createDocumentFragment();
  for (const node of nodes) {
    // 改行は最初から入れておき、その後ろの行の高さを確保しておく（打ち始めても紙の高さが変わらない）
    if (node.ch === "\n") {
      fragment.append(document.createElement("br"));
      continue;
    }
    const span = document.createElement("span");
    span.className = node.kind;
    if (node.kind === "ch") span.textContent = node.ch;
    span.style.setProperty("--in", `${node.in}ms`);
    if (node.typed) span.classList.add("typed");
    if (node.strike !== undefined) {
      span.classList.add("struck");
      span.style.setProperty("--strike", `${node.strike}ms`);
    }
    if (node.kind === "caret" && node.out !== null) {
      span.classList.add("out");
      span.style.setProperty("--out", `${node.out}ms`);
    }
    fragment.append(span);
  }
  container.replaceChildren(fragment);
  return time;
}

function startHeadline(lang) {
  const container = document.querySelector(`[data-edit="${lang}"]`);
  if (!container) return;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) return; // HTML に書いてある書き換え後の文をそのまま表示する
  const end = buildEdit(container, SCRIPTS[lang]);
  // 説明文とボタンは、書き換えが終わってから表示する
  document.documentElement.style.setProperty("--reveal", `${end + 600}ms`);
}

function detectLanguage() {
  const query = new URLSearchParams(location.search).get("lang");
  if (query === "ja" || query === "en") return query;
  try {
    const saved = localStorage.getItem("lang");
    if (saved === "ja" || saved === "en") return saved;
  } catch {}
  return (navigator.languages || [navigator.language]).some((l) => l && l.startsWith("ja")) ? "ja" : "en";
}

function applyLanguage(lang, { restart }) {
  document.documentElement.lang = lang;
  for (const button of document.querySelectorAll("[data-set-lang]")) {
    button.setAttribute("aria-pressed", String(button.dataset.setLang === lang));
  }
  const hero = document.getElementById("hero");
  if (restart && hero) {
    // ヒーローを作り直して CSS アニメーションを最初から再生する
    hero.replaceWith(hero.cloneNode(true));
  }
  startHeadline(lang);
}

document.addEventListener("DOMContentLoaded", () => {
  applyLanguage(detectLanguage(), { restart: false });
  for (const button of document.querySelectorAll("[data-set-lang]")) {
    button.addEventListener("click", () => {
      const lang = button.dataset.setLang;
      if (lang === document.documentElement.lang) return;
      try { localStorage.setItem("lang", lang); } catch {}
      applyLanguage(lang, { restart: true });
    });
  }
});
