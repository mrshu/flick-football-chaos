'use strict';
var Quiz = (function () {

  var panel, qEl, choicesEl, shownAt = 0, answered = false, done = null, current = null;

  function ready() {
    if (!panel) {
      panel = document.getElementById('quiz');
      qEl = document.getElementById('quizQ');
      choicesEl = document.getElementById('quizChoices');
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
    setTimeout(function () {
      hide();
      if (cb) { cb(chosen, correct, elapsed); }
    }, correct ? 420 : 1150);
  }

  function show(question, onAnswer) {
    ready();
    current = question;
    done = onAnswer;
    answered = false;
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
    panel.classList.add('hidden');
    qEl.innerHTML = '';
    choicesEl.innerHTML = '';
    current = null;
    done = null;
  }

  return { show: show, hide: hide };
})();
