/* HungryGen Spokane — shared UI: mobile menu, condensing header, scroll reveal, countdown.
   Interaction patterns are original (inspired by KOVA Sacramento behavior, not its code). */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var header = document.querySelector(".site-header");
  var toggle = document.getElementById("menu-toggle");
  var drawer = document.getElementById("mobile-nav");
  var backdrop = document.getElementById("nav-backdrop");

  var lockedScrollY = 0;
  var menuOpenedAt = 0;
  var menuIsOpen = false;

  function setCondensed() {
    if (!header) return;
    /* While the menu is open, body is position:fixed and scrollY is 0.
       Freeze the condensed state so the header does not jump. */
    if (menuIsOpen) return;
    header.classList.toggle("is-condensed", window.scrollY > 24);
  }

  function focusNoScroll(el) {
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
    } catch (err) {
      el.focus();
    }
  }

  setCondensed();
  window.addEventListener("scroll", setCondensed, { passive: true });

  function focusables(root) {
    return root ? root.querySelectorAll("a[href], button:not([disabled]), summary") : [];
  }

  function menuFocusables() {
    var items = drawer ? Array.prototype.slice.call(focusables(drawer)) : [];
    if (toggle) items.unshift(toggle);
    return items;
  }

  function lockScroll() {
    lockedScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    menuIsOpen = true;
    var b = document.body;
    var root = document.documentElement;
    b.classList.add("menu-open");
    b.style.position = "fixed";
    b.style.top = "-" + lockedScrollY + "px";
    b.style.left = "0";
    b.style.right = "0";
    b.style.width = "100%";
    b.style.overflow = "hidden";
    root.style.overflow = "hidden";
  }

  function unlockScroll(restore) {
    var b = document.body;
    var root = document.documentElement;
    var y = lockedScrollY;
    b.classList.remove("menu-open");
    b.style.position = "";
    b.style.top = "";
    b.style.left = "";
    b.style.right = "";
    b.style.width = "";
    b.style.overflow = "";
    root.style.overflow = "";
    menuIsOpen = false;
    if (restore !== false) {
      window.scrollTo(0, y);
      root.scrollTop = y;
      b.scrollTop = 0;
    }
    setCondensed();
  }

  function closeMenu(opts) {
    if (!toggle || !drawer) return;
    var restore = !opts || opts.restoreScroll !== false;
    toggle.setAttribute("aria-expanded", "false");
    drawer.hidden = true;
    drawer.classList.remove("is-open");
    if (backdrop) {
      backdrop.classList.remove("is-open");
      backdrop.hidden = true;
    }
    unlockScroll(restore);
  }

  function openMenu() {
    toggle.setAttribute("aria-expanded", "true");
    drawer.hidden = false;
    drawer.classList.add("is-open");
    if (backdrop) {
      backdrop.hidden = false;
      backdrop.classList.add("is-open");
    }
    lockScroll();
    menuOpenedAt = Date.now();
    var items = focusables(drawer);
    if (items[0]) focusNoScroll(items[0]);
  }

  if (toggle && drawer) {
    toggle.setAttribute("aria-label", "Menu");
    toggle.addEventListener("click", function () {
      if (toggle.getAttribute("aria-expanded") === "true") closeMenu();
      else openMenu();
    });
    if (backdrop) {
      backdrop.addEventListener("click", function () {
        /* Ignore a residual iOS click that can land on the newly opened backdrop. */
        if (Date.now() - menuOpenedAt < 300) return;
        closeMenu();
        focusNoScroll(toggle);
      });
    }
    document.addEventListener("keydown", function (e) {
      if (toggle.getAttribute("aria-expanded") !== "true") return;
      if (e.key === "Escape") {
        closeMenu();
        focusNoScroll(toggle);
        return;
      }
      if (e.key !== "Tab") return;
      var items = menuFocusables();
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        focusNoScroll(last);
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        focusNoScroll(first);
      }
    });
    drawer.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        var href = link.getAttribute("href") || "";
        /* Same-page hashes should scroll to the target, not back to the pre-open offset. */
        var isInPageHash = href.charAt(0) === "#";
        closeMenu({ restoreScroll: !isInPageHash });
      });
    });
    /* Keep only one menu group open so the list stays compact. */
    var groups = drawer.querySelectorAll(".nav-drawer__group");
    groups.forEach(function (group) {
      group.addEventListener("toggle", function () {
        if (!group.open) return;
        groups.forEach(function (other) {
          if (other !== group) other.open = false;
        });
      });
    });
    /* The dropdown is used on desktop and mobile, so do not auto-close at 900px. */
  }

  var revealNodes = document.querySelectorAll(".reveal");
  if (reduce) {
    revealNodes.forEach(function (el) {
      el.classList.add("is-visible");
    });
  } else if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0 }
    );
    revealNodes.forEach(function (el) {
      io.observe(el);
    });
  } else {
    revealNodes.forEach(function (el) {
      el.classList.add("is-visible");
    });
  }
})();

