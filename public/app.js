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
      const payload = {
        paper_id: p.id,
        reviewer: state.reviewer,
        decision: currentDecision,
        category: categorySelect.value || null,
        comment: commentInput.value || null,
      };
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const saved = await res.json();
      if (!state.reviewsByPaper.has(p.id)) state.reviewsByPaper.set(p.id, {});
      state.reviewsByPaper.get(p.id)[state.reviewer] = saved;

      saveBtn.textContent = "保存済み";
      saveBtn.classList.add("saved");
      setTimeout(() => {
        saveBtn.textContent = "保存";
        saveBtn.classList.remove("saved");
      }, 1200);

      renderSummary(node.querySelector(".reviews-summary"), p.id);
      card.classList.toggle("has-conflict", paperHasConflict(p.id));
      updateGauge();
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

  // ---- events ----

  el.reviewerInput.addEventListener("change", () => {
    state.reviewer = el.reviewerInput.value.trim();
    localStorage.setItem("yanagawa_reviewer", state.reviewer);
    applyFilters();
    render();
  });

  el.searchInput.addEventListener("input", () => {
    state.query = el.searchInput.value;
    applyFilters();
    render();
  });

  el.chips.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    el.chips.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    state.filter = btn.dataset.filter;
    applyFilters();
    render();
  });

  el.exportBtn.addEventListener("click", exportCSV);

  init();
})();
