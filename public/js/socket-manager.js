// public/js/socket-manager.js
// Central socket handler with reconnect + auto-refresh
(function () {
  if (typeof io === 'undefined') {
    console.warn('⚠️ socket.io not loaded — socket-manager skipped');
    return;
  }

  var REFRESH_ON_RECONNECT = true;
  var hasConnectedOnce = false;
  var pendingRefresh = null;

  var socket = io({
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    reconnectionAttempts: Infinity,
    timeout: 20000,
    transports: ['websocket', 'polling']
  });

  socket.on('connect', function () {
    console.log('✅ [socket-manager] Connected:', socket.id);

    if (!hasConnectedOnce) {
      // First connection — no refresh needed
      hasConnectedOnce = true;
      return;
    }

    // Reconnection — refresh page data
    if (REFRESH_ON_RECONNECT) {
      console.log('🔄 [socket-manager] Reconnected — refreshing page');
      if (pendingRefresh) clearTimeout(pendingRefresh);
      pendingRefresh = setTimeout(function () {
        if (document.visibilityState === 'visible') {
          window.location.reload();
        }
      }, 800);
    }
  });

  socket.on('disconnect', function (reason) {
    console.log('⚠️ [socket-manager] Disconnected:', reason);
    // Do NOT manually reconnect — socket.io handles it
  });

  socket.on('connect_error', function (err) {
    console.warn('❌ [socket-manager] Connect error:', err.message);
  });

  // When tab becomes visible again, force reconnect if needed
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && !socket.connected) {
      console.log('👁 [socket-manager] Tab visible — reconnecting');
      socket.connect();
    }
  });

  // Expose globally so other scripts can use it
  window.appSocket = socket;
})();
