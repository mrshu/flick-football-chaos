'use strict';
// Evidence from one real human flick. The physics caller reports actual
// impulses; this module never simulates a shot or guesses from a final pose.
var ShotFeedback = (function () {
  var IMPACT = 40, GOALWARD_SPEED = 60, MOVE = 8, UPFIELD = 26;
  var KINDS = ['ball', 'defender', 'keeper', 'post', 'wall'];

  function finite(value) { return typeof value === 'number' && isFinite(value); }
  function point(value) { return value && finite(value.x) && finite(value.y); }
  function velocity(value) {
    return value && finite(value.vx) && finite(value.vy)
      ? { vx: value.vx, vy: value.vy } : null;
  }
  function create() {
    return { ballTouched: false, beforeBallContact: null, contacts: [] };
  }

  // kind:'ball' marks a strike that imparted momentum to the ball, including
  // an indirect strike through another player. Other kinds describe either
  // the selected shooter's obstruction (actor:'shooter') or a later impact
  // involving the ball (actor:'ball'). Defender/keeper mean opposition only.
  //
  // speed is positive closing-normal speed at an actual impulse, never raw
  // body speed or stationary overlap. beforeBall/afterBall are the ball's
  // velocity immediately around that impulse. Optional onTarget:true says
  // the INCOMING heading crossed the attacking goal mouth. Without it no
  // contact is promoted into a blocked shot. Human attacks toward smaller y.
  function contact(ledger, event) {
    if (!ledger || !Array.isArray(ledger.contacts) || !event ||
        KINDS.indexOf(event.kind) === -1 || !finite(event.speed) || event.speed <= 0) return ledger;
    if (event.kind === 'ball') {
      // A meaningful re-strike starts a new attempt. An incidental brush
      // must not erase the earlier keeper/post evidence from that attempt.
      if (!ledger.ballTouched || event.speed >= IMPACT) ledger.contacts = [];
      ledger.ballTouched = true;
      return ledger;
    }
    if (event.actor !== 'shooter' && event.actor !== 'ball') return ledger;
    if (event.speed < IMPACT) return ledger;
    var evidence = {
      kind: event.kind, before: velocity(event.beforeBall), after: velocity(event.afterBall),
      onTarget: event.onTarget === true
    };
    if (!ledger.ballTouched && event.actor === 'shooter') {
      if (!ledger.beforeBallContact) ledger.beforeBallContact = evidence;
    } else if (ledger.ballTouched && event.actor === 'ball') {
      ledger.contacts.push(evidence);
    }
    return ledger;
  }

  function change(event) {
    var before = event.before, after = event.after;
    if (!event.onTarget || !before || !after || before.vy > -GOALWARD_SPEED) return null;
    var incoming = Math.hypot(before.vx, before.vy);
    var outgoing = Math.hypot(after.vx, after.vy);
    if (after.vy >= 0 || outgoing < 13) return 'stopped';
    var cosine = (before.vx * after.vx + before.vy * after.vy) / (incoming * outgoing);
    if (cosine < 0.75) return 'deflected';
    if (-after.vy <= -before.vy * 0.65) return 'slowed';
    return null;
  }
  function message(id, title, tip, icon) {
    return { id: id, title: title, tip: tip || '', icon: icon };
  }
  function obstruction(event) {
    if (event.kind === 'defender') return message('defender-before-ball', 'Player hit a defender',
      'Look for a gap around the red players.', '\u{1F6A7}');
    if (event.kind === 'keeper') return message('keeper-before-ball', 'Player hit the keeper',
      'Aim your player at the ball.', '\u{1F9E4}');
    if (event.kind === 'post') return message('post-before-ball', 'Player hit the post',
      'Aim your player at the ball.', '\u{1F3AF}');
    return message('wall-before-ball', 'Player hit the wall',
      'Aim your player back into the pitch.', '\u21AA');
  }

  function result(ledger, options) {
    options = options || {};
    // Both a goal for the child and an own goal already have a celebration.
    if (options.goal) return null;
    var valid = ledger && Array.isArray(ledger.contacts);
    var start = options.startBall, end = options.endBall;
    var positions = point(start) && point(end);
    var moved = positions && Math.hypot(end.x - start.x, end.y - start.y) > MOVE;
    if (valid && !ledger.ballTouched && positions && !moved) {
      if (ledger.beforeBallContact) return obstruction(ledger.beforeBallContact);
      return message('miss', 'Missed the ball', 'Aim your player at the ball.', '\u2197');
    }
    var events = valid && ledger.ballTouched ? ledger.contacts : [];
    // A qualified change to a goalward shot has priority over a ricochet.
    // Take the first such change in this strike, rather than letting a later
    // incidental collision rewrite what happened. Re-strikes clear it above.
    for (var i = 0; i < events.length; i++) {
      var event = events[i], effect = change(event);
      if (effect && (event.kind === 'keeper' || event.kind === 'defender')) {
        var title = event.kind === 'keeper' ? 'Keeper ' : 'Defender ';
        title += effect === 'stopped' ? 'stopped the shot' : effect + ' the shot';
        return message(event.kind + '-' + effect, title,
          event.kind === 'keeper' ? 'Try the open corner.' : 'Look for a gap around the red players.',
          event.kind === 'keeper' ? '\u{1F9E4}' : '\u{1F6A7}');
      }
    }
    var post = events.find(function (entry) { return entry.kind === 'post'; });
    if (post) return message('post', 'Off the post',
      post.before && post.before.vy <= -GOALWARD_SPEED ? 'Aim a little inside the posts.' : '', '\u{1F3AF}');
    var body = events.find(function (entry) { return entry.kind === 'keeper' || entry.kind === 'defender'; });
    if (body) return message(body.kind + '-contact', body.kind === 'keeper' ? 'Keeper got a touch' :
      'Defender contact', '', body.kind === 'keeper' ? '\u{1F9E4}' : '\u{1F6A7}');
    if (events.some(function (entry) { return entry.kind === 'wall'; })) {
      return message('wall', 'Off the wall', '', '\u21AA');
    }
    if (positions && start.y - end.y > UPFIELD) {
      return message('upfield', 'Ball moved upfield', '', '\u2191');
    }
    return message('play', 'Ball in play', '', '\u26BD');
  }

  return { create: create, contact: contact, result: result };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ShotFeedback;
