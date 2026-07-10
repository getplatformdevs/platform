/* vendor/platform-auth.js
 *
 * Replaces the old Supabase-Auth-based system entirely. No more
 * supabaseClient.auth.* anywhere -- this talks straight to the three
 * edge functions (auth-signup, auth-login, account-sdifk) and keeps a
 * simple signed session token in localStorage.
 *
 * Include this AFTER the toast() watchdog script and BEFORE any
 * page-specific script that needs PlatformAuth.
 */
(function (global) {
  'use strict';

  // ---- point this at your own project ----
  var FUNCTIONS_BASE = 'https://evrulqmiiswsidgsysiq.supabase.co/functions/v1';

  var SESSION_KEY = 'platform_session';
  var PENDING_SDIFK_KEY = 'platform_pending_sdifk'; // sessionStorage, one-time

  function getSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  function withTimeout(promise, ms, timeoutMessage) {
    var timer;
    var timeout = new Promise(function (_, reject) {
      timer = setTimeout(function () {
        reject(new Error(timeoutMessage));
      }, ms);
    });
    return Promise.race([promise, timeout]).finally(function () {
      clearTimeout(timer);
    });
  }

  /** Calls one of the three edge functions. Throws Error(message) on failure. */
  function callFn(name, body, opts) {
    opts = opts || {};
    var session = getSession();
    var headers = { 'Content-Type': 'application/json' };
    if (session && session.token) {
      headers['Authorization'] = 'Bearer ' + session.token;
    }
    return withTimeout(
      fetch(FUNCTIONS_BASE + '/' + name, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body || {}),
      }).then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) {
            throw new Error(data.error || 'Something went wrong.');
          }
          return data;
        });
      }),
      opts.timeoutMs || 15000,
      opts.timeoutMessage || 'Timed out talking to the server.'
    );
  }

  // ---------- signup / login / logout ----------

  function signup(username, password) {
    return callFn('auth-signup', { username: username, password: password }).then(
      function (data) {
        setSession({
          token: data.token,
          id: data.user.id,
          username: data.user.username,
          first_time: data.user.first_time,
          created_at: data.user.created_at,
        });
        // Stash the ONE-TIME raw SDIFK for the gate to display. Read once,
        // deleted immediately by whoever reads it.
        sessionStorage.setItem(PENDING_SDIFK_KEY, data.sdifk);
        return data;
      }
    );
  }

  function login(identifier, password) {
    return callFn('auth-login', { identifier: identifier, password: password }).then(
      function (data) {
        setSession({
          token: data.token,
          id: data.user.id,
          username: data.user.username,
          first_time: data.user.first_time,
          created_at: data.user.created_at,
        });
        return data;
      }
    );
  }

  function logout() {
    clearSession();
    window.location.href = 'https://getplatform.pages.dev/join';
  }

  function takePendingSdifk() {
    var val = sessionStorage.getItem(PENDING_SDIFK_KEY);
    sessionStorage.removeItem(PENDING_SDIFK_KEY);
    return val;
  }

  // ---------- shared header (Join button OR avatar+menu+Sign Out) ----------

  var USER_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.6"></circle><path d="M4.5 20c1.2-4.2 4-6.3 7.5-6.3s6.3 2.1 7.5 6.3"></path></svg>';
  var GEAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';

  var DEFAULT_AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<rect width="100" height="100" fill="#f6f6f4"/>' +
    '<circle cx="50" cy="38" r="18" fill="#b9b9b4"/>' +
    '<path d="M50 60c-22 0-36 12-36 28v6h72v-6c0-16-14-28-36-28z" fill="#b9b9b4"/>' +
    '</svg>'
  );

  function renderHeader(authAreaEl) {
    var session = getSession();
    if (!session) {
      authAreaEl.innerHTML =
        '<a href="https://getplatform.pages.dev/join" class="btn btn-solid" style="color:#ffffff; text-decoration:none;">Join</a>';
      return;
    }
    authAreaEl.innerHTML =
      '<div class="user-menu" id="userMenu">' +
      '<button class="avatar-btn" id="avatarBtn" aria-haspopup="true" aria-expanded="false" title="@' + session.username + '">' +
      '<img src="' + DEFAULT_AVATAR + '" alt=""></button>' +
      '<div class="user-dropdown" id="userDropdown">' +
      '<a class="dropdown-item" href="https://getplatform.pages.dev/profile">' + USER_SVG + 'Profile</a>' +
      '<a class="dropdown-item" href="https://getplatform.pages.dev/settings">' + GEAR_SVG + 'Settings</a>' +
      '</div>' +
      '<button class="btn btn-ghost" id="signOutBtn">Sign Out</button>' +
      '</div>';

    document.getElementById('avatarBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      var dropdown = document.getElementById('userDropdown');
      var isOpen = dropdown.classList.toggle('open');
      e.currentTarget.setAttribute('aria-expanded', String(isOpen));
    });
    document.getElementById('signOutBtn').addEventListener('click', function (e) {
      e.currentTarget.disabled = true;
      logout();
    });

    document.addEventListener('click', function (e) {
      var menu = document.getElementById('userMenu');
      var dropdown = document.getElementById('userDropdown');
      if (menu && dropdown && !menu.contains(e.target)) {
        dropdown.classList.remove('open');
        var btn = document.getElementById('avatarBtn');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // ---------- the mandatory Flowery Key gate ----------
  //
  // Runs on every page once a session exists. If first_time is true, it
  // throws up a full-screen, non-dismissable overlay. There are two
  // variants:
  //
  //   A) Fresh signup: we still have the raw SDIFK sitting in
  //      sessionStorage (set once, by signup()). Show it, let them
  //      copy/download it, then require them to paste it back in to
  //      prove they actually grabbed it.
  //
  //   B) Returning first_time=true user who never confirmed: we do NOT
  //      have the raw key anymore -- nobody does, it was never stored.
  //      All we can do is ask them to paste the key they (hopefully)
  //      saved, verify it against the hash, and unlock the account. If
  //      they don't have it, there is genuinely no way back in except
  //      starting over with a new account.

  function buildGateHtml(revealSdifk) {
    var revealBlock = revealSdifk
      ? '<div class="fk-reveal-label">Your Flowery Key (shown once, right now):</div>' +
        '<textarea class="fk-key-box" id="fkKeyBox" readonly rows="3">' + revealSdifk + '</textarea>' +
        '<div class="fk-btn-row">' +
        '<button class="fk-btn fk-btn-ghost" id="fkCopyBtn" type="button">Copy Key</button>' +
        '<button class="fk-btn fk-btn-ghost" id="fkDownloadBtn" type="button">Download Key</button>' +
        '</div>'
      : '<div class="fk-warning-box">We cannot show your Flowery Key again. It was never stored anywhere, ' +
        'by design -- only you have it. If you saved it, paste it below. If you did not save it, this ' +
        'account cannot be recovered.</div>';

    return (
      '<div class="fk-backdrop" id="fkBackdrop">' +
      '<div class="fk-card">' +
      '<h2 class="fk-title">Save Your Flowery Key</h2>' +
      '<p class="fk-red">Your Flowery Key is now the most important thing in your life.</p>' +
      '<p class="fk-desc">This key (the "Super Duper Important Flowery Key") is the only way to recover your ' +
      'password and the only backup way into your account. We keep only a one-way hash of it -- we ' +
      'cannot ever show it to you again after this screen.</p>' +
      revealBlock +
      '<div class="fk-confirm-label">' + (revealSdifk ? 'Paste it here to confirm you saved it:' : 'Paste your Flowery Key here:') + '</div>' +
      '<input class="fk-input" id="fkConfirmInput" type="text" autocomplete="off" spellcheck="false" placeholder="SDIFK-...">' +
      '<div class="fk-error" id="fkError"></div>' +
      '<button class="fk-btn fk-btn-solid fk-btn-full" id="fkContinueBtn" type="button">I Have Saved My Flowery Key -- Continue</button>' +
      '<button class="fk-btn fk-btn-text" id="fkSignOutBtn" type="button">Sign out instead</button>' +
      '</div></div>'
    );
  }

  function injectGateStyles() {
    if (document.getElementById('fk-gate-styles')) return;
    var style = document.createElement('style');
    style.id = 'fk-gate-styles';
    style.textContent =
      '.fk-backdrop{position:fixed;inset:0;background:rgba(10,10,10,0.72);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;}' +
      '.fk-card{background:#fff;border-radius:16px;max-width:480px;width:100%;padding:32px 28px;box-shadow:0 20px 60px rgba(0,0,0,0.3);font-family:Inter,sans-serif;max-height:90vh;overflow-y:auto;}' +
      '.fk-title{font-family:"Space Grotesk",sans-serif;font-weight:700;font-size:22px;margin-bottom:10px;}' +
      '.fk-red{color:#c81e1e;font-weight:700;font-size:15px;margin-bottom:16px;}' +
      '.fk-desc{font-size:13.5px;color:#555;line-height:1.5;margin-bottom:18px;}' +
      '.fk-reveal-label,.fk-confirm-label{font-family:"IBM Plex Mono",monospace;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#8c8c88;margin-bottom:6px;margin-top:14px;}' +
      '.fk-key-box{width:100%;font-family:"IBM Plex Mono",monospace;font-size:13px;padding:12px;border:1px solid #e4e4e0;border-radius:10px;background:#f6f6f4;resize:none;word-break:break-all;}' +
      '.fk-warning-box{background:#fdecea;border:1px solid #f3c6c2;color:#8a2318;border-radius:10px;padding:12px 14px;font-size:13px;line-height:1.5;margin-bottom:6px;}' +
      '.fk-btn-row{display:flex;gap:8px;margin-top:8px;}' +
      '.fk-input{width:100%;font-family:"IBM Plex Mono",monospace;font-size:13px;padding:12px 14px;border:1px solid #e4e4e0;border-radius:10px;margin-bottom:8px;box-sizing:border-box;}' +
      '.fk-error{color:#b3261e;font-size:12.5px;margin-bottom:10px;min-height:16px;}' +
      '.fk-btn{font-family:Inter,sans-serif;font-weight:500;font-size:14px;padding:11px 16px;border-radius:999px;cursor:pointer;border:1px solid transparent;flex:1;}' +
      '.fk-btn-ghost{background:#fff;color:#0a0a0a;border:1px solid #e4e4e0;}' +
      '.fk-btn-solid{background:#0a0a0a;color:#fff;border:1px solid #0a0a0a;}' +
      '.fk-btn-full{width:100%;margin-top:6px;}' +
      '.fk-btn-text{width:100%;background:none;border:none;color:#8c8c88;font-size:12.5px;margin-top:10px;text-decoration:underline;}' +
      '.fk-btn:disabled{opacity:.5;cursor:not-allowed;}';
    document.head.appendChild(style);
  }

  /**
   * Call this on every page, right after you know whether there's a
   * session. Returns a Promise that resolves once the gate is cleared
   * (or immediately, if there was nothing to gate).
   */
  function enforceFirstTimeGate() {
    var session = getSession();
    if (!session || !session.first_time) return Promise.resolve();

    injectGateStyles();
    var pendingSdifk = takePendingSdifk(); // null unless we just signed up

    return new Promise(function (resolve) {
      var root = document.createElement('div');
      root.id = 'fkGateRoot';
      root.innerHTML = buildGateHtml(pendingSdifk);
      document.body.appendChild(root);

      // Block scrolling/interaction with the rest of the page underneath.
      document.body.style.overflow = 'hidden';

      var confirmInput = document.getElementById('fkConfirmInput');
      var errorEl = document.getElementById('fkError');
      var continueBtn = document.getElementById('fkContinueBtn');
      var copyBtn = document.getElementById('fkCopyBtn');
      var downloadBtn = document.getElementById('fkDownloadBtn');
      var signOutBtn = document.getElementById('fkSignOutBtn');

      if (copyBtn) {
        copyBtn.addEventListener('click', function () {
          navigator.clipboard.writeText(pendingSdifk).then(function () {
            copyBtn.textContent = 'Copied!';
            setTimeout(function () { copyBtn.textContent = 'Copy Key'; }, 1500);
          });
        });
      }
      if (downloadBtn) {
        downloadBtn.addEventListener('click', function () {
          var blob = new Blob(
            ['Your Flowery Key for Platform (@' + session.username + '):\n\n' + pendingSdifk +
             '\n\nThis is the ONLY copy. Platform does not store it and cannot show it to you again.\n'],
            { type: 'text/plain' }
          );
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = 'flowery-key-' + session.username + '.txt';
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        });
      }

      signOutBtn.addEventListener('click', function () {
        logout();
      });

      continueBtn.addEventListener('click', function () {
        var val = confirmInput.value.trim();
        if (!val) {
          errorEl.textContent = 'Paste your Flowery Key to continue.';
          return;
        }
        errorEl.textContent = '';
        continueBtn.disabled = true;
        continueBtn.textContent = 'Checking...';
        callFn('account-sdifk', { action: 'confirm', sdifk: val })
          .then(function () {
            session.first_time = false;
            setSession(session);
            document.body.style.overflow = '';
            root.remove();
            resolve();
          })
          .catch(function (err) {
            errorEl.textContent = err.message || 'That key is not correct.';
            continueBtn.disabled = false;
            continueBtn.textContent = 'I Have Saved My Flowery Key -- Continue';
          });
      });

      confirmInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); continueBtn.click(); }
      });
    });
  }

  global.PlatformAuth = {
    getSession: getSession,
    setSession: setSession,
    clearSession: clearSession,
    callFn: callFn,
    signup: signup,
    login: login,
    logout: logout,
    renderHeader: renderHeader,
    enforceFirstTimeGate: enforceFirstTimeGate,
  };
})(window);
