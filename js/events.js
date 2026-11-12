/* HungryGen Spokane — events list renderer. No build step, no libraries.
   Reads /events/events.json, expands recurring rules, and redraws #event-archive.
   Must be served over http(s); fetch() does not work from file://. */
(function () {
  "use strict";

  var BASE_PATH = "/hungrygen-spokane-preview";
  var DATA_URL = BASE_PATH + "/events/events.json";
  var SITE_ORIGIN = "https://hungrygenspokane.com";
  var DEFAULT_TZ = "America/Los_Angeles";
  var DEFAULT_HORIZON_WEEKS = 8;

  var BYDAY_INDEX = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  var WEEKDAY_NAMES = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  var MONTH_NAMES = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
  var MONTH_TITLES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  var SHARE = [
    { slug: "facebook", label: "Facebook", href: function (u) { return "https://www.facebook.com/sharer/sharer.php?u=" + u; } },
    { slug: "twitter", label: "Twitter", href: function (u) { return "https://x.com/intent/tweet?url=" + u; } },
    { slug: "linkedin", label: "Linkedin", href: function (u) { return "https://www.linkedin.com/shareArticle?mini=true&url=" + u; } },
    { slug: "vk", label: "VK", href: function (u) { return "https://vk.com/share.php?url=" + u; } },
    { slug: "whatsapp", label: "WhatsApp", href: function (u) { return "https://api.whatsapp.com/send?text=" + u; } },
    { slug: "telegram", label: "Telegram", href: function (u) { return "https://t.me/share/url?url=" + u; } },
    { slug: "email", label: "Email", href: function (u, title) { return "mailto:?subject=" + title + "&body=" + u; } }
  ];

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function wallParts(date, tz) {
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      weekday: "short"
    }).formatToParts(date);
    var map = {};
    for (var i = 0; i < parts.length; i++) {
      map[parts[i].type] = parts[i].value;
    }
    return {
      year: +map.year,
      month: +map.month,
      day: +map.day,
      hour: +map.hour,
      minute: +map.minute,
      second: +map.second
    };
  }

  /* Turn a wall-clock time in `tz` into a real Date (UTC instant). */
  function fromZoned(year, month, day, hour, minute, tz) {
    var utc = Date.UTC(year, month - 1, day, hour, minute, 0);
    for (var i = 0; i < 4; i++) {
      var w = wallParts(new Date(utc), tz);
      var desired = Date.UTC(year, month - 1, day, hour, minute, 0);
      var actual = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
      var diff = desired - actual;
      if (diff === 0) break;
      utc += diff;
    }
    return new Date(utc);
  }

  function addCalendarDays(year, month, day, days) {
    var d = new Date(Date.UTC(year, month - 1, day + days));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }

  function weekdayOf(year, month, day, tz) {
    var date = fromZoned(year, month, day, 12, 0, tz);
    var w = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(date);
    var map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return map[w];
  }

  function parseYMD(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
    if (!m) return null;
    return { year: +m[1], month: +m[2], day: +m[3] };
  }

  function parseHM(s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(s || "");
    if (!m) return { hour: 0, minute: 0 };
    return { hour: +m[1], minute: +m[2] };
  }

  function hasEndTime(endTime) {
    return endTime != null && String(endTime).trim() !== "";
  }

  function formatClock(hm) {
    var hour = hm.hour % 12 || 12;
    var ap = hm.hour < 12 ? "AM" : "PM";
    return hour + ":" + pad(hm.minute) + " " + ap;
  }

  /* Visible time only. A missing or null endTime shows the start, with no dash. */
  function formatDisplayTime(startTime, endTime) {
    var start = formatClock(parseHM(startTime));
    if (!hasEndTime(endTime)) return start;
    return start + " – " + formatClock(parseHM(endTime));
  }

  /* For .ics and Google Calendar only. Not shown on the page. */
  function calendarEndHM(startTime, endTime) {
    if (hasEndTime(endTime)) return parseHM(endTime);
    var hm = parseHM(startTime);
    return { hour: (hm.hour + 1) % 24, minute: hm.minute, nextDay: hm.hour + 1 >= 24 };
  }

  function formatYmdCompact(year, month, day) {
    return String(year) + pad(month) + pad(day);
  }

  function formatHmCompact(hm) {
    return pad(hm.hour) + pad(hm.minute) + "00";
  }

  /* Google Calendar URL using wall times in America/Los_Angeles. */
  function googleCalendarUrl(occ, tz) {
    tz = tz || DEFAULT_TZ;
    var startHM = parseHM(occ.startTime);
    var endHM = calendarEndHM(occ.startTime, occ.endTime);
    var endYear = occ.year;
    var endMonth = occ.month;
    var endDay = occ.day;
    if (endHM.nextDay) {
      var next = addCalendarDays(occ.year, occ.month, occ.day, 1);
      endYear = next.year;
      endMonth = next.month;
      endDay = next.day;
    }
    var dates =
      formatYmdCompact(occ.year, occ.month, occ.day) +
      "T" +
      formatHmCompact(startHM) +
      "/" +
      formatYmdCompact(endYear, endMonth, endDay) +
      "T" +
      formatHmCompact(endHM);
    var params = new URLSearchParams({
      action: "TEMPLATE",
      text: occ.title || "",
      dates: dates,
      ctz: tz
    });
    if (occ.location) params.set("location", occ.location);
    if (occ.description) params.set("details", occ.description);
    return "https://calendar.google.com/calendar/render?" + params.toString();
  }

  /* Minimal VEVENT body. A missing endTime becomes a 1-hour block here only. */
  function icsEventBlock(occ, tz) {
    tz = tz || DEFAULT_TZ;
    var startHM = parseHM(occ.startTime);
    var endHM = calendarEndHM(occ.startTime, occ.endTime);
    var endYear = occ.year;
    var endMonth = occ.month;
    var endDay = occ.day;
    if (endHM.nextDay) {
      var next = addCalendarDays(occ.year, occ.month, occ.day, 1);
      endYear = next.year;
      endMonth = next.month;
      endDay = next.day;
    }
    var lines = [
      "BEGIN:VEVENT",
      "DTSTART;TZID=" + tz + ":" + formatYmdCompact(occ.year, occ.month, occ.day) + "T" + formatHmCompact(startHM),
      "DTEND;TZID=" + tz + ":" + formatYmdCompact(endYear, endMonth, endDay) + "T" + formatHmCompact(endHM),
      "SUMMARY:" + String(occ.title || "").replace(/\n/g, "\\n")
    ];
    if (occ.location) lines.push("LOCATION:" + String(occ.location).replace(/\n/g, "\\n"));
    if (occ.description) lines.push("DESCRIPTION:" + String(occ.description).replace(/\n/g, "\\n"));
    lines.push("END:VEVENT");
    return lines.join("\r\n");
  }

  function ymdKey(year, month, day) {
    return year + "-" + pad(month) + "-" + pad(day);
  }

  function occurrenceStart(year, month, day, startTime, tz) {
    var hm = parseHM(startTime);
    return fromZoned(year, month, day, hm.hour, hm.minute, tz);
  }

  function asOfDate(tz, asOf) {
    if (asOf) {
      var p = parseYMD(asOf);
      if (p) return fromZoned(p.year, p.month, p.day, 0, 0, tz);
    }
    return new Date();
  }

  function readAsOfFromPage() {
    try {
      var params = new URLSearchParams(window.location.search);
      return params.get("asof") || params.get("today") || "";
    } catch (e) {
      return "";
    }
  }

  function listed(ev) {
    return ev.list !== false;
  }

  function exceptionSet(ev) {
    var set = {};
    var list = ev.exceptions || [];
    for (var i = 0; i < list.length; i++) set[list[i]] = true;
    return set;
  }

  function expandData(data, now) {
    var tz = data.timezone || DEFAULT_TZ;
    var weeks = data.horizonWeeks || DEFAULT_HORIZON_WEEKS;
    var horizonEnd = new Date(now.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
    var startWall = wallParts(now, tz);
    var endWall = wallParts(horizonEnd, tz);
    var out = [];
    var events = data.events || [];

    for (var e = 0; e < events.length; e++) {
      var ev = events[e];
      if (!listed(ev)) continue;
      if (ev.type === "recurring" && ev.freq === "weekly") {
        var want = BYDAY_INDEX[ev.byDay];
        if (want == null) continue;
        var skip = exceptionSet(ev);
        var cursor = { year: startWall.year, month: startWall.month, day: startWall.day };
        /* Walk day-by-day from today through the horizon. */
        for (var n = 0; n < weeks * 7 + 2; n++) {
          var key = ymdKey(cursor.year, cursor.month, cursor.day);
          var pastEnd =
            cursor.year > endWall.year ||
            (cursor.year === endWall.year && cursor.month > endWall.month) ||
            (cursor.year === endWall.year && cursor.month === endWall.month && cursor.day > endWall.day);
          if (pastEnd) break;
          if (weekdayOf(cursor.year, cursor.month, cursor.day, tz) === want && !skip[key]) {
            var start = occurrenceStart(cursor.year, cursor.month, cursor.day, ev.startTime || "00:00", tz);
            if (start.getTime() >= now.getTime()) {
              out.push(makeOcc(ev, cursor, start, tz));
            }
          }
          cursor = addCalendarDays(cursor.year, cursor.month, cursor.day, 1);
        }
      } else if (ev.type === "one-off" && ev.date) {
        var d = parseYMD(ev.date);
        if (!d) continue;
        var startOne = occurrenceStart(d.year, d.month, d.day, ev.startTime || "00:00", tz);
        /* One-offs stay visible if they are still upcoming, even past the 8-week window. */
        if (startOne.getTime() >= now.getTime()) {
          out.push(makeOcc(ev, d, startOne, tz));
        }
      }
    }

    out.sort(function (a, b) {
      if (a.start.getTime() !== b.start.getTime()) return a.start.getTime() - b.start.getTime();
      return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
    });
    return out;
  }


  function shareTarget(ev) {
    if (ev.shareUrl) return ev.shareUrl;
    if (ev.url) {
      if (ev.url.indexOf("http") === 0) return ev.url;
      return SITE_ORIGIN + (ev.url.charAt(0) === "/" ? ev.url : "/" + ev.url);
    }
    return SITE_ORIGIN + "/events/";
  }

  function makeOcc(ev, date, start, tz) {
    tz = tz || DEFAULT_TZ;
    var startTime = ev.startTime || "";
    var endTime = hasEndTime(ev.endTime) ? ev.endTime : null;
    return {
      id: ev.id,
      title: ev.title || "",
      location: ev.location || "",
      mapUrl: ev.mapUrl || "",
      description: ev.description || "",
      startTime: startTime,
      endTime: endTime,
      displayTime: formatDisplayTime(startTime, endTime),
      url: ev.url || "",
      shareUrl: shareTarget(ev),
      year: date.year,
      month: date.month,
      day: date.day,
      start: start,
      weekday: weekdayOf(date.year, date.month, date.day, tz)
    };
  }

  function nextOccurrence(data, id, now) {
    /* Include events even when list is false, so countdown can use the same rules. */
    var saved = [];
    var events = data.events || [];
    for (var i = 0; i < events.length; i++) {
      if (events[i].id === id) {
        var copy = {};
        for (var k in events[i]) if (Object.prototype.hasOwnProperty.call(events[i], k)) copy[k] = events[i][k];
        copy.list = true;
        saved.push(copy);
      }
    }
    if (!saved.length) return null;
    var occ = expandData({ timezone: data.timezone, horizonWeeks: data.horizonWeeks || 52, events: saved }, now);
    return occ.length ? occ[0] : null;
  }

  function svgEl(pathD) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "currentColor");
    path.setAttribute("d", pathD);
    svg.appendChild(path);
    return svg;
  }

  var ICON_PATHS = {
    facebook: "M14.5 8.5h2.7V5h-2.7C12 5 10 7 10 9.5V11H8v3.5h2V20h3.5v-5.5h2.4l.6-3.5H13.5V9.5c0-.6.4-1 1-1z",
    twitter: "M14.7 10.3 21 3h-1.9l-5.5 6.3L9.3 3H3.5l6.7 9.7L3.5 21h1.9l6-6.8L14.7 21h5.8l-5.8-10.7zM11.9 13.2l-.7-1-5.5-7.8h2.4l4.4 6.3.7 1 5.8 8.2h-2.4l-4.7-6.7z",
    linkedin: "M6.5 9H4V20h2.5V9zM5.2 4A1.5 1.5 0 1 0 5.2 7 1.5 1.5 0 0 0 5.2 4zM20 20h-2.5v-5.8c0-1.6-.6-2.5-1.9-2.5-1 0-1.6.7-1.8 1.3-.1.2-.1.6-.1.9V20H11V9h2.5v1.5c.4-.7 1.3-1.8 3.2-1.8 2.3 0 4 1.5 4 4.8V20z",
    vk: "M3.5 7.5h2.2s.1 3.4 2.1 3.9c0 0 1-1.9 2.3-3.9h2.3s-2.3 3.4-2.3 4.1 2.5 2.6 2.5 2.6l2.5-2.6s.9-1.3 1.3-1.3.8.2 1.2 1.2c.4 1 .8 2.4.8 2.4s1.7-1.3 2.4-3.8c0 0 .5-1.5-.3-1.7H20s-1.9 4.1-2.6 5.1c0 0-.8 1.1-1.1 1.1s-.6-.3-1.1-1C14.6 13 13 10 13 10s-.3 3.3-.3 3.8c0 .2-.3 1-1.1 1S10 14 8.3 11.6C6.6 9.2 5.4 6.2 3.5 7.5z",
    whatsapp: "M12 3.2A8.8 8.8 0 0 0 4.8 16.3L3.5 20.5l4.3-1.3A8.8 8.8 0 1 0 12 3.2zm0 16a7.2 7.2 0 0 1-3.7-1l-.3-.2-2.6.8.8-2.5-.2-.3A7.2 7.2 0 1 1 12 19.2zm4-5.3c-.2-.1-1.3-.6-1.5-.7s-.3-.1-.5.1-.6.7-.7.8-.3.2-.5.1a5.8 5.8 0 0 1-1.7-1 6.3 6.3 0 0 1-1.2-1.5c-.1-.2 0-.3.1-.4l.3-.4.1-.2c0-.1 0-.2 0-.3s-.5-1.1-.6-1.5-.3-.3-.5-.3h-.4c-.1 0-.3.1-.5.3s-.6.6-.6 1.5.6 1.8.7 1.9 1.3 2 3.2 2.8a9 9 0 0 0 1.4.5 3.3 3.3 0 0 0 1.5.1c.5-.1 1.3-.5 1.5-1.1s.2-1 .1-1.1c-.1 0-.2-.1-.4-.2z",
    telegram: "M20.2 5.2 3.8 11.4c-1.1.4-1.1 1.1-.2 1.4l4.2 1.3 1.6 5c.2.6.4.8 1 .8.5 0 .7-.2 1-.6l2.2-2.3 4.6 3.4c.8.5 1.4.2 1.6-.8l2.9-13.5c.3-1.2-.4-1.7-1.5-1.2zM9.6 13.6l8.2-5.1c.4-.3.8-.1.5.2l-6.7 6.1-.3 2.8-1.7-4z",
    email: "M20 6H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1zm-1.2 1.5-6.3 4.5a.8.8 0 0 1-.9 0L5.3 7.5h13.5zM5 16.5V8.8l6.5 4.6a1.8 1.8 0 0 0 2 0L20 8.8v7.7H5z"
  };

  function shareUrl(url) {
    var abs = url;
    if (url.indexOf("http") !== 0) {
      abs = SITE_ORIGIN + (url.charAt(0) === "/" ? url : "/" + url);
    }
    return encodeURIComponent(abs);
  }

  function buildShareList(title, url) {
    var ul = document.createElement("ul");
    ul.className = "share-list share-list--labeled";
    var enc = shareUrl(url);
    var encTitle = encodeURIComponent(title);
    for (var i = 0; i < SHARE.length; i++) {
      var net = SHARE[i];
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.className = "share-link share-link--" + net.slug;
      a.href = net.href(enc, encTitle);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.setAttribute("aria-label", "Share " + title + " on " + net.label);
      a.appendChild(svgEl(ICON_PATHS[net.slug]));
      var span = document.createElement("span");
      span.className = "share-label";
      span.textContent = net.label;
      a.appendChild(span);
      li.appendChild(a);
      ul.appendChild(li);
    }
    return ul;
  }

  function buildCard(occ) {
    var article = document.createElement("article");
    article.className = "event-card";

    var date = document.createElement("div");
    date.className = "event-date";
    var numrow = document.createElement("div");
    numrow.className = "event-date__numrow";
    var day = document.createElement("span");
    day.className = "event-date__day";
    day.textContent = pad(occ.day);
    var month = document.createElement("span");
    month.className = "event-date__month";
    month.textContent = MONTH_NAMES[occ.month - 1];
    numrow.appendChild(day);
    numrow.appendChild(month);
    var weekday = document.createElement("span");
    weekday.className = "event-date__weekday";
    weekday.textContent = WEEKDAY_NAMES[occ.weekday];
    date.appendChild(numrow);
    date.appendChild(weekday);

    var body = document.createElement("div");
    body.className = "event-card__body";
    var h3 = document.createElement("h3");
    h3.className = "event-card__title";
    h3.textContent = occ.title;
    body.appendChild(h3);
    if (occ.displayTime) {
      var time = document.createElement("p");
      time.className = "event-card__time";
      time.textContent = occ.displayTime;
      body.appendChild(time);
    }
    if (occ.description) {
      var desc = document.createElement("p");
      desc.className = "event-card__desc";
      desc.textContent = occ.description;
      body.appendChild(desc);
    }
    if (occ.location) {
      var loc = document.createElement("p");
      loc.className = "event-card__location";
      if (occ.mapUrl) {
        var map = document.createElement("a");
        map.href = occ.mapUrl;
        map.target = "_blank";
        map.rel = "noopener noreferrer";
        map.textContent = occ.location;
        loc.appendChild(map);
      } else {
        loc.textContent = occ.location;
      }
      body.appendChild(loc);
    }
    body.appendChild(buildShareList(occ.title, occ.shareUrl));

    article.appendChild(date);
    article.appendChild(body);
    if (occ.url) {
      var action = document.createElement("div");
      action.className = "event-card__action";
      var link = document.createElement("a");
      link.className = "btn-detail";
      var detail = occ.url;
      if (detail.indexOf("http") !== 0 && detail.charAt(0) === "/") {
        detail = BASE_PATH + detail;
      }
      link.href = detail;
      link.textContent = "View Detail";
      action.appendChild(link);
      article.appendChild(action);
    }
    return article;
  }


  var HIDDEN_CLASS = "is-load-more-hidden";
  var DEFAULT_INITIAL_COUNT = 11;

  function initialCount(container) {
    var n = parseInt(container.getAttribute("data-initial-count"), 10);
    return n > 0 ? n : DEFAULT_INITIAL_COUNT;
  }

  function updateMonthVisibility(container) {
    var blocks = container.querySelectorAll(".month-block");
    for (var i = 0; i < blocks.length; i++) {
      var visible = blocks[i].querySelector(".event-card:not(." + HIDDEN_CLASS + ")");
      if (visible) {
        blocks[i].classList.remove(HIDDEN_CLASS);
      } else {
        blocks[i].classList.add(HIDDEN_CLASS);
      }
    }
  }

  function removeLoadMoreWrap(container) {
    var sib = container.nextElementSibling;
    if (sib && sib.classList && sib.classList.contains("load-more-wrap")) {
      sib.parentNode.removeChild(sib);
    }
  }

  function setupLoadMore(container) {
    if (!container) return;
    removeLoadMoreWrap(container);

    var cards = container.querySelectorAll(".event-card");
    var blocks = container.querySelectorAll(".month-block");
    var i;
    for (i = 0; i < cards.length; i++) cards[i].classList.remove(HIDDEN_CLASS);
    for (i = 0; i < blocks.length; i++) blocks[i].classList.remove(HIDDEN_CLASS);

    var limit = initialCount(container);
    if (cards.length <= limit) return;

    for (i = limit; i < cards.length; i++) {
      cards[i].classList.add(HIDDEN_CLASS);
    }
    updateMonthVisibility(container);

    var wrap = document.createElement("div");
    wrap.className = "load-more-wrap";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-load-more";
    btn.setAttribute("aria-controls", container.id || "event-archive");
    btn.setAttribute("aria-expanded", "false");
    btn.textContent = "Load More";
    btn.addEventListener("click", function () {
      var hidden = container.querySelectorAll(".event-card." + HIDDEN_CLASS);
      var first = hidden.length ? hidden[0] : null;
      for (var j = 0; j < hidden.length; j++) hidden[j].classList.remove(HIDDEN_CLASS);
      updateMonthVisibility(container);
      btn.setAttribute("aria-expanded", "true");
      removeLoadMoreWrap(container);
      if (first) {
        first.setAttribute("tabindex", "-1");
        first.focus();
      }
    });
    wrap.appendChild(btn);
    if (container.parentNode) {
      container.parentNode.insertBefore(wrap, container.nextSibling);
    }
  }

  function renderArchive(container, occurrences) {
    while (container.firstChild) container.removeChild(container.firstChild);
    var currentKey = "";
    var list = null;
    for (var i = 0; i < occurrences.length; i++) {
      var occ = occurrences[i];
      var key = occ.year + "-" + occ.month;
      if (key !== currentKey) {
        currentKey = key;
        var block = document.createElement("div");
        block.className = "month-block";
        var divider = document.createElement("div");
        divider.className = "month-divider";
        var h2 = document.createElement("h2");
        h2.textContent = MONTH_TITLES[occ.month - 1] + " " + occ.year;
        divider.appendChild(h2);
        list = document.createElement("div");
        list.className = "event-list";
        block.appendChild(divider);
        block.appendChild(list);
        container.appendChild(block);
      }
      list.appendChild(buildCard(occ));
    }
  }

  function isoFromOcc(occ, data) {
    /* Build an ISO-like timestamp with offset for data-datetime. */
    var tz = (data && data.timezone) || DEFAULT_TZ;
    var parts = wallParts(occ.start, tz);
    var wanted = fromZoned(parts.year, parts.month, parts.day, parts.hour, parts.minute, tz);
    var offsetMin = -wanted.getTimezoneOffset(); /* this is the *local machine* offset — not used. */
    /* Compute the TZ offset from the difference between UTC and wall. */
    var utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
    var offsetMs = utcGuess - wanted.getTime();
    var offsetMinutes = Math.round(offsetMs / 60000);
    var sign = offsetMinutes >= 0 ? "+" : "-";
    var abs = Math.abs(offsetMinutes);
    var off = sign + pad(Math.floor(abs / 60)) + ":" + pad(abs % 60);
    return parts.year + "-" + pad(parts.month) + "-" + pad(parts.day) + "T" + pad(parts.hour) + ":" + pad(parts.minute) + ":00" + off;
  }

  function applyCountdown(data, now) {
    var root = document.querySelector("[data-countdown]");
    if (!root) return;
    var next = nextOccurrence(data, "sunday-service", now);
    if (!next) return;
    root.setAttribute("data-datetime", isoFromOcc(next, data));
  }

  function init(data, now) {
    var archive = document.getElementById("event-archive");
    if (archive) {
      renderArchive(archive, expandData(data, now));
      setupLoadMore(archive);
    }
    applyCountdown(data, now);
  }

  function loadAndInit() {
    var tzHint = DEFAULT_TZ;
    var asOf = readAsOfFromPage();
    var now = asOfDate(tzHint, asOf);
    fetch(DATA_URL, { credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error("Could not load events.json");
        return res.json();
      })
      .then(function (data) {
        var tz = data.timezone || DEFAULT_TZ;
        now = asOfDate(tz, asOf);
        init(data, now);
      })
      .catch(function () {
        /* Leave the server-rendered list (and stamped countdown) in place, still paginate it. */
        var archive = document.getElementById("event-archive");
        if (archive) setupLoadMore(archive);
      });
  }

  window.HungryGenEvents = {
    expandData: expandData,
    nextOccurrence: nextOccurrence,
    renderArchive: renderArchive,
    asOfDate: asOfDate,
    init: init,
    formatDisplayTime: formatDisplayTime,
    calendarEndHM: calendarEndHM,
    googleCalendarUrl: googleCalendarUrl,
    icsEventBlock: icsEventBlock
  };

  var isBrowser = typeof document !== "undefined" && typeof document.getElementById === "function";
  if (isBrowser) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", loadAndInit);
    } else {
      loadAndInit();
    }
  }
})();
