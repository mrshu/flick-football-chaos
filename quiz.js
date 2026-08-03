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