/* Next Sunday 6:00 PM America/Los_Angeles countdown.
   Wall-clock times are computed with Intl so the target stays 6:00 PM across DST. */
(function () {
  const root = document.querySelector("[data-countdown]");
  if (!root) return;

  const daysEl = root.querySelector("[data-days]");
  const hoursEl = root.querySelector("[data-hours]");
  const minutesEl = root.querySelector("[data-minutes]");
  const secondsEl = root.querySelector("[data-seconds]");
  const statusEl = root.querySelector("[data-countdown-status]");
  if (!daysEl || !hoursEl || !minutesEl || !secondsEl) return;

  const TZ = "America/Los_Angeles";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let lastStatusText = "";
  let lastStatusAt = 0;

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function tzParts(date) {
    const parts = {};
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    fmt.formatToParts(date).forEach(function (p) {
      if (p.type !== "literal") parts[p.type] = p.value;
    });
    return parts;
  }

  function offsetMs(ms) {
    const p = tzParts(new Date(ms));
    const asUTC = Date.UTC(
      +p.year,
      +p.month - 1,
      +p.day,
      +p.hour,
      +p.minute,
      +p.second
    );
    return asUTC - ms;
  }

  /* Convert a wall-clock time in America/Los_Angeles to a UTC instant. */
  function zonedLocalToUtc(year, month, day, hour, minute) {
    const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
    let instant = guess - offsetMs(guess);
    instant = guess - offsetMs(instant);
    return instant;
  }

  function nextSundaySixPm(fromMs) {
    const p = tzParts(new Date(fromMs));
    const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    let y = +p.year;
    let m = +p.month;
    let d = +p.day;
    const dow = weekdays[p.weekday];
    let target = zonedLocalToUtc(y, m, d, 18, 0);
    if (dow !== 0 || fromMs >= target) {
      const add = dow === 0 ? 7 : 7 - dow;
      const nd = new Date(Date.UTC(y, m - 1, d + add));
      y = nd.getUTCFullYear();
      m = nd.getUTCMonth() + 1;
      d = nd.getUTCDate();
      target = zonedLocalToUtc(y, m, d, 18, 0);
    }
    return target;
  }

  function statusPhrase(days, hours, minutes) {
    const parts = [];
    if (days > 0) parts.push(days === 1 ? "1 day" : days + " days");
    if (hours > 0) parts.push(hours === 1 ? "1 hour" : hours + " hours");
    if (days === 0 && hours === 0) {
      if (minutes > 0) parts.push(minutes === 1 ? "1 minute" : minutes + " minutes");
      else parts.push("less than a minute");
    }
    return "Sunday Service starts in " + parts.join(", ");
  }

  function maybeAnnounce(days, hours, minutes, nowMs) {
    if (!statusEl) return;
    const text = statusPhrase(days, hours, minutes);
    const due = lastStatusAt === 0 || nowMs - lastStatusAt >= 60000;
    if (due && text !== lastStatusText) {
      statusEl.textContent = text;
      lastStatusText = text;
      lastStatusAt = nowMs;
    } else if (due && lastStatusAt === 0) {
      statusEl.textContent = text;
      lastStatusText = text;
      lastStatusAt = nowMs;
    } else if (lastStatusAt === 0) {
      statusEl.textContent = text;
      lastStatusText = text;
      lastStatusAt = nowMs;
    }
  }

  function tick() {
    const now = Date.now();
    const target = nextSundaySixPm(now);
    let diff = Math.max(0, target - now);
    const days = Math.floor(diff / 86400000);
    diff -= days * 86400000;
    const hours = Math.floor(diff / 3600000);
    diff -= hours * 3600000;
    const minutes = Math.floor(diff / 60000);
    diff -= minutes * 60000;
    const seconds = Math.floor(diff / 1000);
    daysEl.textContent = pad(days);
    hoursEl.textContent = pad(hours);
    minutesEl.textContent = pad(minutes);
    secondsEl.textContent = pad(seconds);
    maybeAnnounce(days, hours, minutes, now);
  }

  // Expose for DST checks in a test harness.
  window.__hgNextSundaySixPm = nextSundaySixPm;
  window.__hgZonedLocalToUtc = zonedLocalToUtc;

  tick();
  if (!reduce) {
    setInterval(tick, 1000);
  } else {
    setInterval(tick, 60000);
  }
})();


