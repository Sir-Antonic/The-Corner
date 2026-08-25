// ---- CONFIG -----------------------------------------------------------
const COUNTER_NAMESPACE = "your-workspace-slug"; // <-- replace me, see README
const COUNTER_API_BASE = "https://api.counterapi.dev/v1";
const LOCAL_FALLBACK_KEY = "move-hub-download-counts";
const FAVORITES_KEY = "move-hub-favorites";

// Download thresholds that decide a tile's rank. Tune to your own numbers.
const RANK_THRESHOLDS = { legend: 150, champion: 50, pro: 15 };
const PAGE_SIZE = 12;
// Only the single newest move (last entry in moves.json) shows the REC
// indicator — every other post has none at all, not even on hover.
const RECENT_REC_COUNT = 5;

// Every category now shares one neutral accent color instead of a
// different hue per category — kept as a function so the rest of the
// code (which reads --accent everywhere) didn't need to change.
const NEUTRAL_ACCENT = "#f2f2ef";

// ---- STATE --------------------------------------------------------------
let allMoves = [];
let categories = [];
let activeCategory = "all";
let activeWrestler = "all";
let searchQuery = "";
let sortBy = "featured";
let showFavoritesOnly = false;
let currentPage = 1;
let favorites = new Set();
try {
  favorites = new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]"));
} catch {
  favorites = new Set();
}

// ---- COUNTER HELPERS ------------------------------------------------------
function readLocalCounts() {
  try { return JSON.parse(localStorage.getItem(LOCAL_FALLBACK_KEY) || "{}"); }
  catch { return {}; }
}
function writeLocalCounts(counts) {
  localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(counts));
}
async function fetchCount(counterId) {
  if (COUNTER_NAMESPACE === "your-workspace-slug") return readLocalCounts()[counterId] || 0;
  try {
    const res = await fetch(`${COUNTER_API_BASE}/${COUNTER_NAMESPACE}/${counterId}`);
    const data = await res.json();
    return data.count ?? 0;
  } catch { return readLocalCounts()[counterId] || 0; }
}
async function incrementCount(counterId) {
  if (COUNTER_NAMESPACE === "your-workspace-slug") {
    const counts = readLocalCounts();
    counts[counterId] = (counts[counterId] || 0) + 1;
    writeLocalCounts(counts);
    return counts[counterId];
  }
  try {
    const res = await fetch(`${COUNTER_API_BASE}/${COUNTER_NAMESPACE}/${counterId}/up`);
    const data = await res.json();
    return data.count ?? 0;
  } catch {
    const counts = readLocalCounts();
    counts[counterId] = (counts[counterId] || 0) + 1;
    writeLocalCounts(counts);
    return counts[counterId];
  }
}

// ---- FAVORITES ------------------------------------------------------
function saveFavorites() { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites])); }
function toggleFavorite(moveId) {
  if (favorites.has(moveId)) favorites.delete(moveId);
  else favorites.add(moveId);
  saveFavorites();
  updateFavToggleLabel();
  return favorites.has(moveId);
}
function updateFavToggleLabel() {
  document.getElementById("fav-toggle-count").textContent = `(${favorites.size})`;
}

// ---- RANK / STYLE HELPERS -----------------------------------------------
function getCategoryAccent() {
  return NEUTRAL_ACCENT;
}
function getRankTier(count) {
  if (count >= RANK_THRESHOLDS.legend) return "legend";
  if (count >= RANK_THRESHOLDS.champion) return "champion";
  if (count >= RANK_THRESHOLDS.pro) return "pro";
  return "rookie";
}
function rankLabel(tier) {
  if (tier === "legend") return "✦ LEGEND";
  if (tier === "champion") return "★ CHAMPION";
  if (tier === "pro") return "▲ PRO";
  return "ROOKIE";
}
function applyRank(tileEl, tier) {
  tileEl.dataset.rank = tier;
  const badge = tileEl.querySelector(".tile__rank");
  if (badge) badge.textContent = rankLabel(tier);
}

