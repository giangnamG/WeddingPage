(function () {
  const loader = document.querySelector(".loader");
  const body = document.body;
  const status = loader ? loader.querySelector("[data-loader-status]") : null;

  if (!loader) {
    return;
  }

  const setMessage = (message) => {
    if (status) {
      status.textContent = message || "Đang tải ảnh...";
    }
  };

  const show = (message, options = {}) => {
    const isBlocking = Boolean(options.blocking);
    setMessage(message || loader.dataset.initialMessage);
    loader.classList.toggle("loader-soft", !isBlocking);
    loader.classList.toggle("loader-blocking", isBlocking);
    loader.classList.remove("is-hidden");
    loader.setAttribute("aria-hidden", "false");
    body.classList.toggle("overlay-active", isBlocking);
  };

  const hide = () => {
    loader.classList.add("is-hidden");
    loader.classList.remove("loader-soft", "loader-blocking");
    loader.setAttribute("aria-hidden", "true");
    body.classList.remove("overlay-active");
  };

  window.weddingLoader = {
    hide,
    show,
    update: setMessage,
  };

  show(loader.dataset.initialMessage || "Đang tải ảnh...", { blocking: true });

  window.setTimeout(() => {
    if (body.classList.contains("overlay-active")) {
      hide();
    }
  }, 30000);
})();
