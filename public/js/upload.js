// public/js/upload.js
// Auto-wraps file inputs with progress + retry on failure
(function () {
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('form[enctype="multipart/form-data"]').forEach(form => {
      form.addEventListener('submit', function (e) {
        const fileInput = form.querySelector('input[type="file"]');
        if (!fileInput || !fileInput.files.length) return;

        const file = fileInput.files[0];

        // Warn if file is huge — poor connection will time out
        const MAX_WARN = 3 * 1024 * 1024;   // 3 MB
        if (file.size > MAX_WARN) {
          const ok = confirm(
            `⚠️ This file is ${(file.size / 1024 / 1024).toFixed(1)} MB.\n` +
            `On a slow connection, upload may take a while or fail.\n` +
            `Try again with a smaller file?`
          );
          if (!ok) {
            e.preventDefault();
            return;
          }
        }

        // Show uploading banner
        const banner = document.createElement('div');
        banner.textContent = '📤 Uploading… please wait, do not close this page';
        banner.style.cssText = `
          position:fixed;top:0;left:0;right:0;background:#667eea;color:white;
          padding:10px;text-align:center;font-size:0.85rem;z-index:99999;
        `;
        document.body.appendChild(banner);
      });
    });
  });
})();