// ---- RANK GUIDE MODAL ------------------------------------------------
function renderRankLegend() {
  const list = document.getElementById("rarity-legend-list");
  const tiers = [
    { key: "rookie", name: "ROOKIE", desc: "Every move starts here." },
    { key: "pro", name: "PRO", desc: `${RANK_THRESHOLDS.pro}+ downloads.` },
    { key: "champion", name: "CHAMPION", desc: `${RANK_THRESHOLDS.champion}+ downloads — red frame, glow on select.` },
    { key: "legend", name: "LEGEND", desc: `${RANK_THRESHOLDS.legend}+ downloads — gold frame, constant shimmer.` }
  ];
  list.innerHTML = tiers.map((t) => `
    <li class="rarity-legend__row">
      <span class="rarity-legend__swatch rarity-legend__swatch--${t.key}"></span>
      <span class="rarity-legend__text"><strong>${t.name}</strong><br>${t.desc}</span>
    </li>`).join("");
}
const rarityModal = document.getElementById("rarity-modal");
function openRarityModal() {
  rarityModal.classList.add("is-open");
  rarityModal.setAttribute("aria-hidden", "false");
  document.getElementById("rarity-modal-close").focus();
}
function closeRarityModal() {
  rarityModal.classList.remove("is-open");
  rarityModal.setAttribute("aria-hidden", "true");
}
document.getElementById("rarity-info-btn").addEventListener("click", openRarityModal);
document.getElementById("rarity-modal-close").addEventListener("click", closeRarityModal);
document.getElementById("rarity-modal-backdrop").addEventListener("click", closeRarityModal);

