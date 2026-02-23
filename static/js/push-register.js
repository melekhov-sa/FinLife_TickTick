/**
 * FinLife Push Notification Registration
 *
 * Usage: call `finlifePush.subscribe()` from a button click handler.
 * The VAPID public key is set by the backend via a global variable.
 */
(function() {
  'use strict';

  /* VAPID key is injected by the template as window.__VAPID_PUBLIC_KEY__ */
  function getApplicationServerKey() {
    var key = window.__VAPID_PUBLIC_KEY__;
    if (!key) return null;
    /* URL-safe base64 → Uint8Array */
    var padding = '='.repeat((4 - key.length % 4) % 4);
    var base64 = (key + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(base64);
    var arr = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  function updateUI(state) {
    var btn = document.getElementById('pushToggleBtn');
    var status = document.getElementById('pushStatus');
    if (!btn) return;

    if (state === 'subscribed') {
      btn.textContent = 'Отключить уведомления';
      btn.className = 'danger';
      btn.style.cssText = 'font-size:13px;padding:7px 16px;min-height:unset;';
      if (status) status.textContent = 'Push-уведомления включены';
    } else if (state === 'prompt') {
      btn.textContent = 'Включить push-уведомления';
      btn.className = '';
      btn.style.cssText = 'font-size:13px;padding:7px 16px;min-height:unset;';
      if (status) status.textContent = '';
    } else if (state === 'denied') {
      btn.textContent = 'Уведомления заблокированы';
      btn.disabled = true;
      btn.className = 'secondary';
      btn.style.cssText = 'font-size:13px;padding:7px 16px;min-height:unset;';
      if (status) status.textContent = 'Разрешите в настройках браузера';
    } else {
      btn.textContent = 'Включить push-уведомления';
      btn.className = '';
      btn.style.cssText = 'font-size:13px;padding:7px 16px;min-height:unset;';
      if (status) status.textContent = 'Push не поддерживается';
      btn.disabled = true;
    }
  }

  async function getRegistration() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    /* Ensure SW is registered before waiting for ready (iOS PWA may lose registration) */
    var regs = await navigator.serviceWorker.getRegistrations();
    if (regs.length === 0) {
      await navigator.serviceWorker.register('/service-worker.js');
    }
    return navigator.serviceWorker.ready;
  }

  async function getCurrentSubscription() {
    var reg = await getRegistration();
    if (!reg) return null;
    return reg.pushManager.getSubscription();
  }

  async function subscribe() {
    var reg = await getRegistration();
    if (!reg) { alert('Push не поддерживается'); return; }

    var appKey = getApplicationServerKey();
    if (!appKey) { alert('VAPID ключ не настроен'); return; }

    try {
      var sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appKey
      });
      var json = sub.toJSON();
      var resp = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: {
            p256dh: json.keys.p256dh,
            auth: json.keys.auth
          }
        })
      });
      if (resp.ok) {
        updateUI('subscribed');
      }
    } catch (err) {
      if (Notification.permission === 'denied') {
        updateUI('denied');
      } else {
        console.error('Push subscribe error:', err);
        alert('Не удалось подключить уведомления');
      }
    }
  }

  async function unsubscribe() {
    var sub = await getCurrentSubscription();
    if (!sub) { updateUI('prompt'); return; }

    var json = sub.toJSON();
    await sub.unsubscribe();

    await fetch('/api/push/unsubscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth }
      })
    }).catch(function() {});

    updateUI('prompt');
  }

  async function toggle() {
    var sub = await getCurrentSubscription();
    if (sub) {
      await unsubscribe();
    } else {
      await subscribe();
    }
  }

  async function sendTest() {
    var resp = await fetch('/api/push/test', {
      method: 'POST',
      credentials: 'same-origin'
    });
    var data = await resp.json();
    if (data.sent > 0) {
      alert('Тестовое уведомление отправлено!');
    } else {
      alert('Нет активных подписок. Сначала включите уведомления.');
    }
  }

  /* Init: detect current state */
  async function init() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      updateUI('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      updateUI('denied');
      return;
    }
    try {
      var sub = await Promise.race([
        getCurrentSubscription(),
        new Promise(function(_, reject) {
          setTimeout(function() { reject(new Error('timeout')); }, 5000);
        })
      ]);
      updateUI(sub ? 'subscribed' : 'prompt');
    } catch (e) {
      /* SW ready timed out — show button anyway so user can retry */
      updateUI('prompt');
    }
  }

  /* Public API */
  window.finlifePush = {
    subscribe: subscribe,
    unsubscribe: unsubscribe,
    toggle: toggle,
    sendTest: sendTest,
    init: init
  };

  /* Auto-init when DOM ready */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
