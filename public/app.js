(() => {
  const PAGE_SIZE = 40;

  const state = {
    papers: [],
    reviewsByPaper: new Map(), // paper_id -> { reviewerName: {decision, category, comment, updated_at} }
    reviewer: localStorage.getItem("yanagawa_reviewer") || "",
    filter: "all",
    query: "",
    page: 1,
    filtered: [],
    view: "list", // "list" | "swipe"
    swipeIndex: 0,
    swipeHistory: [], // {paperId, previousReview: {...} | null}
    swipeBusy: false,
  };

  const el = {
    reviewerInput: document.getElementById("reviewerInput"),
    searchInput: document.getElementById("searchInput"),
    chips: document.getElementById("filterChips"),
    list: document.getElementById("paperList"),
    pagination: document.getElementById("pagination"),
    totalInfo: document.getElementById("totalInfo"),
    exportBtn: document.getElementById("exportBtn"),
    gaugeWater: document.getElementById("gaugeWater"),
    gaugePercent: document.getElementById("gaugePercent"),
    gaugeCount: document.getElementById("gaugeCount"),
    template: document.getElementById("paperCardTemplate"),
    viewToggle: document.getElementById("viewToggle"),
    swipeView: document.getElementById("swipeView"),
    swipeStage: document.getElementById("swipeStage"),
    swipeEmpty: document.getElementById("swipeEmpty"),
    swipeProgressText: document.getElementById("swipeProgressText"),
    swipeUndoBtn: document.getElementById("swipeUndoBtn"),
    swipeExcludeBtn: document.getElementById("swipeExcludeBtn"),
    swipeMaybeBtn: document.getElementById("swipeMaybeBtn"),
    swipeIncludeBtn: document.getElementById("swipeIncludeBtn"),
    swipeBackToListBtn: document.getElementById("swipeBackToListBtn"),
    swipeTemplate: document.getElementById("swipeCardTemplate"),
  };

  const CATEGORY_LABEL = {
    not_academic: "①学術研究でない",
    medical_unrelated: "②医学症例(非関連)",
    affiliation_only: "③所属欄のみ柳川",
    municipality_list: "④自治体列挙のみ",
    other: "その他",
  };

  el.reviewerInput.value = state.reviewer;

  async function init() {
    const [papersRes, reviewsRes] = await Promise.all([
      fetch("/data/papers.json"),
      fetch("/api/reviews"),
    ]);
    state.papers = await papersRes.json();
    const reviews = await reviewsRes.json();
    reviews.forEach((r) => {
      if (!state.reviewsByPaper.has(r.paper_id)) {
        state.reviewsByPaper.set(r.paper_id, {});
      }
      state.reviewsByPaper.get(r.paper_id)[r.reviewer] = r;
    });
    applyFilters();
    render();
    updateGauge();
  }

  async function postReview(payload) {
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.json();
  }

  async function deleteReview(paperId, reviewer) {
    await fetch(`/api/reviews?paper_id=${encodeURIComponent(paperId)}&reviewer=${encodeURIComponent(reviewer)}`, {
      method: "DELETE",
    });
  }

  function applyReviewResult(paperId, reviewer, saved) {
    if (!state.reviewsByPaper.has(paperId)) state.reviewsByPaper.set(paperId, {});
    state.reviewsByPaper.get(paperId)[reviewer] = saved;
    updateGauge();
  }

  function removeReviewResult(paperId, reviewer) {
    const revs = state.reviewsByPaper.get(paperId);
    if (!revs) return;
    delete revs[reviewer];
    updateGauge();
  }

  function paperHasConflict(paperId) {
    const revs = state.reviewsByPaper.get(paperId);
    if (!revs) return false;
    const decisions = new Set(Object.values(revs).map((r) => r.decision));
    return decisions.size > 1 && Object.keys(revs).length > 1;
  }

  function applyFilters() {
    const q = state.query.trim().toLowerCase();
    state.filtered = state.papers.filter((p) => {
      if (q) {
        const hay = `${p.title || ""} ${p.snippet || ""} ${p.authors_venue || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const revs = state.reviewsByPaper.get(p.id) || {};
      const myReview = state.reviewer ? revs[state.reviewer] : null;

      switch (state.filter) {
        case "pending-mine":
          return !myReview;
        case "conflict":
          return paperHasConflict(p.id);
        case "exclude":
          return Object.values(revs).some((r) => r.decision === "exclude");
        case "maybe":
          return Object.values(revs).some((r) => r.decision === "maybe");
        case "include":
          return Object.values(revs).some((r) => r.decision === "include");
        default:
          return true;
      }
    });
    state.page = 1;
  }

  function render() {
    const start = (state.page - 1) * PAGE_SIZE;
    const pageItems = state.filtered.slice(start, start + PAGE_SIZE);

    el.list.innerHTML = "";
    pageItems.forEach((p) => el.list.appendChild(renderCard(p)));

    el.totalInfo.textContent = `${state.filtered.length} 件表示中（全 ${state.papers.length} 件）`;
    renderPagination();
  }

  function renderCard(p) {
    const node = el.template.content.cloneNode(true);
    const card = node.querySelector(".card");
    card.dataset.id = p.id;

    node.querySelector(".card-id").textContent = p.id.replace("p", "#");

    const titleLink = node.querySelector(".card-title a");
    titleLink.textContent = p.title || "(タイトル不明)";
    titleLink.href = p.title_url || p.cluster_url || "#";

    node.querySelector(".meta-venue").textContent = p.authors_venue || "";
    const yearEl = node.querySelector(".meta-year");
    if (p.year) {
      yearEl.textContent = p.year;
    } else {
      yearEl.remove();
    }

    node.querySelector(".card-snippet").textContent = (p.snippet || "").replace(/\s+/g, " ");

    const linksWrap = node.querySelector(".card-links");
    if (p.pdf_url) {
      const a = document.createElement("a");
      a.href = p.pdf_url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "PDF";
      linksWrap.appendChild(a);
    }
    if (p.cluster_url) {
      const a = document.createElement("a");
      a.href = p.cluster_url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "Google Scholar";
      linksWrap.appendChild(a);
    }

    const revs = state.reviewsByPaper.get(p.id) || {};
    const myReview = state.reviewer ? revs[state.reviewer] : null;

    const decisionBtns = node.querySelectorAll(".decision-btn");
    const categorySelect = node.querySelector(".category-select");
    const commentInput = node.querySelector(".comment-input");
    const saveBtn = node.querySelector(".save-btn");

    let currentDecision = myReview ? myReview.decision : null;

    function syncPanel() {
      decisionBtns.forEach((b) => {
        b.classList.toggle("selected", b.dataset.decision === currentDecision);
      });
      categorySelect.hidden = currentDecision === "include" || !currentDecision;
    }

    if (myReview) {
      categorySelect.value = myReview.category || "";
      commentInput.value = myReview.comment || "";
    }
    syncPanel();

    decisionBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        currentDecision = btn.dataset.decision;
        syncPanel();
      });
    });

    saveBtn.addEventListener("click", async () => {
      if (!state.reviewer) {
        alert("先に右上で評価者名を入力してください。");
        el.reviewerInput.focus();
        return;
      }
      if (!currentDecision) {
        alert("含める／要確認／除外 のいずれかを選んでください。");
        return;
      }
      saveBtn.textContent = "保存中…";
      const saved = await postReview({
        paper_id: p.id,
        reviewer: state.reviewer,
        decision: currentDecision,
        category: categorySelect.value || null,
        comment: commentInput.value || null,
      });
      applyReviewResult(p.id, state.reviewer, saved);

      saveBtn.textContent = "保存済み";
      saveBtn.classList.add("saved");
      setTimeout(() => {
        saveBtn.textContent = "保存";
        saveBtn.classList.remove("saved");
      }, 1200);

      renderSummary(node.querySelector(".reviews-summary"), p.id);
      card.classList.toggle("has-conflict", paperHasConflict(p.id));
    });

    renderSummary(node.querySelector(".reviews-summary"), p.id);
    if (paperHasConflict(p.id)) card.classList.add("has-conflict");

    return node;
  }

  function renderSummary(container, paperId) {
    container.innerHTML = "";
    const revs = state.reviewsByPaper.get(paperId) || {};
    Object.entries(revs).forEach(([reviewer, r]) => {
      const chip = document.createElement("span");
      chip.className = `review-chip ${r.decision}`;
      const label = { include: "含める", maybe: "要確認", exclude: "除外" }[r.decision] || r.decision;
      const cat = r.category ? `｜${CATEGORY_LABEL[r.category] || r.category}` : "";
      const cmt = r.comment ? ` 💬` : "";
      chip.textContent = `${reviewer}: ${label}${cat}${cmt}`;
      if (r.comment) chip.title = r.comment;
      container.appendChild(chip);
    });
  }

  function renderPagination() {
    const totalPages = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
    el.pagination.innerHTML = "";

    const mkBtn = (label, page, opts = {}) => {
      const b = document.createElement("button");
      b.textContent = label;
      if (opts.active) b.classList.add("active");
      if (opts.disabled) b.disabled = true;
      b.addEventListener("click", () => {
        state.page = page;
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      return b;
    };

    el.pagination.appendChild(mkBtn("← 前へ", Math.max(1, state.page - 1), { disabled: state.page === 1 }));

    const windowSize = 5;
    let startPage = Math.max(1, state.page - Math.floor(windowSize / 2));
    let endPage = Math.min(totalPages, startPage + windowSize - 1);
    startPage = Math.max(1, endPage - windowSize + 1);

    for (let pnum = startPage; pnum <= endPage; pnum++) {
      el.pagination.appendChild(mkBtn(String(pnum), pnum, { active: pnum === state.page }));
    }

    el.pagination.appendChild(
      mkBtn("次へ →", Math.min(totalPages, state.page + 1), { disabled: state.page === totalPages })
    );
  }

  function updateGauge() {
    const total = state.papers.length;
    const evaluated = state.papers.filter((p) => state.reviewsByPaper.has(p.id)).length;
    const pct = total ? Math.round((evaluated / total) * 100) : 0;
    el.gaugeWater.style.height = `${pct}%`;
    el.gaugePercent.textContent = `${pct}%`;
    el.gaugeCount.textContent = `${evaluated} / ${total} 件評価済み`;
  }

  function toCSVValue(v) {
    if (v === null || v === undefined) return "";
    const s = String(v).replace(/"/g, '""');
    return `"${s}"`;
  }

  function exportCSV() {
    const rows = [
      ["paper_id", "title", "year", "authors_venue", "title_url", "reviewer", "decision", "category", "comment", "updated_at"],
    ];
    state.papers.forEach((p) => {
      const revs = state.reviewsByPaper.get(p.id);
      if (!revs || Object.keys(revs).length === 0) {
        rows.push([p.id, p.title, p.year, p.authors_venue, p.title_url, "", "", "", "", ""]);
      } else {
        Object.entries(revs).forEach(([reviewer, r]) => {
          rows.push([
            p.id, p.title, p.year, p.authors_venue, p.title_url,
            reviewer, r.decision, r.category || "", r.comment || "", r.updated_at,
          ]);
        });
      }
    });
    const csv = rows.map((row) => row.map(toCSVValue).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `yanagawa-screening-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---- swipe view ----

  function enterSwipeView() {
    state.view = "swipe";
    el.viewToggle.querySelectorAll(".view-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === "swipe"));
    el.list.hidden = true;
    el.pagination.hidden = true;
    el.swipeView.hidden = false;
    state.swipeIndex = 0;
    state.swipeHistory = [];
    renderSwipeDeck();
  }

  function enterListView() {
    state.view = "list";
    el.viewToggle.querySelectorAll(".view-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === "list"));
    el.list.hidden = false;
    el.pagination.hidden = false;
    el.swipeView.hidden = true;
  }

  function buildSwipeCard(p) {
    const node = el.swipeTemplate.content.cloneNode(true);
    const card = node.querySelector(".swipe-card");
    card.dataset.id = p.id;

    node.querySelector(".swipe-card-id").textContent = p.id.replace("p", "#");

    const titleLink = node.querySelector(".swipe-card-title a");
    titleLink.textContent = p.title || "(タイトル不明)";
    titleLink.href = p.title_url || p.cluster_url || "#";

    node.querySelector(".meta-venue").textContent = p.authors_venue || "";
    const yearEl = node.querySelector(".meta-year");
    if (p.year) {
      yearEl.textContent = p.year;
    } else {
      yearEl.remove();
    }

    node.querySelector(".swipe-card-snippet").textContent = (p.snippet || "").replace(/\s+/g, " ");

    const linksWrap = node.querySelector(".swipe-card-links");
    if (p.pdf_url) {
      const a = document.createElement("a");
      a.href = p.pdf_url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "PDF";
      linksWrap.appendChild(a);
    }
    if (p.cluster_url) {
      const a = document.createElement("a");
      a.href = p.cluster_url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "Google Scholar";
      linksWrap.appendChild(a);
    }

    const detailToggle = node.querySelector(".swipe-detail-toggle");
    const detailPanel = node.querySelector(".swipe-detail-panel");
    detailToggle.addEventListener("click", () => {
      detailPanel.hidden = !detailPanel.hidden;
      detailToggle.textContent = detailPanel.hidden ? "＋ 理由・コメントを追加" : "－ 閉じる";
    });

    const revs = state.reviewsByPaper.get(p.id) || {};
    const myReview = state.reviewer ? revs[state.reviewer] : null;
    const note = card.querySelector(".swipe-reviewed-note");
    if (myReview) {
      const label = { include: "含める", maybe: "要確認", exclude: "除外" }[myReview.decision] || myReview.decision;
      note.textContent = `あなたの評価: ${label}（スワイプすると上書きされます）`;
      card.querySelector(".category-select").value = myReview.category || "";
      card.querySelector(".comment-input").value = myReview.comment || "";
    } else {
      note.remove();
    }

    return card;
  }

  function swipeTopCard() {
    return el.swipeStage.querySelector(".swipe-card:not(.swipe-stack-1):not(.swipe-stack-2)");
  }

  function renderSwipeDeck() {
    el.swipeStage.querySelectorAll(".swipe-card").forEach((c) => c.remove());

    const total = state.filtered.length;
    el.swipeProgressText.textContent = `${Math.min(state.swipeIndex, total)} / ${total}`;
    el.swipeUndoBtn.disabled = state.swipeHistory.length === 0;

    const deck = state.filtered.slice(state.swipeIndex, state.swipeIndex + 3);
    if (deck.length === 0) {
      el.swipeEmpty.hidden = false;
      return;
    }
    el.swipeEmpty.hidden = true;

    deck.forEach((p, idx) => {
      const cardEl = buildSwipeCard(p);
      if (idx === 0) {
        cardEl.style.zIndex = "2";
        attachSwipeGestures(cardEl, p);
      } else if (idx === 1) {
        cardEl.classList.add("swipe-stack-1");
      } else {
        cardEl.classList.add("swipe-stack-2");
      }
      el.swipeStage.appendChild(cardEl);
    });
  }

  function attachSwipeGestures(cardEl, p) {
    let startX = 0, startY = 0, curX = 0, curY = 0, dragging = false;
    const threshold = 110;

    const stampInclude = cardEl.querySelector(".swipe-stamp-include");
    const stampExclude = cardEl.querySelector(".swipe-stamp-exclude");
    const stampMaybe = cardEl.querySelector(".swipe-stamp-maybe");

    function updateTransform(dx, dy) {
      cardEl.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 18}deg)`;
      const absX = Math.abs(dx), absY = Math.abs(dy);
      stampInclude.style.opacity = dx > 20 && absX >= absY ? Math.min(1, dx / threshold) : 0;
      stampExclude.style.opacity = dx < -20 && absX >= absY ? Math.min(1, -dx / threshold) : 0;
      stampMaybe.style.opacity = dy < -20 && absY > absX ? Math.min(1, -dy / threshold) : 0;
    }

    function onPointerDown(e) {
      if (e.target.closest(".swipe-detail-toggle, .swipe-detail-panel, a")) return;
      if (state.swipeBusy) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      cardEl.classList.add("swipe-dragging");
      cardEl.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e) {
      if (!dragging) return;
      curX = e.clientX - startX;
      curY = e.clientY - startY;
      updateTransform(curX, curY);
    }

    function onPointerUp() {
      if (!dragging) return;
      dragging = false;
      cardEl.classList.remove("swipe-dragging");
      const absX = Math.abs(curX), absY = Math.abs(curY);
      if (absX > threshold && absX >= absY) {
        commitSwipe(curX > 0 ? "include" : "exclude", cardEl, p);
      } else if (absY > threshold && -curY > absX) {
        commitSwipe("maybe", cardEl, p);
      } else {
        cardEl.classList.add("swipe-returning");
        updateTransform(0, 0);
        setTimeout(() => cardEl.classList.remove("swipe-returning"), 350);
      }
      curX = 0;
      curY = 0;
    }

    cardEl.addEventListener("pointerdown", onPointerDown);
    cardEl.addEventListener("pointermove", onPointerMove);
    cardEl.addEventListener("pointerup", onPointerUp);
    cardEl.addEventListener("pointercancel", onPointerUp);

    // trackpad flick (two-finger swipe without a click-drag) — browsers report this as wheel events
    let wheelX = 0, wheelY = 0, wheelEngaged = false, wheelTimer = null;

    function onWheel(e) {
      if (state.swipeBusy) return;
      if (dragging) return;
      if (!wheelEngaged && Math.abs(e.deltaX) < Math.abs(e.deltaY) && Math.abs(e.deltaY) < 4) return;

      e.preventDefault();
      wheelEngaged = true;
      wheelX += e.deltaX;
      wheelY += e.deltaY;
      updateTransform(wheelX, wheelY);

      const absX = Math.abs(wheelX), absY = Math.abs(wheelY);
      clearTimeout(wheelTimer);
      if (absX > threshold && absX >= absY) {
        const decision = wheelX > 0 ? "include" : "exclude";
        wheelEngaged = false;
        wheelX = 0;
        wheelY = 0;
        commitSwipe(decision, cardEl, p);
        return;
      }
      if (absY > threshold && -wheelY > absX) {
        wheelEngaged = false;
        wheelX = 0;
        wheelY = 0;
        commitSwipe("maybe", cardEl, p);
        return;
      }

      wheelTimer = setTimeout(() => {
        wheelEngaged = false;
        wheelX = 0;
        wheelY = 0;
        cardEl.classList.add("swipe-returning");
        updateTransform(0, 0);
        setTimeout(() => cardEl.classList.remove("swipe-returning"), 350);
      }, 150);
    }

    cardEl.addEventListener("wheel", onWheel, { passive: false });
  }

  async function commitSwipe(decision, cardEl, p) {
    if (state.swipeBusy) return;
    if (!state.reviewer) {
      alert("先に右上で評価者名を入力してください。");
      el.reviewerInput.focus();
      cardEl.classList.add("swipe-returning");
      cardEl.style.transform = "";
      setTimeout(() => cardEl.classList.remove("swipe-returning"), 350);
      return;
    }

    state.swipeBusy = true;

    const flyX = decision === "include" ? 700 : decision === "exclude" ? -700 : 0;
    const flyY = decision === "maybe" ? -800 : 60;
    cardEl.classList.remove("swipe-dragging");
    cardEl.classList.add("swipe-flying");
    cardEl.style.transform = `translate(${flyX}px, ${flyY}px) rotate(${flyX / 18}deg)`;
    cardEl.style.pointerEvents = "none";

    const categorySelect = cardEl.querySelector(".category-select");
    const commentInput = cardEl.querySelector(".comment-input");
    const previousReview = (state.reviewsByPaper.get(p.id) || {})[state.reviewer] || null;

    const saved = await postReview({
      paper_id: p.id,
      reviewer: state.reviewer,
      decision,
      category: categorySelect.value || null,
      comment: commentInput.value || null,
    });
    applyReviewResult(p.id, state.reviewer, saved);
    state.swipeHistory.push({ paperId: p.id, previousReview });
    state.swipeIndex += 1;

    setTimeout(() => {
      state.swipeBusy = false;
      renderSwipeDeck();
    }, 380);
  }

  async function undoSwipe() {
    if (state.swipeHistory.length === 0 || state.swipeBusy) return;
    const last = state.swipeHistory.pop();
    state.swipeIndex = Math.max(0, state.swipeIndex - 1);

    if (last.previousReview) {
      const saved = await postReview({
        paper_id: last.paperId,
        reviewer: state.reviewer,
        decision: last.previousReview.decision,
        category: last.previousReview.category,
        comment: last.previousReview.comment,
      });
      applyReviewResult(last.paperId, state.reviewer, saved);
    } else {
      await deleteReview(last.paperId, state.reviewer);
      removeReviewResult(last.paperId, state.reviewer);
    }
    renderSwipeDeck();
  }

  function refreshCurrentView() {
    if (state.view === "swipe") {
      state.swipeIndex = 0;
      state.swipeHistory = [];
      renderSwipeDeck();
    } else {
      render();
    }
  }

  // ---- events ----

  el.reviewerInput.addEventListener("change", () => {
    state.reviewer = el.reviewerInput.value.trim();
    localStorage.setItem("yanagawa_reviewer", state.reviewer);
    applyFilters();
    refreshCurrentView();
  });

  el.searchInput.addEventListener("input", () => {
    state.query = el.searchInput.value;
    applyFilters();
    refreshCurrentView();
  });

  el.chips.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    el.chips.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    state.filter = btn.dataset.filter;
    applyFilters();
    refreshCurrentView();
  });

  el.exportBtn.addEventListener("click", exportCSV);

  el.viewToggle.addEventListener("click", (e) => {
    const btn = e.target.closest(".view-btn");
    if (!btn) return;
    if (btn.dataset.view === "swipe") enterSwipeView();
    else enterListView();
  });

  el.swipeBackToListBtn.addEventListener("click", enterListView);
  el.swipeUndoBtn.addEventListener("click", undoSwipe);

  el.swipeExcludeBtn.addEventListener("click", () => {
    const p = state.filtered[state.swipeIndex];
    const cardEl = swipeTopCard();
    if (p && cardEl) commitSwipe("exclude", cardEl, p);
  });
  el.swipeMaybeBtn.addEventListener("click", () => {
    const p = state.filtered[state.swipeIndex];
    const cardEl = swipeTopCard();
    if (p && cardEl) commitSwipe("maybe", cardEl, p);
  });
  el.swipeIncludeBtn.addEventListener("click", () => {
    const p = state.filtered[state.swipeIndex];
    const cardEl = swipeTopCard();
    if (p && cardEl) commitSwipe("include", cardEl, p);
  });

  document.addEventListener("keydown", (e) => {
    if (state.view !== "swipe") return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return;

    if (e.key === "Backspace") {
      e.preventDefault();
      undoSwipe();
      return;
    }
    const p = state.filtered[state.swipeIndex];
    const cardEl = swipeTopCard();
    if (!p || !cardEl) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      commitSwipe("exclude", cardEl, p);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      commitSwipe("include", cardEl, p);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      commitSwipe("maybe", cardEl, p);
    }
  });

  init();
})();
