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
    return root ? root.querySelectorAll("a[href], button:not([disabled])") : [];
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
    window.addEventListener("resize", function () {
      if (window.matchMedia("(min-width: 900px)").matches) closeMenu();
    });
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
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
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
