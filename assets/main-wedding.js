(function () {
  const mobileQuery = window.matchMedia("(max-width: 767px)");
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const isLowMotion = mobileQuery.matches || reducedMotionQuery.matches;
  const overlay = window.weddingLoader;
  const batchImages = Array.from(document.querySelectorAll("img[data-batch-src]"));
  const BATCH_SIZE = 5;
  let activeBatchPromise = null;
  let hasCompletedInitialBatch = false;

  if (window.AOS) {
    AOS.init({
      once: true,
      duration: isLowMotion ? 0 : 700,
      disable: () => isLowMotion,
    });
  }

  if (window.Fancybox) {
    Fancybox.bind("[data-fancybox]", {
      compact: mobileQuery.matches,
      Thumbs: false,
    });
  }

  document.querySelectorAll("img").forEach((img) => {
    if (img.dataset.batchSrc) {
      return;
    }

    if (img.classList.contains("banner_top")) {
      img.loading = "eager";
      img.decoding = "async";
      img.fetchPriority = "high";
      return;
    }

    if (!img.hasAttribute("loading")) {
      img.loading = "lazy";
    }

    if (!img.hasAttribute("decoding")) {
      img.decoding = "async";
    }

    if (!img.hasAttribute("fetchpriority")) {
      img.setAttribute("fetchpriority", "low");
    }
  });

  document.querySelectorAll("iframe").forEach((frame) => {
    frame.loading = "lazy";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
  });

  const markImageReady = (img) => {
    img.dataset.batchLoaded = "true";
    img.classList.add("is-image-ready");
  };

  const loadBatchImage = (img) => new Promise((resolve) => {
    if (img.dataset.batchLoaded === "true") {
      resolve(img);
      return;
    }

    const finalize = () => {
      markImageReady(img);
      resolve(img);
    };

    const cleanup = () => {
      img.removeEventListener("load", handleLoad);
      img.removeEventListener("error", handleError);
    };

    const handleLoad = async () => {
      cleanup();
      try {
        if (typeof img.decode === "function") {
          await img.decode();
        }
      } catch (error) {
      }
      finalize();
    };

    const handleError = () => {
      cleanup();
      finalize();
    };

    img.addEventListener("load", handleLoad, { once: true });
    img.addEventListener("error", handleError, { once: true });

    img.src = img.dataset.batchSrc;

    if (img.complete && img.naturalWidth > 0) {
      handleLoad();
    }
  });

  const getPendingBatch = () => batchImages.filter((img) => img.dataset.batchLoaded !== "true").slice(0, BATCH_SIZE);

  const buildBatchMessage = (label, batch) => {
    if (!batch.length) {
      return label;
    }

    const firstIndex = batchImages.indexOf(batch[0]) + 1;
    const lastIndex = firstIndex + batch.length - 1;
    return `${label} (${firstIndex}-${lastIndex}/${batchImages.length})`;
  };

  const hasPendingImagesNearViewport = () => batchImages.some((img) => {
    if (img.dataset.batchLoaded === "true") {
      return false;
    }

    const rect = img.getBoundingClientRect();
    return rect.top <= window.innerHeight + 240;
  });

  const loadNextBatch = (label, options = {}) => {
    if (activeBatchPromise) {
      return activeBatchPromise;
    }

    const batch = getPendingBatch();
    if (!batch.length) {
      overlay?.hide();
      return Promise.resolve();
    }

    const blocking = typeof options.blocking === "boolean"
      ? options.blocking
      : !hasCompletedInitialBatch;

    overlay?.show(buildBatchMessage(label, batch), { blocking });

    activeBatchPromise = Promise.all(batch.map(loadBatchImage))
      .finally(() => {
        activeBatchPromise = null;
        hasCompletedInitialBatch = true;
        overlay?.hide();

        if (hasPendingImagesNearViewport()) {
          window.setTimeout(() => {
            loadNextBatch("Đang tải 5 ảnh tiếp theo...", { blocking: false });
          }, 120);
        }
      });

    return activeBatchPromise;
  };

  if (batchImages.length) {
    batchImages.forEach((img) => {
      img.loading = "eager";
      img.decoding = "async";
      img.setAttribute("fetchpriority", "low");
    });

    loadNextBatch("Đang tải 5 ảnh đầu tiên...", { blocking: true });

    if ("IntersectionObserver" in window) {
      const batchObserver = new IntersectionObserver((entries) => {
        const shouldLoad = entries.some((entry) =>
          entry.isIntersecting && entry.target.dataset.batchLoaded !== "true");

        if (shouldLoad) {
          loadNextBatch("Đang tải 5 ảnh tiếp theo...", { blocking: false });
        }
      }, {
        rootMargin: "240px 0px",
      });

      batchImages.forEach((img) => batchObserver.observe(img));
    }
  } else {
    overlay?.hide();
  }

  const audio = document.getElementById("audio");
  const audioToggle = document.querySelector(".toggleAudio");

  if (audio && audioToggle) {
    if (mobileQuery.matches) {
      audio.preload = "none";
      audio.removeAttribute("autoplay");
    }

    audioToggle.addEventListener("click", async () => {
      const icon = audioToggle.querySelector("i");
      const isPaused = audio.paused;

      try {
        if (isPaused) {
          await audio.play();
        } else {
          audio.pause();
        }
      } catch (error) {
        return;
      }

      if (!icon) {
        return;
      }

      icon.classList.toggle("ri-volume-up-fill", !audio.paused);
      icon.classList.toggle("ri-volume-mute-fill", audio.paused);
    });
  }
})();