// ---- RENDERING ------------------------------------------------------------
function renderFilterDropdowns() {
  const catCountFor = (cat) => cat === "all" ? allMoves.length : allMoves.filter((m) => m.category === cat).length;
  const catSelect = document.getElementById("category-select");
  catSelect.innerHTML = `<option value="all">ALL CATEGORIES (${catCountFor("all")})</option>`;
  categories.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = `${cat.toUpperCase()} (${catCountFor(cat)})`;
    catSelect.appendChild(opt);
  });
  catSelect.addEventListener("change", (e) => {
    activeCategory = e.target.value;
    currentPage = 1;
    renderGrid();
  });

  const wrestlers = [...new Set(allMoves.map((m) => m.wrestler).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
  const wrestlerCountFor = (w) => allMoves.filter((m) => m.wrestler === w).length;
  const wrestlerSelect = document.getElementById("wrestler-select");
  wrestlerSelect.innerHTML = `<option value="all">ALL WRESTLERS (${allMoves.length})</option>`;
  wrestlers.forEach((w) => {
    const opt = document.createElement("option");
    opt.value = w;
    opt.textContent = `${w.toUpperCase()} (${wrestlerCountFor(w)})`;
    wrestlerSelect.appendChild(opt);
  });
  wrestlerSelect.addEventListener("change", (e) => {
    activeWrestler = e.target.value;
    currentPage = 1;
    renderGrid();
  });
}

function renderLoadMore(totalVisible, shownCount) {
  const wrap = document.getElementById("load-more-wrap");
  const btn = document.getElementById("load-more-btn");
  const remaining = totalVisible - shownCount;
  if (remaining <= 0) { wrap.style.display = "none"; return; }
  wrap.style.display = "flex";
  btn.textContent = `LOAD MORE (${remaining})`;
  btn.onclick = () => { currentPage += 1; renderGrid(); };
}

function isRecentMove(moveId) {
  const recentIds = allMoves.slice(-RECENT_REC_COUNT).map((m) => m.id);
  return recentIds.includes(moveId);
}

async function renderGrid() {
  const grid = document.getElementById("move-grid");
  const query = searchQuery.trim().toLowerCase();

  let visible = allMoves.filter((m) =>
    (activeCategory === "all" || m.category === activeCategory) &&
    (activeWrestler === "all" || m.wrestler === activeWrestler) &&
    (!showFavoritesOnly || favorites.has(m.id)) &&
    (query === "" || m.name.toLowerCase().includes(query))
  );

  if (sortBy === "az") {
    visible = [...visible].sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortBy === "wrestler") {
    visible = [...visible].sort((a, b) => (a.wrestler || "").localeCompare(b.wrestler || ""));
  } else if (sortBy === "downloads") {
    const counts = await Promise.all(visible.map((m) => fetchCount(m.counterId)));
    visible = visible.map((m, i) => ({ m, c: counts[i] })).sort((a, b) => b.c - a.c).map((x) => x.m);
  }

  const resultsCount = document.getElementById("results-count");
  const moveWord = (n) => (n === 1 ? "MOVE" : "MOVES");
  resultsCount.textContent =
    visible.length === allMoves.length
      ? `${allMoves.length} ${moveWord(allMoves.length)}`
      : `SHOWING ${visible.length} OF ${allMoves.length} ${moveWord(allMoves.length)}`;

  if (!visible.length) {
    document.getElementById("load-more-wrap").style.display = "none";
    grid.innerHTML = `<p class="empty-state">${
      showFavoritesOnly ? "NO FAVORITES YET." : `NO MOVES MATCH “${searchQuery}”.${query ? ' <button class="empty-state__clear" id="clear-search-btn">CLEAR SEARCH</button>' : ""}`
    }</p>`;
    const clearBtn = document.getElementById("clear-search-btn");
    if (clearBtn) clearBtn.addEventListener("click", () => {
      searchQuery = "";
      document.getElementById("move-search").value = "";
      renderGrid();
    });
    return;
  }

  const pageItems = visible.slice(0, currentPage * PAGE_SIZE);
  renderLoadMore(visible.length, pageItems.length);

  grid.innerHTML = "";

  pageItems.forEach((move, i) => {
    const accent = getCategoryAccent(move.category);
    const isFav = favorites.has(move.id);
    const isRecent = isRecentMove(move.id);
    const tile = document.createElement("div");
    tile.setAttribute("role", "button");
    tile.tabIndex = 0;
    tile.className = "tile";
    tile.dataset.rank = "rookie";
    tile.dataset.moveId = move.id;
    tile.style.setProperty("--accent", accent);
    tile.style.setProperty("--i", i % PAGE_SIZE);
    tile.setAttribute("aria-label", `${move.name} — ${move.category}`);
    tile.innerHTML = `
      <div class="tile__frame">
        <div class="tile__screen">
          <video muted loop playsinline preload="metadata">${move.previewWebm ? `<source src="${move.previewWebm}" type="video/webm">` : ""}<source src="${move.preview}" type="video/mp4"></video>
          ${isRecent ? `<span class="tile__rec tile__rec--live">● NEW</span>` : ""}
          <img class="tile__portrait" src="${move.wrestlerImage}" alt="" />
          <button class="tile__fav ${isFav ? "is-active" : ""}" aria-pressed="${isFav}" aria-label="Toggle favorite">${isFav ? "★" : "☆"}</button>
        </div>
        <div class="tile__bar">
          <div class="tile__toprow">
            <span class="tile__name">${move.name}</span>
            <span class="tile__rank"></span>
          </div>
          ${move.wrestler ? `<p class="tile__wrestler">${move.wrestler}</p>` : ""}
          <div class="tile__metarow">
            <span class="tile__type">${move.category}</span>
            <span class="tile__stat">↓ <strong class="is-loading" data-count-for="${move.counterId}"></strong></span>
          </div>
        </div>
      </div>
    `;

    const video = tile.querySelector("video");
    const favBtn = tile.querySelector(".tile__fav");

    favBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const nowFav = toggleFavorite(move.id);
      favBtn.classList.toggle("is-active", nowFav);
      favBtn.setAttribute("aria-pressed", nowFav);
      favBtn.textContent = nowFav ? "★" : "☆";
      const modalFav = document.getElementById("modal-fav");
      if (modalFav && modal.dataset.moveId === move.id) {
        modalFav.classList.toggle("is-active", nowFav);
        modalFav.setAttribute("aria-pressed", nowFav);
        modalFav.textContent = nowFav ? "★" : "☆";
      }
      if (showFavoritesOnly && !nowFav) renderGrid();
    });

    tile.addEventListener("mouseenter", () => video.play().catch(() => {}));
    tile.addEventListener("mouseleave", () => { video.pause(); video.currentTime = 0; });
    tile.addEventListener("focus", () => video.play().catch(() => {}));
    tile.addEventListener("blur", () => { video.pause(); video.currentTime = 0; });
    tile.addEventListener("click", () => openModal(move));
    tile.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openModal(move); }
    });

    grid.appendChild(tile);

    fetchCount(move.counterId).then((count) => {
      const el = tile.querySelector(`[data-count-for="${move.counterId}"]`);
      if (el) { el.textContent = count; el.classList.remove("is-loading"); }
      applyRank(tile, getRankTier(count));
    });
  });
}

