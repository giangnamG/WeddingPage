(function () {
  const mobileQuery = window.matchMedia("(max-width: 767px)");
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const isLowMotion = mobileQuery.matches || reducedMotionQuery.matches;
  const disableImageReveal = reducedMotionQuery.matches;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const isConstrainedNetwork = Boolean(connection && (connection.saveData
    || /(^|slow-)2g/.test(connection.effectiveType || "")));
  const overlay = window.weddingLoader;
  const managedImages = Array.from(document.querySelectorAll("img[data-batch-src], img[loading='lazy'], img[data-persistent-image='true']"))
    .filter((img) => !img.classList.contains("banner_top"));
  const persistentImages = managedImages.filter((img) => img.dataset.persistentImage === "true");
  const INITIAL_BATCH_SIZE = mobileQuery.matches ? 4 : 6;
  const PREFETCH_CONCURRENCY = isConstrainedNetwork ? 1 : (mobileQuery.matches ? 1 : 2);
  const PREFETCH_PAUSE_MS = isConstrainedNetwork ? 1200 : (mobileQuery.matches ? 700 : 320);
  const HYDRATE_CONCURRENCY = 1;
  const PERSISTENT_WARM_CONCURRENCY = mobileQuery.matches ? 2 : 3;
  const VISIBILITY_MARGIN = mobileQuery.matches ? 1200 : 1800;
  const HOT_MARGIN = mobileQuery.matches ? 2200 : 3200;
  const prefetchedUrls = new Set();
  let prefetchInFlight = 0;
  let hydrateInFlight = 0;
  let persistentWarmInFlight = 0;
  let initialLoadComplete = false;
  let userBusyUntil = performance.now() + 400;
  let prefetchTimer = null;
  let hydrateTimer = null;

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

  const imageRevealTargets = Array.from(document.querySelectorAll(
    ".about-card .card-media, .album-item, .invitation-card img, .gift-qr img, .thankyou-body img"
  ));
  if (imageRevealTargets.length) {
    if (disableImageReveal) {
      imageRevealTargets.forEach((target) => {
        target.classList.add("image-reveal", "is-visible");
      });
    } else {
      const imageRevealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      }, {
        threshold: 0.16,
        rootMargin: "0px 0px -6% 0px",
      });

      imageRevealTargets.forEach((target, index) => {
        target.classList.add("image-reveal");
        target.style.setProperty("--image-reveal-delay", `${Math.min(index % 4, 3) * 80}ms`);
        imageRevealObserver.observe(target);
      });
    }
  }

  const timelineSection = document.getElementById("time-line");
  const timelineSequenceItems = Array.from(document.querySelectorAll("#time-line .timeline-item"));
  if (timelineSection && timelineSequenceItems.length) {
    if (reducedMotionQuery.matches) {
      timelineSequenceItems.forEach((item) => {
        item.classList.add("timeline-sequence-item", "is-visible");
      });
    } else {
      timelineSequenceItems.forEach((item, index) => {
        item.classList.add("timeline-sequence-item");
        item.style.setProperty("--timeline-sequence-delay", `${index * (mobileQuery.matches ? 140 : 180)}ms`);
      });

      const timelineObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          timelineSequenceItems.forEach((item) => {
            item.classList.add("is-visible");
          });
          observer.unobserve(entry.target);
        });
      }, {
        threshold: 0.18,
        rootMargin: "0px 0px -10% 0px",
      });

      timelineObserver.observe(timelineSection);
    }
  }

  document.querySelectorAll("img").forEach((img) => {
    if (managedImages.includes(img)) {
      return;
    }

    if (img.classList.contains("banner_top")) {
      img.loading = "eager";
      img.decoding = "auto";
      img.fetchPriority = "high";
      return;
    }

    if (!img.hasAttribute("loading")) {
      img.loading = "lazy";
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
    img.dataset.prefetched = "true";
    img.loading = "eager";
    img.decoding = "auto";
    img.classList.add("is-image-ready");
  };

  const getManagedSrc = (img) => img.dataset.batchSrc || img.currentSrc || img.getAttribute("src") || "";

  const isDeferredSource = (img) => Boolean(img.dataset.batchSrc);

  const warmDecode = (img) => {
    if (!img || typeof img.decode !== "function") {
      return Promise.resolve();
    }

    return img.decode().catch(() => {});
  };

  const applyImageSource = (img) => new Promise((resolve) => {
    if (img.dataset.rendered === "true") {
      resolve(img);
      return;
    }

    const src = getManagedSrc(img);
    if (!src) {
      markImageReady(img);
      resolve(img);
      return;
    }

    img.dataset.rendering = "true";
    img.loading = "eager";
    img.decoding = "auto";
    img.setAttribute("fetchpriority", img.dataset.priority || "low");

    const finalize = () => {
      delete img.dataset.rendering;
      markImageReady(img);
      resolve(img);
    };

    const cleanup = () => {
      img.removeEventListener("load", handleLoad);
      img.removeEventListener("error", handleError);
    };

    const handleLoad = () => {
      cleanup();
      warmDecode(img).finally(finalize);
    };

    const handleError = () => {
      cleanup();
      finalize();
    };

    img.addEventListener("load", handleLoad, { once: true });
    img.addEventListener("error", handleError, { once: true });

    if (isDeferredSource(img) && img.getAttribute("src") !== src) {
      img.src = src;
    }

    if (img.complete && img.naturalWidth > 0) {
      handleLoad();
    }
  });

  const renderIfNeeded = (img) => {
    if (!img || img.dataset.rendered === "true" || img.dataset.rendering === "true") {
      return Promise.resolve(img);
    }

    if (isNearViewport(img, VISIBILITY_MARGIN)) {
      img.dataset.priority = "high";
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

    const src = getManagedSrc(img);
    if (!src || prefetchedUrls.has(src)) {
      img.dataset.prefetched = "true";
      resolve(img);
      return;
    }

    if (!isDeferredSource(img) && img.complete && img.naturalWidth > 0) {
      prefetchedUrls.add(src);
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

  const scheduleHydratePump = (delay = 0) => {
    if (hydrateTimer !== null) {
      window.clearTimeout(hydrateTimer);
    }

    hydrateTimer = window.setTimeout(() => {
      hydrateTimer = null;
      pumpHydrateQueue();
    }, delay);
  };

  const getPersistentWarmCandidate = () => persistentImages.find((img) =>
    img.dataset.rendered !== "true"
    && img.dataset.rendering !== "true");

  const pumpPersistentWarmQueue = () => {
    if (!initialLoadComplete || persistentWarmInFlight >= PERSISTENT_WARM_CONCURRENCY) {
      return;
    }

    const nextImage = getPersistentWarmCandidate();
    if (!nextImage) {
      return;
    }

    persistentWarmInFlight += 1;

    scheduleIdleTask(() => {
      nextImage.dataset.priority = "low";
      applyImageSource(nextImage)
        .finally(() => {
          persistentWarmInFlight -= 1;
          pumpPersistentWarmQueue();
        });
    });
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
          scheduleHydratePump(mobileQuery.matches ? 120 : 80);
          schedulePrefetchPump(mobileQuery.matches ? 180 : 90);
        });
    });
  };

  const getHydrateCandidate = () => {
    const nearbyCandidate = managedImages.find((img) =>
      img.dataset.prefetched === "true"
      && img.dataset.rendered !== "true"
      && img.dataset.rendering !== "true"
      && isNearViewport(img, HOT_MARGIN));

    if (nearbyCandidate) {
      return nearbyCandidate;
    }

    return managedImages.find((img) =>
      img.dataset.prefetched === "true"
      && img.dataset.rendered !== "true"
      && img.dataset.rendering !== "true");
  };

  const pumpHydrateQueue = () => {
    if (!initialLoadComplete || hydrateInFlight >= HYDRATE_CONCURRENCY) {
      return;
    }

    const remainingBusyTime = userBusyUntil - performance.now();
    if (remainingBusyTime > 0) {
      scheduleHydratePump(remainingBusyTime + 60);
      return;
    }

    const nextImage = getHydrateCandidate();
    if (!nextImage) {
      return;
    }

    hydrateInFlight += 1;

    scheduleIdleTask(() => {
      nextImage.dataset.priority = "low";
      applyImageSource(nextImage)
        .finally(() => {
          hydrateInFlight -= 1;
          scheduleHydratePump(mobileQuery.matches ? 260 : 120);
        });
    });
  };

  const initialImages = managedImages
    .filter((img) => isNearViewport(img, mobileQuery.matches ? 720 : 920))
    .slice(0, INITIAL_BATCH_SIZE);

  if (!initialImages.length) {
    managedImages.slice(0, INITIAL_BATCH_SIZE).forEach((img) => {
      initialImages.push(img);
    });
  }

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
        for (let index = 0; index < PERSISTENT_WARM_CONCURRENCY; index += 1) {
          pumpPersistentWarmQueue();
        }
        for (let index = 0; index < PREFETCH_CONCURRENCY; index += 1) {
          pumpPrefetchQueue();
        }
        scheduleHydratePump(PREFETCH_PAUSE_MS);
      });
  };

  if (managedImages.length) {
    managedImages.forEach((img) => {
      img.dataset.priority = img.dataset.priority || "low";
      img.decoding = "auto";
      if (!img.hasAttribute("fetchpriority")) {
        img.setAttribute("fetchpriority", "low");
      }
      if (img.complete && img.naturalWidth > 0) {
        markImageReady(img);
      }
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
          entry.target.loading = "eager";
          entry.target.decoding = "auto";
          entry.target.dataset.priority = "high";
          renderIfNeeded(entry.target);
          schedulePrefetchPump(PREFETCH_PAUSE_MS);
          scheduleHydratePump(mobileQuery.matches ? 90 : 60);
        });
      }, {
        rootMargin: `${VISIBILITY_MARGIN}px 0px`,
      });

      managedImages.forEach((img) => visibilityObserver.observe(img));
    }

    ["scroll", "wheel", "touchmove", "pointermove"].forEach((eventName) => {
      window.addEventListener(eventName, markUserBusy, { passive: true });
    });
    window.addEventListener("resize", () => {
      markUserBusy();
      schedulePrefetchPump(PREFETCH_PAUSE_MS);
      scheduleHydratePump(PREFETCH_PAUSE_MS);
    }, { passive: true });
  } else {
    overlay?.hide();
  }

  const audio = document.getElementById("audio");
  const audioToggle = document.querySelector(".toggleAudio");

  if (audio && audioToggle) {
    let playbackUnlocked = false;

    const updateAudioIcon = () => {
      const icon = audioToggle.querySelector("i");
      if (!icon) {
        return;
      }

      icon.classList.toggle("ri-volume-up-fill", !audio.paused);
      icon.classList.toggle("ri-volume-mute-fill", audio.paused);
    };

    const attemptAutoplay = async () => {
      try {
        await audio.play();
        playbackUnlocked = true;
        updateAudioIcon();
        return true;
      } catch (error) {
        updateAudioIcon();
        return false;
      }
    };

    const unlockOnFirstInteraction = async () => {
      if (playbackUnlocked || !audio.paused) {
        return;
      }

      const started = await attemptAutoplay();
      if (started) {
        detachUnlockListeners();
      }
    };

    const interactionEvents = ["pointerdown", "touchstart", "keydown", "scroll"];
    const detachUnlockListeners = () => {
      interactionEvents.forEach((eventName) => {
        window.removeEventListener(eventName, unlockOnFirstInteraction, true);
      });
    };

    interactionEvents.forEach((eventName) => {
      window.addEventListener(eventName, unlockOnFirstInteraction, {
        passive: true,
        capture: true,
      });
    });

    audio.addEventListener("play", () => {
      playbackUnlocked = true;
      updateAudioIcon();
    });

    audio.addEventListener("pause", updateAudioIcon);

    attemptAutoplay();

    audioToggle.addEventListener("click", async () => {
      const isPaused = audio.paused;

      try {
        if (isPaused) {
          await audio.play();
          playbackUnlocked = true;
          detachUnlockListeners();
        } else {
          audio.pause();
        }
      } catch (error) {
        updateAudioIcon();
        return;
      }

      updateAudioIcon();
    });

    updateAudioIcon();
  }
})();
