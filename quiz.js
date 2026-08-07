'use strict';
var Quiz = (function () {

  var panel, leadEl, prizeGlyphEl, prizePreviewEl, qEl, choicesEl, skipBtn;
  var shownAt = 0, answered = false, done = null, skipDone = null, current = null, timer = 0;

  // The one place that knows what each chaos modifier looks like: its glyph
  // and a wordless before/after preview built from CSS shapes. game.js only
  // ever hands us the modifier id — it has its own MODIFIERS map for the
  // (worded) in-game banner text, but the prize-card glyph/preview mapping
  // lives here and nowhere else. `save` is not a chaos modifier at all — it
  // is the goalkeeper-save question, reusing this same card with a glove
  // glyph and no before/after preview (kind left unset).
  var PRIZES = {
    giant:    { glyph: '\u{1F388}', kind: 'dots', from: 'Xs', to: 'Lg', color: '#ffffff' },
    tiny:     { glyph: '\u{1F41C}', kind: 'dots', from: 'Lg', to: 'Xs', color: '#7db4ff' },
    super:    { glyph: '\u{1F4A5}', kind: 'bars', from: 'Sm', to: 'Lg', color: '#ffffff' },
    slippery: { glyph: '\u{1F9CA}', kind: 'trail', color: '#7dd3fc' },
    save:     { glyph: '\u{1F9E4}' },
  };

  function shape(cls, extraCls, color) {
    var e = document.createElement('span');
    e.className = extraCls ? cls + ' ' + extraCls : cls;
    if (color) { e.style.background = color; }
    return e;
  }

  function renderPreview(prize) {
    prizePreviewEl.innerHTML = '';
    var i;
    if (prize.kind === 'dots') {
      prizePreviewEl.appendChild(shape('pvDot', 'sz' + prize.from, prize.color));
      prizePreviewEl.appendChild(shape('pvArrow'));
      prizePreviewEl.appendChild(shape('pvDot', 'sz' + prize.to, prize.color));
    } else if (prize.kind === 'bars') {
      prizePreviewEl.appendChild(shape('pvBar', 'sz' + prize.from, prize.color));
      prizePreviewEl.appendChild(shape('pvArrow'));
      prizePreviewEl.appendChild(shape('pvBar', 'sz' + prize.to, prize.color));
    } else if (prize.kind === 'trail') {
      for (i = 3; i >= 1; i--) {
        prizePreviewEl.appendChild(shape('pvStreak', 'sz' + i, prize.color));
      }
      prizePreviewEl.appendChild(shape('pvDot', 'szMd', prize.color));
    }
  }

  function onSkipClick() {
    if (answered) { return; } // an answer was already tapped and is mid-feedback
    answered = true;
    var cb = skipDone;
    hide();
    if (cb) { cb(); }
  }

  function ready() {
    if (!panel) {
      panel = document.getElementById('quiz');
      leadEl = document.getElementById('quizLead');
      prizeGlyphEl = document.getElementById('quizPrizeGlyph');
      prizePreviewEl = document.getElementById('quizPrizePreview');
      qEl = document.getElementById('quizQ');
      choicesEl = document.getElementById('quizChoices');
      skipBtn = document.getElementById('quizSkip');
      skipBtn.addEventListener('click', onSkipClick);
    }
  }

  // One diagram per geometry skill, drawn fresh each time. Labels are
  // numerals and the degree sign only; the unknown is always '?'. Sized in
  // CSS pixels and scaled by devicePixelRatio so lines stay crisp.
  function drawDiag(t) {
    var W = 180, H = 110, dpr = window.devicePixelRatio || 1;
    var cv = document.createElement('canvas');
    cv.width = W * dpr; cv.height = H * dpr;
    var ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.font = '700 14px "Trebuchet MS", Verdana, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    function line(x1, y1, x2, y2) {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }

    if (t.kind === 'angleLine') {
      // The ray splits the straight (180°) line into a known wedge, between
      // the ray and the LEFT half of the baseline, and its complementary
      // unknown wedge, between the ray and the RIGHT half — the ray's own
      // angle from the +x axis is (180 - known), so the gap it leaves to
      // the left baseline is exactly `known` degrees wide. Each label sits
      // on its own wedge's bisector, pushed out along it until the label's
      // measured width clears both bounding lines — a fixed offset works
      // for a mid-sized wedge but crowds the ray when the wedge is as
      // narrow as this band's 25° floor allows.
      var cx = 90, cy = 90, rayLen = 78;
      var rad = (180 - t.known) * Math.PI / 180;
      var rx = cx + rayLen * Math.cos(rad), ry = cy - rayLen * Math.sin(rad);
      line(cx - rayLen, cy, cx + rayLen, cy);
      line(cx, cy, rx, ry);
      ctx.beginPath(); ctx.arc(cx, cy, 20, Math.PI, 0, false); ctx.stroke();
      var wedgeLabel = function (bisector, width, txt) {
        var half = Math.max(width / 2, 0.12);
        var tw = ctx.measureText(txt).width;
        var r = Math.min(76, Math.max(26, (tw / 2 + 5) / Math.sin(half)));
        var x = Math.min(W - 12, Math.max(12, cx + r * Math.cos(bisector)));
        var y = Math.min(H - 9, Math.max(9, cy - r * Math.sin(bisector)));
        ctx.fillText(txt, x, y);
      };
      wedgeLabel((rad + Math.PI) / 2, Math.PI - rad, t.known + '°');
      wedgeLabel(rad / 2, rad, '?');
    } else if (t.kind === 'angleTri') {
      // Base angles can each run up to 100°, producing shapes from tall
      // and narrow (both base angles near 90°) to short and wide (both
      // small). Solve the triangle on a unit base with the law of sines,
      // then scale width and height independently to fill the drawable
      // area. That sacrifices true-to-scale proportions (the pythag
      // diagram below already does this) but guarantees the base labels
      // always have room to sit apart and the apex always stays on-canvas
      // — a uniform scale can't promise either for the tall/narrow case.
      var ar = t.a * Math.PI / 180, br = t.b * Math.PI / 180;
      var cr = Math.PI - ar - br;
      var ux = Math.sin(br) * Math.cos(ar) / Math.sin(cr);
      var uy = Math.sin(br) * Math.sin(ar) / Math.sin(cr); // apex height, unit base = 1
      var minX = Math.min(0, 1, ux), maxX = Math.max(0, 1, ux);
      var spanX = maxX - minX, spanY = uy;
      var padX = 28, padTop = 30, padBottom = 30;
      var drawW = W - padX * 2, drawH = H - padTop - padBottom;
      var scaleX = drawW / spanX, scaleY = drawH / spanY;
      var toCx = function (ux2) { return padX + (ux2 - minX) * scaleX; };
      var toCy = function (uy2) { return (H - padBottom) - uy2 * scaleY; };
      var Ax = toCx(0), Ay = toCy(0), Bx = toCx(1), By = toCy(0), Cx = toCx(ux), Cy = toCy(uy);
      line(Ax, Ay, Bx, By); line(Ax, Ay, Cx, Cy); line(Bx, By, Cx, Cy);
      // Each label sits just past its own vertex, along the direction
      // opposite that vertex's interior bisector — i.e. away from the
      // other two corners — so it always lands outside the triangle no
      // matter how the shape is skewed.
      var outward = function (vx, vy, px, py, qx, qy) {
        var d1x = px - vx, d1y = py - vy, l1 = Math.sqrt(d1x * d1x + d1y * d1y) || 1;
        var d2x = qx - vx, d2y = qy - vy, l2 = Math.sqrt(d2x * d2x + d2y * d2y) || 1;
        var ox = -(d1x / l1 + d2x / l2), oy = -(d1y / l1 + d2y / l2);
        var ol = Math.sqrt(ox * ox + oy * oy) || 1;
        return { x: ox / ol, y: oy / ol };
      };
      var placeAt = function (vx, vy, dir, txt) {
        ctx.fillText(txt, vx + dir.x * 14, vy + dir.y * 14);
      };
      placeAt(Ax, Ay, outward(Ax, Ay, Bx, By, Cx, Cy), t.a + '°');
      placeAt(Bx, By, outward(Bx, By, Ax, Ay, Cx, Cy), t.b + '°');
      placeAt(Cx, Cy, outward(Cx, Cy, Ax, Ay, Bx, By), '?');
    } else if (t.kind === 'pythag') {
      var x0 = 30, y0 = 96, x1 = 150, y1 = 22;
      line(x0, y0, x1, y0); line(x1, y0, x1, y1); line(x0, y0, x1, y1);
      line(x1 - 10, y0, x1 - 10, y0 - 10); line(x1 - 10, y0 - 10, x1, y0 - 10);
      ctx.fillText(String(t.legA), (x0 + x1) / 2, y0 + 9);
      ctx.fillText(String(t.legB), x1 + (x1 > 160 ? -9 : 12), (y0 + y1) / 2);
      ctx.fillText('?', (x0 + x1) / 2 - 12, (y0 + y1) / 2 - 10);
    } else if (t.kind === 'areaComp') {
      // Outer W×H with the top-right w×h corner notched out, drawn to
      // scale. The brief's original path drew the left edge as the short
      // (H-h) segment and the right edge as the full H one, which is a
      // *different* shape (a base rect plus a tab) whose area is
      // W*(H-h)+w*h — equal to the scored W*H-w*h only when W happens to
      // be 2w. Tracing the outline the other way round the notch (full
      // height on the left, the short H-h edge on the right) draws the
      // shape the generator actually means and its area matches for
      // every W,H,w,h the generator can produce, verified by shoelace.
      var sc = Math.min(150 / t.W, 84 / t.H), ox = 14, oy = 12;
      var pw = t.W * sc, ph = t.H * sc, nw = t.w * sc, nh = t.h * sc;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + pw - nw, oy);
      ctx.lineTo(ox + pw - nw, oy + nh);
      ctx.lineTo(ox + pw, oy + nh);
      ctx.lineTo(ox + pw, oy + ph);
      ctx.lineTo(ox, oy + ph);
      ctx.closePath(); ctx.stroke();
      ctx.fillText(String(t.W), ox + pw / 2, oy + ph + 8);
      ctx.fillText(String(t.H), ox - 8, oy + ph / 2);
      ctx.fillText(String(t.w), ox + pw - nw / 2, oy + nh - 8);
      ctx.fillText(String(t.h), ox + pw - nw + 8, oy + nh / 2);
      ctx.fillText('?', ox + pw / 2, oy + nh + (ph - nh) / 2);
    }
    return cv;
  }

  // One display token -> one element. `√` arrives as an ordinary `op` token and
  // renders inline ("√ 49 = box"), which reads correctly; it simply has no
  // overbar. `pow` is the only token needing markup, and both its values come
  // from the generator as integers.
  function renderToken(t) {
    var e = document.createElement('span'), i, b;
    if (t.t === 'num') { e.textContent = t.v; }
    else if (t.t === 'balls') {
      e.className = 'qBalls';
      for (i = 0; i < t.v; i++) {
        b = document.createElement('i');
        b.className = 'qBall';
        e.appendChild(b);
      }
    }
    else if (t.t === 'op') { e.textContent = t.v; }
    else if (t.t === 'eq') { e.textContent = '='; }
    else if (t.t === 'sep') { e.textContent = ','; }
    else if (t.t === 'box') { e.className = 'qBox'; }
    else if (t.t === 'pct') { e.textContent = t.v + '%'; }
    else if (t.t === 'pow') { e.innerHTML = String(t.v) + '<sup>' + String(t.e) + '</sup>'; }
    else if (t.t === 'frac') {
      e.className = 'qFrac';
      var n = document.createElement('span'), d = document.createElement('span');
      n.textContent = t.n;
      d.textContent = t.d;
      e.appendChild(n);
      e.appendChild(d);
    }
    else if (t.t === 'var') { e.className = 'qVar'; e.textContent = t.v; }
    else if (t.t === 'diag') { e.className = 'qDiag'; e.appendChild(drawDiag(t)); }
    else { e.textContent = '?'; }
    return e;
  }

  function markAndFinish(chosen, btn) {
    if (answered) { return; }
    answered = true;
    var correct = chosen === current.answer;
    var elapsed = Date.now() - shownAt;
    btn.className = correct ? 'right' : 'wrong';
    if (!correct) {
      // Show what the right answer was, so a wrong tap teaches rather than scolds.
      var all = choicesEl.childNodes, i;
      for (i = 0; i < all.length; i++) {
        if (all[i].__value === current.answer) { all[i].className = 'right'; }
      }
    }
    var cb = done;
    timer = setTimeout(function () {
      timer = 0;
      hide();
      if (cb) { cb(chosen, correct, elapsed); }
    }, correct ? 420 : 1150);
  }

  function show(question, prizeId, onAnswer, onSkip, lead) {
    ready();
    if (timer) { clearTimeout(timer); timer = 0; }
    current = question;
    done = onAnswer;
    skipDone = onSkip;
    answered = false;
    leadEl.textContent = lead;
    var prize = PRIZES[prizeId];
    prizeGlyphEl.textContent = prize ? prize.glyph : '';
    prizePreviewEl.innerHTML = '';
    if (prize) { renderPreview(prize); }
    qEl.innerHTML = '';
    choicesEl.innerHTML = '';
    var i, t, btn;
    for (i = 0; i < question.render.length; i++) {
      qEl.appendChild(renderToken(question.render[i]));
    }
    for (i = 0; i < question.choices.length; i++) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = question.choices[i];
      btn.__value = question.choices[i];
      (function (b) {
        b.addEventListener('click', function () { markAndFinish(b.__value, b); });
      })(btn);
      choicesEl.appendChild(btn);
    }
    panel.classList.remove('hidden');
    shownAt = Date.now();
  }

  function hide() {
    ready();
    if (timer) { clearTimeout(timer); timer = 0; }
    panel.classList.add('hidden');
    prizeGlyphEl.textContent = '';
    prizePreviewEl.innerHTML = '';
    qEl.innerHTML = '';
    choicesEl.innerHTML = '';
    current = null;
    done = null;
    skipDone = null;
  }

  return { show: show, hide: hide, renderToken: renderToken };
})();