async function renderHeroStats() {
  document.getElementById("stat-total").textContent = String(allMoves.length).padStart(2, "0");
  const counts = await Promise.all(allMoves.map((m) => fetchCount(m.counterId)));
  const total = counts.reduce((sum, c) => sum + c, 0);
  document.getElementById("stat-downloads").textContent = String(total).padStart(2, "0");
}

// ---- MODAL ------------------------------------------------------------
const modal = document.getElementById("move-modal");
const modalVideo = document.getElementById("modal-video");

async function openModal(move, { updateUrl = true } = {}) {
  const accent = getCategoryAccent(move.category);
  modal.style.setProperty("--accent", accent);
  modal.dataset.moveId = move.id;

  document.getElementById("modal-category").textContent = move.category;
  document.getElementById("modal-title").textContent = move.name;
  document.getElementById("modal-wrestler").textContent = move.wrestler || "";
  document.getElementById("modal-notes").textContent = move.notes || "";
  const modalRec = document.getElementById("modal-rec");
  const moveIsRecent = isRecentMove(move.id);
  modalRec.style.display = moveIsRecent ? "" : "none";
  modalRec.classList.toggle("tile__rec--live", moveIsRecent);
  document.getElementById("modal-author").textContent = `BUILT BY ${move.author}`;

  const isFav = favorites.has(move.id);
  const modalFav = document.getElementById("modal-fav");
  modalFav.classList.toggle("is-active", isFav);
  modalFav.setAttribute("aria-pressed", isFav);
  modalFav.textContent = isFav ? "★" : "☆";
  modalFav.onclick = () => {
    const nowFav = toggleFavorite(move.id);
    modalFav.classList.toggle("is-active", nowFav);
    modalFav.setAttribute("aria-pressed", nowFav);
    modalFav.textContent = nowFav ? "★" : "☆";
    const gridTile = document.querySelector(`.tile[data-move-id="${move.id}"]`);
    const gridFav = gridTile && gridTile.querySelector(".tile__fav");
    if (gridFav) {
      gridFav.classList.toggle("is-active", nowFav);
      gridFav.setAttribute("aria-pressed", nowFav);
      gridFav.textContent = nowFav ? "★" : "☆";
    }
  };

  const copyBtn = document.getElementById("modal-copy");
  copyBtn.onclick = async () => {
    const url = `${location.origin}${location.pathname}?move=${move.id}`;
    try {
      await navigator.clipboard.writeText(url);
      const original = copyBtn.textContent;
      copyBtn.textContent = "✓";
      setTimeout(() => (copyBtn.textContent = original), 1400);
    } catch { window.prompt("Copy this link:", url); }
  };

  const idx = allMoves.findIndex((m) => m.id === move.id);
  document.getElementById("modal-number").textContent =
    `#${String(idx + 1).padStart(2, "0")} / ${String(allMoves.length).padStart(2, "0")}`;

  modalVideo.innerHTML =
    (move.previewWebm ? `<source src="${move.previewWebm}" type="video/webm">` : "") +
    `<source src="${move.preview}" type="video/mp4">`;
  modalVideo.load();
  modalVideo.currentTime = 0;
  modalVideo.play().catch(() => {});

  const downloadBtn = document.getElementById("modal-download");
  downloadBtn.href = move.download;

  const countEl = document.getElementById("modal-count");
  const rankEl = document.getElementById("modal-rarity");
  countEl.textContent = "…";
  fetchCount(move.counterId).then((c) => {
    countEl.textContent = c;
    const tier = getRankTier(c);
    modal.dataset.rank = tier;
    rankEl.textContent = rankLabel(tier);
  });

  downloadBtn.onclick = async () => {
    const screenEl = document.querySelector(".modal__screen");
    if (screenEl) {
      screenEl.classList.remove("is-glitching");
      // force reflow so the animation restarts even if clicked again quickly
      void screenEl.offsetWidth;
      screenEl.classList.add("is-glitching");
      setTimeout(() => screenEl.classList.remove("is-glitching"), 650);
    }

    const newCount = await incrementCount(move.counterId);
    const tier = getRankTier(newCount);
    countEl.textContent = newCount;
    modal.dataset.rank = tier;
    rankEl.textContent = rankLabel(tier);
    const gridTile = document.querySelector(`.tile[data-move-id="${move.id}"]`);
    if (gridTile) {
      const gridCountEl = gridTile.querySelector(`[data-count-for="${move.counterId}"]`);
      if (gridCountEl) gridCountEl.textContent = newCount;
      applyRank(gridTile, tier);
    }
  };

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.getElementById("modal-close").focus();

  if (updateUrl) {
    const url = new URL(location.href);
    url.searchParams.set("move", move.id);
    history.pushState({ moveId: move.id }, "", url);
  }
}

