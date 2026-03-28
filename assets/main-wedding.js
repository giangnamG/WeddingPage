(function () {
  const mobileQuery = window.matchMedia("(max-width: 767px)");
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const isLowMotion = mobileQuery.matches || reducedMotionQuery.matches;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const isConstrainedNetwork = Boolean(connection && (connection.saveData
    || /(^|slow-)2g/.test(connection.effectiveType || "")));
  const overlay = window.weddingLoader;
  const managedImages = Array.from(document.querySelectorAll("img[data-batch-src]"));
  const INITIAL_BATCH_SIZE = mobileQuery.matches ? 4 : 6;
  const PREFETCH_CONCURRENCY = isConstrainedNetwork ? 1 : (mobileQuery.matches ? 1 : 2);
  const PREFETCH_PAUSE_MS = isConstrainedNetwork ? 1200 : (mobileQuery.matches ? 700 : 320);
  const prefetchedUrls = new Set();
  let prefetchInFlight = 0;
  let initialLoadComplete = false;
  let userBusyUntil = performance.now() + 400;
  let prefetchTimer = null;

  if (window.Fancybox) {
    Fancybox.bind("[data-fancybox]", {
      compact: mobileQuery.matches,
      Thumbs: false,
    });
  }

  const revealElements = Array.from(document.querySelectorAll("[data-aos]"));
  if (revealElements.length) {
    if (isLowMotion) {
      revealElements.forEach((element) => {
        element.classList.add("aos-init", "aos-animate");
      });
    } else {
      const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          entry.target.classList.add("aos-animate");
          observer.unobserve(entry.target);
        });
      }, {
        threshold: 0.12,
        rootMargin: "0px 0px -8% 0px",
      });

      revealElements.forEach((element) => {
        element.classList.add("aos-init");
        revealObserver.observe(element);
      });
    }
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
    img.dataset.rendered = "true";
    img.classList.add("is-image-ready");
  };

  const applyImageSource = (img) => new Promise((resolve) => {
    if (img.dataset.rendered === "true") {
      resolve(img);
      return;
    }

    img.dataset.rendering = "true";

    const finalize = () => {
      delete img.dataset.rendering;
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
    img.setAttribute("fetchpriority", img.dataset.priority || "low");

    if (img.complete && img.naturalWidth > 0) {
      handleLoad();
    }
  });

  const renderIfNeeded = (img) => {
    if (!img || img.dataset.rendered === "true" || img.dataset.rendering === "true") {
      return Promise.resolve(img);
    }

    return applyImageSource(img);
  };

  const isNearViewport = (img, margin = 420) => {
    const rect = img.getBoundingClientRect();
    return rect.top <= window.innerHeight + margin && rect.bottom >= -margin;
  };

  const prefetchImage = (img) => new Promise((resolve) => {
    if (!img || img.dataset.prefetched === "true" || img.dataset.rendered === "true") {
      resolve(img);
      return;
    }

    const src = img.dataset.batchSrc;
    if (!src || prefetchedUrls.has(src)) {
      img.dataset.prefetched = "true";
      resolve(img);
      return;
    }

    img.dataset.prefetching = "true";

    const prefetch = new Image();
    prefetch.decoding = "async";
    prefetch.fetchPriority = "low";

    const finalize = async () => {
      try {
        if (typeof prefetch.decode === "function") {
          await prefetch.decode();
        }
      } catch (error) {
      }
      prefetchedUrls.add(src);
      img.dataset.prefetched = "true";
      delete img.dataset.prefetching;
      resolve(img);
    };

    prefetch.onload = finalize;
    prefetch.onerror = finalize;
    prefetch.src = src;
  });

  const scheduleIdleTask = (task) => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(() => task(), { timeout: 1200 });
      return;
    }

    window.setTimeout(task, 240);
  };

  const markUserBusy = () => {
    userBusyUntil = performance.now() + PREFETCH_PAUSE_MS;
  };

  const schedulePrefetchPump = (delay = 0) => {
    if (prefetchTimer !== null) {
      window.clearTimeout(prefetchTimer);
    }

    prefetchTimer = window.setTimeout(() => {
      prefetchTimer = null;
      pumpPrefetchQueue();
    }, delay);
  };

  const pumpPrefetchQueue = () => {
    if (prefetchInFlight >= PREFETCH_CONCURRENCY) {
      return;
    }

    const remainingBusyTime = userBusyUntil - performance.now();
    if (remainingBusyTime > 0) {
      schedulePrefetchPump(remainingBusyTime + 40);
      return;
    }

    const nextImage = managedImages.find((img) =>
      img.dataset.prefetched !== "true"
      && img.dataset.prefetching !== "true"
      && img.dataset.rendered !== "true");

    if (!nextImage) {
      return;
    }

    prefetchInFlight += 1;

    scheduleIdleTask(() => {
      prefetchImage(nextImage)
        .finally(() => {
          prefetchInFlight -= 1;
          if (isNearViewport(nextImage)) {
            renderIfNeeded(nextImage);
          }
          schedulePrefetchPump(mobileQuery.matches ? 180 : 90);
        });
    });
  };

  const initialImages = managedImages.slice(0, INITIAL_BATCH_SIZE);

  const loadInitialImages = () => {
    if (!initialImages.length) {
      overlay?.hide();
      return Promise.resolve();
    }

    overlay?.show(`Đang tải ảnh đầu tiên... (1-${initialImages.length}/${managedImages.length})`, {
      blocking: true,
    });

    return Promise.all(initialImages.map((img) => {
      img.dataset.priority = "high";
      return applyImageSource(img);
    }))
      .finally(() => {
        initialLoadComplete = true;
        overlay?.hide();
        for (let index = 0; index < PREFETCH_CONCURRENCY; index += 1) {
          pumpPrefetchQueue();
        }
      });
  };

  if (managedImages.length) {
    managedImages.forEach((img) => {
      img.loading = "eager";
      img.decoding = "async";
      img.setAttribute("fetchpriority", "low");
    });

    loadInitialImages();

    if ("IntersectionObserver" in window) {
      const visibilityObserver = new IntersectionObserver((entries) => {
        if (!initialLoadComplete) {
          return;
        }

        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          markUserBusy();
          renderIfNeeded(entry.target);
          schedulePrefetchPump(PREFETCH_PAUSE_MS);
        });
      }, {
        rootMargin: "420px 0px",
      });

      managedImages.forEach((img) => visibilityObserver.observe(img));
    }

    ["scroll", "wheel", "touchmove", "pointermove"].forEach((eventName) => {
      window.addEventListener(eventName, markUserBusy, { passive: true });
    });
    window.addEventListener("resize", () => {
      markUserBusy();
      schedulePrefetchPump(PREFETCH_PAUSE_MS);
    }, { passive: true });
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