/* Seamless infinite-loop announcement slider.
   Clones the first and last slides, animates through the clone, then
   silently resets translateX on transitionend so last→first and first→last
   never jump back. */
(function () {
  "use strict";

  var root = document.querySelector("[data-announce-slider]");
  if (!root) return;

  var viewport = root.querySelector(".announce-slider__viewport");
  var track = root.querySelector(".announce-slider__track");
  var status = root.querySelector("[data-slider-status]");
  var prevBtn = root.querySelector(".announce-slider__prev");
  var nextBtn = root.querySelector(".announce-slider__next");
  var dotsWrap = root.querySelector(".announce-slider__dots");
  if (!viewport || !track) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var slides = Array.prototype.slice.call(track.children);
  var n = slides.length;
  if (n === 0) return;

  var index = 0; /* real slide 0..n-1 */
  var pos = 1; /* track position including leading clone */
  var animating = false;
  var timer = null;
  var hovered = false;
  var INTERVAL = 6000;

  function realSlides() {
    return Array.prototype.slice.call(track.querySelectorAll(".announce-slider__slide:not(.is-clone)"));
  }

  function setTransition(on) {
    if (!on || reduce.matches) {
      track.style.transition = "none";
    } else {
      track.style.transition = "transform 1.2s cubic-bezier(0.45, 0, 0.55, 1)";
    }
  }

  function translate(p) {
    track.style.transform = "translateX(" + -p * 100 + "%)";
  }

  function announce() {
    if (!status) return;
    var slide = realSlides()[index];
    var title = slide ? (slide.getAttribute("data-title") || "Announcement " + (index + 1)) : "";
    status.textContent = "Slide " + (index + 1) + " of " + n + ": " + title;
  }

  function updateChrome() {
    var list = realSlides();
    list.forEach(function (slide, i) {
      var active = i === index;
      slide.setAttribute("aria-hidden", active ? "false" : "true");
      slide.querySelectorAll("a, button").forEach(function (el) {
        if (active) el.removeAttribute("tabindex");
        else el.setAttribute("tabindex", "-1");
      });
    });
    if (dotsWrap) {
      dotsWrap.querySelectorAll(".announce-slider__dot").forEach(function (dot, i) {
        if (i === index) dot.setAttribute("aria-current", "true");
        else dot.removeAttribute("aria-current");
      });
    }
    announce();
  }

  function goTo(nextIndex, direction) {
    if (n < 2) return;
    nextIndex = ((nextIndex % n) + n) % n;
    if (nextIndex === index && direction == null) return;
    if (animating) return;

    var dest;
    if (direction === "next" && nextIndex === 0 && index === n - 1) {
      dest = n + 1; /* trailing clone of first */
    } else if (direction === "prev" && nextIndex === n - 1 && index === 0) {
      dest = 0; /* leading clone of last */
    } else {
      dest = nextIndex + 1;
    }

    index = nextIndex;
    pos = dest;
    animating = !reduce.matches;
    setTransition(true);
    translate(pos);
    updateChrome();
    if (reduce.matches) {
      /* Instant wrap: snap to the real slide, no clone visible. */
      if (pos === 0 || pos === n + 1) {
        pos = index + 1;
        setTransition(false);
        translate(pos);
      }
      animating = false;
    }
  }

  function onTransitionEnd(e) {
    if (e.target !== track) return;
    if (e.propertyName && e.propertyName !== "transform") return;
    if (pos === 0) {
      setTransition(false);
      pos = n;
      translate(pos);
      track.offsetHeight; /* force reflow before restoring transition */
    } else if (pos === n + 1) {
      setTransition(false);
      pos = 1;
      translate(pos);
      track.offsetHeight;
    }
    setTransition(true);
    animating = false;
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function startTimer() {
    stopTimer();
    if (reduce.matches || n < 2 || hovered || document.hidden) return;
    timer = setInterval(function () {
      goTo(index + 1, "next");
    }, INTERVAL);
  }

  /* Build clones and dots once. */
  var first = slides[0].cloneNode(true);
  var last = slides[n - 1].cloneNode(true);
  first.classList.add("is-clone");
  last.classList.add("is-clone");
  first.setAttribute("aria-hidden", "true");
  last.setAttribute("aria-hidden", "true");
  first.querySelectorAll("a, button").forEach(function (el) {
    el.setAttribute("tabindex", "-1");
  });
  last.querySelectorAll("a, button").forEach(function (el) {
    el.setAttribute("tabindex", "-1");
  });
  track.insertBefore(last, slides[0]);
  track.appendChild(first);

  if (dotsWrap) {
    dotsWrap.innerHTML = "";
    for (var i = 0; i < n; i++) {
      (function (i) {
        var dot = document.createElement("button");
        dot.type = "button";
        dot.className = "announce-slider__dot";
        var title = slides[i].getAttribute("data-title") || "Announcement " + (i + 1);
        dot.setAttribute("aria-label", "Go to slide " + (i + 1) + ": " + title);
        dot.addEventListener("click", function () {
          var dir = i === index ? null : i > index || (index === n - 1 && i === 0) ? "next" : "prev";
          if (index === 0 && i === n - 1) dir = "prev";
          goTo(i, dir);
          startTimer();
        });
        dotsWrap.appendChild(dot);
      })(i);
    }
  }

  setTransition(false);
  pos = 1;
  translate(pos);
  track.offsetHeight;
  setTransition(true);
  updateChrome();

  track.addEventListener("transitionend", onTransitionEnd);

  if (prevBtn) {
    prevBtn.addEventListener("click", function () {
      goTo(index - 1, "prev");
      startTimer();
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", function () {
      goTo(index + 1, "next");
      startTimer();
    });
  }

  root.setAttribute("tabindex", "0");
  root.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      goTo(index - 1, "prev");
      startTimer();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      goTo(index + 1, "next");
      startTimer();
    }
  });

  function setHover(on) {
    hovered = on;
    if (on) stopTimer();
    else startTimer();
  }
  root.addEventListener("mouseenter", function () { setHover(true); });
  root.addEventListener("mouseleave", function () { setHover(false); });
  root.addEventListener("focusin", function () { setHover(true); });
  root.addEventListener("focusout", function (e) {
    if (!root.contains(e.relatedTarget)) setHover(false);
  });

  /* Touch / pointer swipe. */
  var startX = 0;
  var startY = 0;
  var tracking = false;
  viewport.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    tracking = true;
    startX = e.clientX;
    startY = e.clientY;
    stopTimer();
  });
  viewport.addEventListener("pointerup", function (e) {
    if (!tracking) return;
    tracking = false;
    var dx = e.clientX - startX;
    var dy = e.clientY - startY;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) goTo(index + 1, "next");
      else goTo(index - 1, "prev");
    }
    startTimer();
  });
  viewport.addEventListener("pointercancel", function () {
    tracking = false;
    startTimer();
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stopTimer();
    else startTimer();
  });
  if (typeof reduce.addEventListener === "function") {
    reduce.addEventListener("change", function () {
      startTimer();
    });
  }

  startTimer();
})();

