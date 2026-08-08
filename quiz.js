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

  var DIAG_FONT = '700 14px "Trebuchet MS", Verdana, sans-serif';
  var LABEL_H = 14; // line box of a one-line label at the font above

  // The unit vector pointing away from a vertex: opposite that vertex's
  // interior bisector, i.e. away from the other two corners. A label placed
  // along it always lands outside the shape, and — because the direction is
  // more than 90° from both edges leaving the vertex — the nearest point of
  // either edge is the vertex itself, so the distance pushed out IS the
  // clearance from every stroke.
  function outward(vx, vy, px, py, qx, qy) {
    var d1x = px - vx, d1y = py - vy, l1 = Math.sqrt(d1x * d1x + d1y * d1y) || 1;
    var d2x = qx - vx, d2y = qy - vy, l2 = Math.sqrt(d2x * d2x + d2y * d2y) || 1;
    var ox = -(d1x / l1 + d2x / l2), oy = -(d1y / l1 + d2y / l2);
    var ol = Math.sqrt(ox * ox + oy * oy) || 1;
    return { x: ox / ol, y: oy / ol };
  }

  // Pure geometry for the triangle diagram, kept out of the drawing code so
  // the test suite can check the picture against its own labels.
  //
  // Base angles can each run up to 100°, so the shapes range from short and
  // wide to nearly three times taller than the base is long. Solve the
  // triangle on a unit base with the law of sines, then scale it UNIFORMLY:
  // an independent x/y scale (what this used to do) draws angles that are not
  // the labelled ones — 60/60/60 and 45/45/90 both came out as the same flat
  // 39/39/102 scalene, which is exactly the sanity check a student is meant
  // to be able to make on this question. Uniform scaling means the canvas
  // cannot be a fixed box, so the size is computed here too: the drawing is
  // laid out around the origin, its bounding box (strokes AND labels) is
  // measured, and everything is shifted into a canvas that just fits.
  // `measure(text)` returns a label's pixel width.
  function triGeom(a, b, measure) {
    var MAX_W = 124, MAX_H = 112, MARGIN = 7, GAP = 11, HALF = 1; // HALF: half the stroke width
    var ar = a * Math.PI / 180, br = b * Math.PI / 180, cr = Math.PI - ar - br;
    // Apex of a triangle whose base runs (0,0)-(1,0), angle `a` at (0,0).
    var ux = Math.sin(br) * Math.cos(ar) / Math.sin(cr);
    var uy = Math.sin(br) * Math.sin(ar) / Math.sin(cr);
    var spanX = Math.max(1, ux) - Math.min(0, ux);
    var s = Math.min(MAX_W / spanX, MAX_H / uy);
    var pts = [{ x: 0, y: 0 }, { x: s, y: 0 }, { x: ux * s, y: -uy * s }];
    var texts = [a + '°', b + '°', '?'];
    var labels = [], i, j, k, dir, tw;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function span(x0, y0, x1, y1) {
      if (x0 < minX) { minX = x0; }
      if (y0 < minY) { minY = y0; }
      if (x1 > maxX) { maxX = x1; }
      if (y1 > maxY) { maxY = y1; }
    }
    for (i = 0; i < 3; i++) {
      j = (i + 1) % 3; k = (i + 2) % 3;
      dir = outward(pts[i].x, pts[i].y, pts[j].x, pts[j].y, pts[k].x, pts[k].y);
      tw = measure(texts[i]);
      // Offset per axis, so a label pushed sideways clears by GAP horizontally
      // and one pushed up or down clears by GAP vertically.
      labels.push({
        text: texts[i], w: tw,
        x: pts[i].x + dir.x * (GAP + tw / 2),
        y: pts[i].y + dir.y * (GAP + LABEL_H / 2)
      });
      span(pts[i].x - HALF, pts[i].y - HALF, pts[i].x + HALF, pts[i].y + HALF);
    }
    for (i = 0; i < labels.length; i++) {
      span(labels[i].x - labels[i].w / 2, labels[i].y - LABEL_H / 2,
           labels[i].x + labels[i].w / 2, labels[i].y + LABEL_H / 2);
    }
    var dx = MARGIN - minX, dy = MARGIN - minY;
    for (i = 0; i < 3; i++) { pts[i].x += dx; pts[i].y += dy; }
    for (i = 0; i < labels.length; i++) { labels[i].x += dx; labels[i].y += dy; }
    return {
      W: Math.ceil(maxX - minX) + MARGIN * 2,
      H: Math.ceil(maxY - minY) + MARGIN * 2,
      pts: pts, labels: labels
    };
  }

  // Pure geometry for the right-angled triangle: the real legs scaled into the
  // drawable box by ONE factor, so the longer leg is drawn longer. Drawing
  // both legs at a fixed size (what this used to do) put the "7" of 7/24/25 on
  // the visually longest side half the time.
  function pythagGeom(legA, legB) {
    var BOX_W = 120, BOX_H = 72, LEFT = 30, BASE_Y = 92;
    var s = Math.min(BOX_W / legA, BOX_H / legB);
    var w = legA * s, h = legB * s;
    var x0 = LEFT + (BOX_W - w) / 2;
    return { x0: x0, y0: BASE_Y, x1: x0 + w, y1: BASE_Y - h, s: s };
  }

  // One diagram per geometry skill, drawn fresh each time. Labels are
  // numerals and the degree sign only; the unknown is always '?'. Sized in
  // CSS pixels and scaled by devicePixelRatio so lines stay crisp. Every
  // canvas carries its own inline CSS size, because angleTri picks a size to
  // suit its triangle and the others keep the standard 180x110 box.
  function drawDiag(t) {
    var W = 180, H = 110, dpr = window.devicePixelRatio || 1, i, tri = null;
    var cv = document.createElement('canvas');
    var ctx = cv.getContext('2d');
    ctx.font = DIAG_FONT;

    if (t.kind === 'angleTri') {
      tri = triGeom(t.a, t.b, function (s) { return ctx.measureText(s).width; });
      W = tri.W; H = tri.H;
    }

    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.font = DIAG_FONT;
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
        // Base radius keeps the label inside its own wedge; pushing
        // further out by the label's own half-width plus a fixed margin
        // gives constant clearance from both bounding rays no matter how
        // steep the ray is. Dividing only by sin(half) (the old formula)
        // shrinks toward zero as the wedge narrows near a vertical ray,
        // which is exactly what let the glyph sit on the stroke.
        var base = Math.min(50, Math.max(20, 7 / Math.sin(half)));
        var r = Math.min(76, base + tw / 2 + 6);
        var x = Math.min(W - 12, Math.max(12, cx + r * Math.cos(bisector)));
        var y = Math.min(H - 9, Math.max(9, cy - r * Math.sin(bisector)));
        ctx.fillText(txt, x, y);
      };
      wedgeLabel((rad + Math.PI) / 2, Math.PI - rad, t.known + '°');
      wedgeLabel(rad / 2, rad, '?');
    } else if (t.kind === 'angleTri') {
      // Vertices and labels were all worked out (and the canvas sized around
      // them) by triGeom above; here they are only stroked and filled.
      line(tri.pts[0].x, tri.pts[0].y, tri.pts[1].x, tri.pts[1].y);
      line(tri.pts[1].x, tri.pts[1].y, tri.pts[2].x, tri.pts[2].y);
      line(tri.pts[2].x, tri.pts[2].y, tri.pts[0].x, tri.pts[0].y);
      for (i = 0; i < tri.labels.length; i++) {
        ctx.fillText(tri.labels[i].text, tri.labels[i].x, tri.labels[i].y);
      }
    } else if (t.kind === 'pythag') {
      var g = pythagGeom(t.legA, t.legB);
      var x0 = g.x0, y0 = g.y0, x1 = g.x1, y1 = g.y1;
      line(x0, y0, x1, y0); line(x1, y0, x1, y1); line(x0, y0, x1, y1);
      // Right-angle marker, shrunk on the thin triangles so it stays inside.
      var m = Math.max(5, Math.min(10, Math.min(x1 - x0, y0 - y1) * 0.3));
      line(x1 - m, y0, x1 - m, y0 - m); line(x1 - m, y0 - m, x1, y0 - m);
      ctx.fillText(String(t.legA), (x0 + x1) / 2, y0 + 9);
      ctx.fillText(String(t.legB), x1 + 12, (y0 + y1) / 2);
      // The '?' sits off the hypotenuse's midpoint, pushed along the outward
      // normal (away from the right-angle corner), so it clears the slope by
      // the same margin whatever the triple's shape.
      var hx = x1 - x0, hy = y1 - y0, hl = Math.sqrt(hx * hx + hy * hy) || 1;
      var nx = hy / hl, ny = -hx / hl; // unit normal, away from the corner at (x1, y0)
      var qw = ctx.measureText('?').width;
      ctx.fillText('?', (x0 + x1) / 2 + nx * (9 + qw / 2),
                        (y0 + y1) / 2 + ny * (9 + LABEL_H / 2));
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
      var ox = 14, oy = 12, margin = 5;
      var sc = Math.min(150 / t.W, 84 / t.H);
      var pw = t.W * sc, ph = t.H * sc, nw = t.w * sc, nh = t.h * sc;
      var qm = ctx.measureText('?');
      var qw2 = qm.width;
      var qh = (typeof qm.actualBoundingBoxAscent === 'number')
        ? qm.actualBoundingBoxAscent + qm.actualBoundingBoxDescent
        : 11;
      // How much room the '?' would have to spare in each of the L's two
      // rectangles; the larger one wins below.
      var leftClear = Math.min((pw - nw) - (qw2 + margin * 2), ph - (qh + margin * 2));
      var botClear = Math.min(nw - (qw2 + margin * 2), (ph - nh) - (qh + margin * 2));
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
      // The '?' goes in whichever of the L-shape's two rectangles — the
      // left column (pw-nw wide, full ph tall) or the bottom strip (nw
      // wide, ph-nh tall) — leaves more clearance around it; the
      // generator can make either one thin (H-h as small as 2 units, or
      // W-w as small as 3), so a fixed choice collides on the thin one.
      if (botClear >= leftClear) {
        ctx.fillText('?', ox + pw - nw / 2, oy + nh + (ph - nh) / 2);
      } else {
        ctx.fillText('?', ox + (pw - nw) / 2, oy + ph / 2);
      }
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

  return {
    show: show, hide: hide, renderToken: renderToken,
    // Exposed for the test suite: pure diagram geometry, no DOM involved.
    _triGeom: triGeom, _pythagGeom: pythagGeom
  };
})();

if (typeof module !== 'undefined') { module.exports = Quiz; }
