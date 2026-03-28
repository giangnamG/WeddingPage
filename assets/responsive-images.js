(function () {
  const manifest = window.responsiveImageManifest || {};
  const entries = Object.entries(manifest);

  if (!entries.length) {
    return;
  }

  const getRole = (img) => {
    if (img.classList.contains("banner_top") || img.classList.contains("section-bg-media") || img.classList.contains("thankyou-bg")) {
      return "hero";
    }

    if (img.closest(".album-item")) {
      return "album";
    }

    if (img.closest(".timeline-media")) {
      return "timeline";
    }

    if (img.closest(".card-media")) {
      return "card";
    }

    if (img.closest(".invitation-card")) {
      return "invite";
    }

    return "default";
  };

  const isPersistentRole = (role) => ["album", "timeline", "card", "invite"].includes(role);

  const getTargetWidth = (img, entry) => {
    const role = getRole(img);

    switch (role) {
      case "hero":
        return 1280;
      case "album":
        return window.matchMedia("(max-width: 767px)").matches ? 480 : 640;
      case "timeline":
        return window.matchMedia("(max-width: 767px)").matches ? 480 : 640;
      case "card":
        return window.matchMedia("(max-width: 767px)").matches ? 640 : 640;
      case "invite":
        return 320;
      default:
        return entry.orientation === "landscape" ? 768 : 480;
    }
  };

  const getSizes = (img, entry) => {
    const role = getRole(img);

    switch (role) {
      case "hero":
        return "100vw";
      case "album":
        return "(max-width: 767px) 45vw, (max-width: 1023px) 33vw, 25vw";
      case "timeline":
        return "(max-width: 767px) 45vw, 40vw";
      case "card":
        return "(max-width: 767px) calc(100vw - 40px), 50vw";
      case "invite":
        return "120px";
      default:
        return entry.orientation === "landscape"
          ? "(max-width: 767px) 70vw, 50vw"
          : "(max-width: 767px) 45vw, 33vw";
    }
  };

  const pickSource = (sources, targetWidth) => {
    const sorted = [...sources].sort((left, right) => left.width - right.width);
    return sorted.find((source) => source.width >= targetWidth) || sorted[sorted.length - 1];
  };

  document.querySelectorAll("img[src]").forEach((img) => {
    const originalSrc = img.getAttribute("src");
    const entry = manifest[originalSrc];

    if (!entry || !entry.sources || !entry.sources.length) {
      return;
    }

    const role = getRole(img);
    const target = pickSource(entry.sources, getTargetWidth(img, entry));
    if (!target) {
      return;
    }

    img.dataset.originalSrc = originalSrc;
    img.dataset.responsiveRole = role;
    img.setAttribute("srcset", entry.sources.map((source) => `${source.url} ${source.width}w`).join(", "));
    img.setAttribute("sizes", getSizes(img, entry));

    if (img.getAttribute("src") !== target.url) {
      img.setAttribute("src", target.url);
    }

    if (role === "hero") {
      img.loading = "eager";
      img.decoding = "auto";
      img.setAttribute("fetchpriority", "high");
      return;
    }

    if (isPersistentRole(role)) {
      img.dataset.persistentImage = "true";
      img.loading = "eager";
      img.decoding = "auto";
      img.setAttribute("fetchpriority", "low");
    }
  });
})();