// About Us sub-nav: on narrow screens, scroll the active pill into view.
(function () {
  var list = document.querySelector('.subnav__list');
  var active = list && list.querySelector('[aria-current="page"]');
  if (!active || list.scrollWidth <= list.clientWidth) return;
  var a = active.getBoundingClientRect(), l = list.getBoundingClientRect();
  list.scrollLeft += (a.left - l.left) - (l.width - a.width) / 2;
})();

/* t77u: instant filter (pills + keyword search) for FAQ and Connect Groups.
   Markup works without JS (everything visible); the bar is revealed only when JS runs. */
(function () {
  "use strict";
  var roots = document.querySelectorAll("[data-filter-root]");
  if (!roots.length) return;
  roots.forEach(function (root) {
    var bar = root.querySelector("[data-filter-bar]");
    var items = Array.prototype.slice.call(root.querySelectorAll("[data-tags]"));
    var sections = Array.prototype.slice.call(root.querySelectorAll("[data-filter-section]"));
    var search = root.querySelector("[data-filter-search]");
    var count = root.querySelector("[data-filter-count]");
    var empty = root.querySelector("[data-filter-empty]");
    var noun = root.getAttribute("data-filter-noun") || "items";
    var active = {};
    if (bar) bar.hidden = false;
    var texts = items.map(function (it) { return it.textContent.toLowerCase().replace(/\s+/g, " "); });

    function apply() {
      var terms = search ? search.value.toLowerCase().trim().split(/\s+/).filter(Boolean) : [];
      var shown = 0;
      items.forEach(function (it, i) {
        var tags = " " + (it.getAttribute("data-tags") || "") + " ";
        var ok = Object.keys(active).every(function (g) {
          return !active[g] || tags.indexOf(" " + active[g] + " ") > -1;
        });
        if (ok && terms.length) {
          ok = terms.every(function (t) { return texts[i].indexOf(t) > -1; });
        }
        it.hidden = !ok;
        if (ok) shown++;
      });
      sections.forEach(function (s) {
        s.hidden = !s.querySelector("[data-tags]:not([hidden])");
      });
      if (count) count.textContent = "Showing " + shown + " of " + items.length + " " + noun;
      if (empty) empty.hidden = shown > 0;
    }

    root.querySelectorAll("[data-filter]").forEach(function (pill) {
      pill.addEventListener("click", function () {
        var parts = pill.getAttribute("data-filter").split("=");
        var group = parts[0];
        var val = parts[1] || "";
        active[group] = val;
        root.querySelectorAll('[data-filter^="' + group + '="]').forEach(function (p) {
          p.setAttribute("aria-pressed", p === pill ? "true" : "false");
        });
        apply();
      });
    });
    if (search) {
      search.addEventListener("input", apply);
      search.addEventListener("keydown", function (e) {
        if (e.key === "Escape") { search.value = ""; apply(); }
      });
    }
    var reset = root.querySelector("[data-filter-reset]");
    if (reset) {
      reset.addEventListener("click", function () {
        active = {};
        if (search) search.value = "";
        root.querySelectorAll("[data-filter]").forEach(function (p) {
          p.setAttribute("aria-pressed", /=$/.test(p.getAttribute("data-filter")) ? "true" : "false");
        });
        apply();
      });
    }
    apply();
  });
})();

/* t77u: open a <details> when the URL hash targets it (or something inside it). */
(function () {
  function openFromHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    var el = document.getElementById(id);
    if (!el) return;
    var d = el.closest ? el.closest("details") : null;
    if (el.tagName === "DETAILS") d = el;
    if (d && !d.open) {
      d.open = true;
      requestAnimationFrame(function () { el.scrollIntoView({ block: "start" }); });
    }
  }
  openFromHash();
  window.addEventListener("hashchange", openFromHash);
})();
