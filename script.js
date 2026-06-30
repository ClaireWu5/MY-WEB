/* =========================================================
   Claire's Digital Herbary — Interactions v3
   1. 状态过滤器（按层高亮 + 跳转）
   2. 根系主茎随滚动生长描线
   3. 同层根须连线绘制 + 悬停高亮
   4. 阻尼感 3D Tilt
   5. 进入视口淡入
   ========================================================= */
(function () {
  "use strict";

  var prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  var body = document.body;

  /* -------------------------------------------------------
     1. 状态过滤器：点某层 → 该层正常、其余层淡化 + 跳转
        ALL → 全部恢复
  ------------------------------------------------------- */
  var filterBtns = Array.prototype.slice.call(
    document.querySelectorAll(".filter-btn")
  );
  var layers = Array.prototype.slice.call(document.querySelectorAll(".layer"));

  function applyFilter(filter) {
    if (filter === "all") {
      body.removeAttribute("data-focus-layer");
      layers.forEach(function (l) {
        l.classList.remove("is-focus");
      });
      return;
    }
    body.setAttribute("data-focus-layer", filter);
    layers.forEach(function (l) {
      if (l.dataset.layer === filter) l.classList.add("is-focus");
      else l.classList.remove("is-focus");
    });
  }

  filterBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      filterBtns.forEach(function (b) {
        b.classList.remove("is-active");
      });
      btn.classList.add("is-active");
      applyFilter(btn.dataset.filter);

      var jump = btn.dataset.jump;
      if (jump) {
        var target = document.querySelector(jump);
        if (target) {
          target.scrollIntoView({
            behavior: prefersReduced ? "auto" : "smooth",
            block: "start"
          });
        }
      }
    });
  });

  /* -------------------------------------------------------
     2. 根系主茎随滚动生长描线
  ------------------------------------------------------- */
  var taprootPath = document.getElementById("taprootPath");
  if (taprootPath && !prefersReduced) {
    var totalLen = 2400;
    try {
      totalLen = taprootPath.getTotalLength();
    } catch (e) {}
    taprootPath.style.strokeDasharray = totalLen;
    taprootPath.style.strokeDashoffset = totalLen;

    var canvas = document.querySelector(".canvas");

    function onScroll() {
      if (!canvas) return;
      var rect = canvas.getBoundingClientRect();
      var vh = window.innerHeight;
      // 进度：canvas 顶部进入视口 → 底部离开
      var scrolled = vh - rect.top;
      var range = rect.height + vh;
      var p = Math.max(0, Math.min(1, scrolled / range));
      taprootPath.style.strokeDashoffset = totalLen * (1 - p);
    }

    var ticking = false;
    window.addEventListener(
      "scroll",
      function () {
        if (!ticking) {
          window.requestAnimationFrame(function () {
            onScroll();
            ticking = false;
          });
          ticking = true;
        }
      },
      { passive: true }
    );
    window.addEventListener("resize", onScroll);
    onScroll();
  }

  /* -------------------------------------------------------
     3. 同层根须连线：在每层的 .root-web 内按卡片位置连线
        （连相邻卡片中心，形成松散的同层网）
  ------------------------------------------------------- */
  function buildRootWeb(svgId, container, itemSel) {
    var svg = document.getElementById(svgId);
    if (!svg || !container) return null;
    var items = Array.prototype.slice.call(container.querySelectorAll(itemSel));
    if (items.length < 2) return null;

    function draw() {
      var box = container.getBoundingClientRect();
      svg.setAttribute("viewBox", "0 0 " + box.width + " " + box.height);
      // 清空
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      var pts = items.map(function (el) {
        var r = el.getBoundingClientRect();
        return {
          el: el,
          x: r.left - box.left + r.width / 2,
          y: r.top - box.top + r.height / 2
        };
      });

      // 按内容相近度连线：相邻卡片 + 同 data-group 的串联
      var pathStr = "";
      for (var i = 0; i < pts.length - 1; i++) {
        var a = pts[i];
        var b = pts[i + 1];
        var mx = (a.x + b.x) / 2;
        var my = (a.y + b.y) / 2 + 28; // 下垂的根须弧
        pathStr +=
          "M" + a.x + " " + a.y + " Q" + mx + " " + my + " " + b.x + " " + b.y + " ";
      }
      // 额外：把同 group 的首尾也连一笔（让同类成环）
      var groups = {};
      pts.forEach(function (p) {
        var g = p.el.dataset.group || "_";
        (groups[g] = groups[g] || []).push(p);
      });
      Object.keys(groups).forEach(function (g) {
        var arr = groups[g];
        if (arr.length > 1) {
          var f = arr[0];
          var l = arr[arr.length - 1];
          pathStr +=
            "M" + f.x + " " + f.y +
            " Q" + (f.x + l.x) / 2 + " " + ((f.y + l.y) / 2 - 24) +
            " " + l.x + " " + l.y + " ";
        }
      });

      var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathStr);
      svg.appendChild(path);
      return path;
    }

    var path = draw();
    window.addEventListener("resize", draw);
    return { svg: svg, redraw: draw };
  }

  var webs = [
    buildRootWeb("rootWebFruit", document.getElementById("orchard"), ".fruit"),
    buildRootWeb("rootWebSprout", document.getElementById("sproutBed"), ".sprout"),
    buildRootWeb("rootWebSeed", document.getElementById("seedBed"), ".seed-dot")
  ];

  /* -------------------------------------------------------
     悬停同层卡片：点亮本层根须 + 其余层淡化
  ------------------------------------------------------- */
  var allItems = Array.prototype.slice.call(
    document.querySelectorAll(".fruit, .sprout, .seed-dot")
  );
  var layerEls = Array.prototype.slice.call(document.querySelectorAll(".layer"));

  function setFocus(layerName, on) {
    if (on) {
      body.setAttribute("data-focus-layer", layerName);
      layerEls.forEach(function (l) {
        l.classList.toggle("is-focus", l.dataset.layer === layerName);
      });
    } else {
      // 仅当不是由过滤按钮锁定时才清除
      if (!hasActiveFilter()) {
        body.removeAttribute("data-focus-layer");
        layerEls.forEach(function (l) {
          l.classList.remove("is-focus");
        });
      }
    }
    // 点亮对应 web
    webs.forEach(function (w) {
      if (!w) return;
      var p = w.svg.querySelector("path");
      if (!p) return;
      var belongs = w.svg.id.toLowerCase().indexOf(layerName.slice(0, 4)) > -1;
      p.classList.toggle("is-lit", on && belongs);
    });
  }

  function hasActiveFilter() {
    var active = document.querySelector(".filter-btn.is-active");
    return active && active.dataset.filter && active.dataset.filter !== "all";
  }

  if (window.matchMedia("(hover: hover)").matches) {
    allItems.forEach(function (item) {
      var layerName = item.dataset.layer;
      item.addEventListener("mouseenter", function () {
        setFocus(layerName, true);
      });
      item.addEventListener("mouseleave", function () {
        setFocus(layerName, false);
      });
    });
  }

  /* -------------------------------------------------------
     4. 阻尼感 3D Tilt（按层调强度：果稳、种轻浮）
  ------------------------------------------------------- */
  if (!prefersReduced && window.matchMedia("(hover: hover)").matches) {
    allItems.forEach(function (card) {
      var raf = null;
      var baseRot = parseFloat(card.style.getPropertyValue("--rot")) || 0;
      var maxTilt = card.classList.contains("seed-dot")
        ? 4
        : card.classList.contains("sprout")
        ? 6
        : 7;

      function onMove(e) {
        var rect = card.getBoundingClientRect();
        var px = (e.clientX - rect.left) / rect.width;
        var py = (e.clientY - rect.top) / rect.height;
        var rotY = (px - 0.5) * (maxTilt * 2);
        var rotX = (0.5 - py) * (maxTilt * 2);
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(function () {
          card.style.transform =
            "rotate(" + baseRot + "deg) perspective(900px) rotateX(" +
            rotX.toFixed(2) + "deg) rotateY(" + rotY.toFixed(2) +
            "deg) translateY(-4px) scale(1.02)";
        });
      }
      function onLeave() {
        if (raf) cancelAnimationFrame(raf);
        card.style.transform = "rotate(" + baseRot + "deg)";
      }
      card.addEventListener("mousemove", onMove);
      card.addEventListener("mouseleave", onLeave);
    });
  }

  /* -------------------------------------------------------
     5. 进入视口淡入
  ------------------------------------------------------- */
  if (!prefersReduced && "IntersectionObserver" in window) {
    var revealEls = Array.prototype.slice.call(
      document.querySelectorAll(".fruit, .sprout, .seed-dot, .layer-node, .hero-right")
    );
    revealEls.forEach(function (el) {
      el.dataset.revealBase = el.style.transform || "";
      el.style.opacity = "0";
      el.style.transition =
        "opacity .6s ease, transform .7s cubic-bezier(.34,1.56,.64,1)";
    });

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry, i) {
          if (entry.isIntersecting) {
            var el = entry.target;
            setTimeout(function () {
              el.style.opacity = "";
            }, Math.min(i * 50, 240));
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.12 }
    );
    revealEls.forEach(function (el) {
      io.observe(el);
    });
  }

  // 根须初次绘制（等字体/布局稳定后重绘一次）
  window.addEventListener("load", function () {
    setTimeout(function () {
      webs.forEach(function (w) {
        if (w) w.redraw();
      });
    }, 300);
  });
})();
