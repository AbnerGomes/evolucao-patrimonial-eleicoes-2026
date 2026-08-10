(function () {
  "use strict";

  var PAGE_SIZE = 50;
  var DEADLINE_ISO = "2026-08-15"; // fim do prazo de registro de candidaturas (19h)

  var state = {
    all: [],
    meta: null,
    filtered: [],
    sortKey: "pat2026",
    sortDir: "desc",
    page: 1,
    filters: { search: "", cargo: "", uf: "", partido: "", variacao: "" },
  };

  var els = {};

  function $(id) { return document.getElementById(id); }

  function normalize(s) {
    return (s || "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  var brl0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  var brl2 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
  var brlCompact;
  try {
    brlCompact = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
  } catch (e) {
    brlCompact = brl0;
  }
  var pct1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

  function loadData() {
    fetch("data.json")
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (json) {
        state.meta = json.meta;
        state.all = json.candidatos.map(function (c) {
          c._search = normalize(c.urna + " " + c.nome + " " + c.partido + " " + c.partidoNome);
          return c;
        });
        init();
      })
      .catch(function (err) {
        $("tbody").innerHTML =
          '<tr><td colspan="8" class="empty-row">Não foi possível carregar data.json (' +
          err.message +
          "). Rode <code>python3 scripts/build_data.py</code> e sirva a pasta public/.</td></tr>";
      });
  }

  function init() {
    cacheEls();
    populateFilterOptions();
    renderBanner();
    wireEvents();
    applyFilters();
  }

  function cacheEls() {
    els.search = $("fSearch");
    els.cargo = $("fCargo");
    els.uf = $("fUf");
    els.partido = $("fPartido");
    els.variacao = $("fVariacao");
    els.reset = $("fReset");
    els.tbody = $("tbody");
    els.pPrev = $("pPrev");
    els.pNext = $("pNext");
    els.pInfo = $("pInfo");
    els.statShown = $("statShown");
    els.statTotal = $("statTotal");
    els.statPatTotal = $("statPatTotal");
    els.statComBens = $("statComBens");
    els.statConcorreram2022 = $("statConcorreram2022");
    els.footGeradoEm = $("footGeradoEm");
    els.banner = $("banner");
    els.bannerText = $("bannerText");
  }

  function populateFilterOptions() {
    var m = state.meta;
    fillSelect(els.cargo, m.cargos);
    fillSelect(els.uf, m.ufs);
    fillSelect(els.partido, m.partidos);
    if (m.geradoEm) els.footGeradoEm.textContent = m.geradoEm;
  }

  function fillSelect(select, values) {
    values.forEach(function (v) {
      var opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    });
  }

  function renderBanner() {
    var today = new Date();
    var deadline = new Date(DEADLINE_ISO + "T19:00:00-03:00");
    if (today <= deadline) {
      var diffDays = Math.ceil((deadline - today) / 86400000);
      els.bannerText.textContent =
        "O prazo para registro de candidaturas do TSE vai até 15/08/2026 (faltam " +
        diffDays +
        " dia" + (diffDays === 1 ? "" : "s") + "). A lista abaixo é atualizada conforme o TSE publica novos registros — " +
        "ainda não é a lista final de candidatos de 2026.";
      els.banner.hidden = false;
    }
  }

  function wireEvents() {
    els.search.addEventListener("input", debounce(function () {
      state.filters.search = normalize(els.search.value.trim());
      state.page = 1;
      applyFilters();
    }, 120));
    [["cargo", els.cargo], ["uf", els.uf], ["partido", els.partido], ["variacao", els.variacao]].forEach(function (pair) {
      pair[1].addEventListener("change", function () {
        state.filters[pair[0]] = pair[1].value;
        state.page = 1;
        applyFilters();
      });
    });
    els.reset.addEventListener("click", function () {
      state.filters = { search: "", cargo: "", uf: "", partido: "", variacao: "" };
      els.search.value = "";
      els.cargo.value = "";
      els.uf.value = "";
      els.partido.value = "";
      els.variacao.value = "";
      state.page = 1;
      applyFilters();
    });
    els.pPrev.addEventListener("click", function () { changePage(-1); });
    els.pNext.addEventListener("click", function () { changePage(1); });

    document.querySelectorAll("th[data-sort]").forEach(function (th) {
      th.addEventListener("click", function () {
        var key = th.getAttribute("data-sort");
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        } else {
          state.sortKey = key;
          state.sortDir = key === "urna" || key === "cargo" || key === "uf" || key === "partido" ? "asc" : "desc";
        }
        state.page = 1;
        applyFilters();
      });
    });

    var themeBtn = $("themeToggle");
    var saved = localStorage.getItem("theme");
    if (saved) document.documentElement.setAttribute("data-theme", saved);
    themeBtn.addEventListener("click", function () {
      var cur = document.documentElement.getAttribute("data-theme");
      var next = cur === "dark" ? "light" : (cur === "light" ? null : "dark");
      if (next) {
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("theme", next);
      } else {
        document.documentElement.removeAttribute("data-theme");
        localStorage.removeItem("theme");
      }
    });
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(null, args); }, ms);
    };
  }

  function changePage(delta) {
    var maxPage = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
    state.page = Math.min(maxPage, Math.max(1, state.page + delta));
    renderTable();
  }

  function applyFilters() {
    var f = state.filters;
    state.filtered = state.all.filter(function (c) {
      if (f.cargo && c.cargo !== f.cargo) return false;
      if (f.uf && c.uf !== f.uf) return false;
      if (f.partido && c.partido !== f.partido) return false;
      if (f.search && c._search.indexOf(f.search) === -1) return false;
      if (f.variacao === "aumento" && !(c.concorreu2022 && c.pat2026 > c.pat2022)) return false;
      if (f.variacao === "queda" && !(c.concorreu2022 && c.pat2026 < c.pat2022)) return false;
      if (f.variacao === "novo" && c.concorreu2022) return false;
      return true;
    });
    sortFiltered();
    renderStats();
    renderTable();
  }

  function sortFiltered() {
    var key = state.sortKey;
    var dir = state.sortDir === "asc" ? 1 : -1;

    if (key === "variacao" && dir === 1) {
      // Ascendente: candidatos com comparação real (concorreram em 2022) vão
      // primeiro, das maiores quedas até os maiores aumentos ("verdinho").
      // Quem é 1ª candidatura não tem variação real, então fica sempre
      // depois — nunca intercalado no meio dos que caíram/subiram.
      var real = state.filtered.filter(function (c) { return c.concorreu2022; });
      var novo = state.filtered.filter(function (c) { return !c.concorreu2022; });
      real.sort(function (a, b) { return (a.pat2026 - a.pat2022) - (b.pat2026 - b.pat2022); });
      novo.sort(function (a, b) { return a.pat2026 - b.pat2026; });
      state.filtered = real.concat(novo);
    } else {
      state.filtered.sort(function (a, b) {
        var va, vb;
        if (key === "variacao") {
          va = a.pat2026 - a.pat2022;
          vb = b.pat2026 - b.pat2022;
        } else {
          va = a[key];
          vb = b[key];
        }
        if (typeof va === "string") {
          return va.localeCompare(vb, "pt-BR") * dir;
        }
        return (va - vb) * dir;
      });
    }
    document.querySelectorAll("th[data-sort]").forEach(function (th) {
      var arrow = th.querySelector(".sort-arrow");
      if (th.getAttribute("data-sort") === key) {
        arrow.textContent = dir === 1 ? "▲" : "▼";
      } else {
        arrow.textContent = "";
      }
    });
  }

  function renderStats() {
    var list = state.filtered;
    var patTotal = 0, comBens = 0, concorreram = 0;
    for (var i = 0; i < list.length; i++) {
      patTotal += list[i].pat2026;
      if (list[i].pat2026 > 0) comBens++;
      if (list[i].concorreu2022) concorreram++;
    }
    els.statShown.textContent = list.length.toLocaleString("pt-BR");
    els.statTotal.textContent = "de " + state.meta.totalCandidatos.toLocaleString("pt-BR") + " no total";
    els.statPatTotal.textContent = brlCompact.format(patTotal);
    els.statComBens.textContent = comBens.toLocaleString("pt-BR") +
      (list.length ? " (" + pct1.format((100 * comBens) / list.length) + "%)" : "");
    els.statConcorreram2022.textContent = concorreram.toLocaleString("pt-BR") +
      (list.length ? " (" + pct1.format((100 * concorreram) / list.length) + "%)" : "");
  }

  function deltaCell(c) {
    if (!c.concorreu2022) {
      return '<span class="delta-new">— (1ª candidatura)</span>';
    }
    var diff = c.pat2026 - c.pat2022;
    var cls = diff >= 0 ? "delta-up" : "delta-down";
    var arrow = diff >= 0 ? "▲" : "▼";
    var pctTxt;
    if (c.pat2022 > 0) {
      pctTxt = pct1.format(Math.abs((diff / c.pat2022) * 100)) + "%";
    } else {
      pctTxt = "novo patrimônio";
    }
    return '<span class="' + cls + '">' + arrow + " " + brl0.format(Math.abs(diff)) +
      '<span class="delta-sub">' + pctTxt + "</span></span>";
  }

  function rowHtml(c, rank) {
    var pat2022Cell = c.concorreu2022
      ? '<span title="' + brl2.format(c.pat2022) + '">' + brl0.format(c.pat2022) + "</span>"
      : '<span title="Não concorreu em 2022">' + brl0.format(0) + '</span><span class="badge">1ª candidatura</span>';

    return (
      "<tr>" +
      '<td class="col-rank">' + rank + "</td>" +
      '<td class="col-cand"><div class="cand-urna">' + escapeHtml(c.urna) + "</div>" +
      '<div class="cand-nome">' + escapeHtml(c.nome) + "</div>" +
      '<div class="cand-nr">Nº ' + escapeHtml(c.nr) + " · " + escapeHtml(c.genero) + "</div></td>" +
      "<td>" + escapeHtml(c.cargo) + "</td>" +
      "<td>" + escapeHtml(c.uf) + "</td>" +
      '<td title="' + escapeHtml(c.partidoNome) + '">' + escapeHtml(c.partido) + "</td>" +
      '<td class="col-num" title="' + brl2.format(c.pat2026) + '">' + brl0.format(c.pat2026) + "</td>" +
      '<td class="col-num">' + pat2022Cell + "</td>" +
      '<td class="col-num">' + deltaCell(c) + "</td>" +
      "</tr>"
    );
  }

  function escapeHtml(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
    });
  }

  function renderTable() {
    var total = state.filtered.length;
    var maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (state.page > maxPage) state.page = maxPage;
    var start = (state.page - 1) * PAGE_SIZE;
    var pageItems = state.filtered.slice(start, start + PAGE_SIZE);

    if (!pageItems.length) {
      els.tbody.innerHTML = '<tr><td colspan="8" class="empty-row">Nenhum candidato encontrado com esses filtros.</td></tr>';
    } else {
      var html = "";
      for (var i = 0; i < pageItems.length; i++) {
        html += rowHtml(pageItems[i], start + i + 1);
      }
      els.tbody.innerHTML = html;
    }

    els.pInfo.textContent = total
      ? "Mostrando " + (start + 1) + "–" + Math.min(start + PAGE_SIZE, total) + " de " + total.toLocaleString("pt-BR")
      : "0 resultados";
    els.pPrev.disabled = state.page <= 1;
    els.pNext.disabled = state.page >= maxPage;
  }

  loadData();
})();
