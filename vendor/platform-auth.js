/* vendor/platform-auth.js */
(function (global) {
  'use strict';

  var FUNCTIONS_BASE = 'https://evrulqmiiswsidgsysiq.supabase.co/functions/v1';

  var SESSION_KEY = 'platform_session';
  var PENDING_SDIFK_KEY = 'platform_pending_sdifk';

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

  function processImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file) return reject(new Error("No file selected."));
      if (file.size > 1024 * 1024) return reject(new Error("File must be 1MB or less."));

      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          var canvas = document.createElement("canvas");
          var MAX_SIZE = 256;
          var minDim = Math.min(img.width, img.height);
          var sx = (img.width - minDim) / 2;
          var sy = (img.height - minDim) / 2;

          canvas.width = MAX_SIZE;
          canvas.height = MAX_SIZE;
          var ctx = canvas.getContext("2d");
          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, MAX_SIZE, MAX_SIZE);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        img.onerror = function () { reject(new Error("Failed to process image.")); };
        img.src = e.target.result;
      };
      reader.onerror = function () { reject(new Error("Failed to read file.")); };
      reader.readAsDataURL(file);
    });
  }

  function signup(username, password) {
    return callFn('auth-signup', { username: username, password: password }).then(
      function (data) {
        setSession({
          token: data.token,
          id: data.user.id,
          username: data.user.username,
          first_time: data.user.first_time,
          created_at: data.user.created_at,
          pfp: data.user.pfp
        });
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
          pfp: data.user.pfp
        });
        return data;
      }
    );
  }

  function logout() {
    clearSession();
    window.location.href = '/join';
  }

  function takePendingSdifk() {
    var val = sessionStorage.getItem(PENDING_SDIFK_KEY);
    sessionStorage.removeItem(PENDING_SDIFK_KEY);
    return val;
  }

  function checkUsernameAvailable(username) {
    return callFn('check-username', { username: username }, { timeoutMs: 8000 });
  }

  function changeUsername(newUsername) {
    return callFn('account-username', { newUsername: newUsername }).then(function (data) {
      var session = getSession();
      if (session) {
        session.username = data.username;
        setSession(session);
      }
      return data;
    });
  }

  var USER_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.6"></circle><path d="M4.5 20c1.2-4.2 4-6.3 7.5-6.3s6.3 2.1 7.5 6.3"></path></svg>';
  var GEAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';

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
        '<a href="/join" class="btn btn-solid" style="color:#ffffff; text-decoration:none;">Join</a>';
      return;
    }
    
    var avatarSrc = session.pfp ? session.pfp : DEFAULT_AVATAR;

    authAreaEl.innerHTML =
      '<div class="user-menu" id="userMenu">' +
      '<button class="avatar-btn" id="avatarBtn" aria-haspopup="true" aria-expanded="false" title="@' + session.username + '">' +
      '<img src="' + avatarSrc + '" alt=""></button>' +
      '<div class="user-dropdown" id="userDropdown">' +
      '<a class="dropdown-item" href="/profile">' + USER_SVG + 'Profile</a>' +
      '<a class="dropdown-item" href="/settings">' + GEAR_SVG + 'Settings</a>' +
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
      '<label class="fk-checkbox-row" for="fkAckCheckbox">' +
      '<input type="checkbox" id="fkAckCheckbox">' +
      '<span>I understand that losing this key means I may permanently lose access to my account.</span>' +
      '</label>' +
      '<div class="fk-error" id="fkError"></div>' +
      '<button class="fk-btn fk-btn-solid fk-btn-full" id="fkContinueBtn" type="button" disabled>I Have Saved My Flowery Key -- Continue</button>' +
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
      '.fk-checkbox-row{display:flex;align-items:flex-start;gap:8px;font-size:12.5px;color:#555;line-height:1.4;margin-bottom:12px;cursor:pointer;}' +
      '.fk-checkbox-row input{margin-top:2px;flex-shrink:0;}' +
      '.fk-error{color:#b3261e;font-size:12.5px;margin-bottom:10px;min-height:16px;}' +
      '.fk-btn{font-family:Inter,sans-serif;font-weight:500;font-size:14px;padding:11px 16px;border-radius:999px;cursor:pointer;border:1px solid transparent;flex:1;}' +
      '.fk-btn-ghost{background:#fff;color:#0a0a0a;border:1px solid #e4e4e0;}' +
      '.fk-btn-solid{background:#0a0a0a;color:#fff;border:1px solid #0a0a0a;}' +
      '.fk-btn-full{width:100%;margin-top:6px;}' +
      '.fk-btn-text{width:100%;background:none;border:none;color:#8c8c88;font-size:12.5px;margin-top:10px;text-decoration:underline;}' +
      '.fk-btn:disabled{opacity:.5;cursor:not-allowed;}';
    document.head.appendChild(style);
  }

  function showPfpOnboarding() {
    return new Promise(function (resolve) {
      var root = document.createElement('div');
      root.id = 'pfpGateRoot';
      
      var style = document.createElement('style');
      style.textContent = '#pfpModalUploadBtn:hover #pfpModalOverlay { opacity: 1 !important; }';
      document.head.appendChild(style);

      root.innerHTML =
        '<div class="fk-backdrop" id="pfpBackdrop">' +
        '<div class="fk-card" style="text-align:center;">' +
        '<h2 class="fk-title">Set a Profile Picture</h2>' +
        '<p class="fk-desc">Personalize your account. (Max 1MB)</p>' +
        '<div style="margin:20px auto; width:120px; height:120px; border-radius:50%; overflow:hidden; border:1px solid #e4e4e0; background:#f6f6f4; position:relative; cursor:pointer;" id="pfpModalUploadBtn">' +
           '<img id="pfpModalImg" src="' + DEFAULT_AVATAR + '" style="width:100%; height:100%; object-fit:cover;">' +
           '<div class="fk-pfp-overlay" id="pfpModalOverlay" style="position:absolute; inset:0; background:rgba(10,10,10,0.55); display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity 0.2s;"><svg style="width:28px;height:28px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg></div>' +
        '</div>' +
        '<input type="file" id="pfpModalInput" accept="image/*" style="display:none;">' +
        '<div class="fk-error" id="pfpModalError"></div>' +
        '<div style="display:flex; flex-direction:column; gap:10px;">' +
        '<button class="fk-btn fk-btn-solid" id="pfpSaveBtn" type="button" disabled>Save Picture</button>' +
        '<button class="fk-btn fk-btn-text" id="pfpSkipBtn" type="button" style="margin-top:0;">Skip for now</button>' +
        '</div>' +
        '</div></div>';
      
      document.body.appendChild(root);

      var uploadBtn = document.getElementById('pfpModalUploadBtn');
      var fileInput = document.getElementById('pfpModalInput');
      var previewImg = document.getElementById('pfpModalImg');
      var errorEl = document.getElementById('pfpModalError');
      var saveBtn = document.getElementById('pfpSaveBtn');
      var skipBtn = document.getElementById('pfpSkipBtn');

      var currentBase64 = null;

      uploadBtn.addEventListener('click', function() { fileInput.click(); });

      fileInput.addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (!file) return;
        errorEl.textContent = '';
        processImage(file).then(function(base64) {
          currentBase64 = base64;
          previewImg.src = base64;
          saveBtn.disabled = false;
        }).catch(function(err) {
          errorEl.textContent = err.message;
          saveBtn.disabled = true;
        });
      });

      function cleanup() {
        document.body.style.overflow = '';
        root.remove();
        resolve();
      }

      skipBtn.addEventListener('click', cleanup);

      saveBtn.addEventListener('click', function() {
        if (!currentBase64) return;
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        callFn('update-pfp', { pfp: currentBase64 })
          .then(function(res) {
            var session = getSession();
            session.pfp = res.pfp;
            setSession(session);
            var headerAvatar = document.querySelector('#avatarBtn img');
            if (headerAvatar) headerAvatar.src = res.pfp;
            cleanup();
          })
          .catch(function(err) {
            errorEl.textContent = err.message || 'Failed to save.';
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Picture';
          });
      });
    });
  }

  function enforceFirstTimeGate() {
    var session = getSession();
    if (!session || !session.first_time) return Promise.resolve();

    injectGateStyles();
    var pendingSdifk = takePendingSdifk();

    return new Promise(function (resolve) {
      var root = document.createElement('div');
      root.id = 'fkGateRoot';
      root.innerHTML = buildGateHtml(pendingSdifk);
      document.body.appendChild(root);

      document.body.style.overflow = 'hidden';

      var confirmInput = document.getElementById('fkConfirmInput');
      var ackCheckbox = document.getElementById('fkAckCheckbox');
      var errorEl = document.getElementById('fkError');
      var continueBtn = document.getElementById('fkContinueBtn');
      var copyBtn = document.getElementById('fkCopyBtn');
      var downloadBtn = document.getElementById('fkDownloadBtn');
      var signOutBtn = document.getElementById('fkSignOutBtn');

      function refreshContinueEnabled() {
        continueBtn.disabled = !(confirmInput.value.trim() && ackCheckbox.checked);
      }
      confirmInput.addEventListener('input', refreshContinueEnabled);
      ackCheckbox.addEventListener('change', refreshContinueEnabled);

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
        if (!ackCheckbox.checked) {
          errorEl.textContent = 'Check the box to confirm you understand.';
          return;
        }
        errorEl.textContent = '';
        continueBtn.disabled = true;
        continueBtn.textContent = 'Checking...';
        callFn('account-sdifk', { action: 'confirm', sdifk: val })
          .then(function () {
            session.first_time = false;
            setSession(session);
            root.remove();
            
            // Post Flowery-Key: Prompt for PFP Setup
            return showPfpOnboarding();
          })
          .then(function() {
            document.body.style.overflow = '';
            resolve();
          })
          .catch(function (err) {
            errorEl.textContent = err.message || 'That key is not correct.';
            refreshContinueEnabled();
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
    checkUsernameAvailable: checkUsernameAvailable,
    changeUsername: changeUsername,
    renderHeader: renderHeader,
    enforceFirstTimeGate: enforceFirstTimeGate,
    processImage: processImage
  };
})(window);