function closeModal({ updateUrl = true } = {}) {
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  delete modal.dataset.moveId;
  modalVideo.pause();
  modalVideo.innerHTML = "";
  modalVideo.load();
  if (updateUrl) {
    const url = new URL(location.href);
    url.searchParams.delete("move");
    history.pushState({}, "", url);
  }
}

document.getElementById("modal-close").addEventListener("click", () => closeModal());
document.getElementById("modal-backdrop").addEventListener("click", () => closeModal());
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (rarityModal.classList.contains("is-open")) closeRarityModal();
  else if (modal.classList.contains("is-open")) closeModal();
});
window.addEventListener("popstate", () => {
  const moveId = new URL(location.href).searchParams.get("move");
  if (moveId) {
    const move = allMoves.find((m) => m.id === moveId);
    if (move) { openModal(move, { updateUrl: false }); return; }
  }
  closeModal({ updateUrl: false });
});

// ---- CONTROLS ------------------------------------------------------------
document.getElementById("move-search").addEventListener("input", (e) => {
  searchQuery = e.target.value; currentPage = 1; renderGrid();
});
document.getElementById("move-sort").addEventListener("change", (e) => {
  sortBy = e.target.value; currentPage = 1; renderGrid();
});
document.getElementById("fav-toggle").addEventListener("click", (e) => {
  showFavoritesOnly = !showFavoritesOnly;
  currentPage = 1;
  e.currentTarget.classList.toggle("is-active", showFavoritesOnly);
  e.currentTarget.setAttribute("aria-pressed", showFavoritesOnly);
  renderGrid();
});

// ---- INIT ------------------------------------------------------------
async function init() {
  const res = await fetch("moves.json");
  const data = await res.json();
  allMoves = data.moves;
  categories = data.categories;
  renderFilterDropdowns();
  updateFavToggleLabel();
  renderRankLegend();
  await renderGrid();
  await renderHeroStats();

  const moveId = new URL(location.href).searchParams.get("move");
  if (moveId) {
    const move = allMoves.find((m) => m.id === moveId);
    if (move) openModal(move, { updateUrl: false });
  }
}

init();
