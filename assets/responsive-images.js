(function () {
  const manifest = window.responsiveImageManifest || {};
  const entries = Object.entries(manifest);
  const mobileQuery = window.matchMedia("(max-width: 767px)");
  const tabletQuery = window.matchMedia("(max-width: 1023px)");
  const largeDesktopQuery = window.matchMedia("(min-width: 1280px)");

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

  const isAlbumFeature = (img) => {
    const item = img.closest(".album-item");
    if (!item || !item.parentElement) {
      return false;
    }

    const items = Array.from(item.parentElement.children).filter((child) => child.classList.contains("album-item"));
    const index = items.indexOf(item);
    return index >= 0 && index % 3 === 1;
  };

  const getTargetWidth = (img, entry) => {
    const role = getRole(img);
    const isMobile = mobileQuery.matches;
    const isTablet = tabletQuery.matches && !isMobile;
    const isLargeDesktop = largeDesktopQuery.matches;
    const isLandscape = entry.orientation === "landscape";
    const isFeatureAlbum = role === "album" && isAlbumFeature(img);

    switch (role) {
      case "hero":
        return 1280;
      case "album":
        if (isMobile) return 480;
        if (isTablet) return isLandscape ? (isFeatureAlbum ? 1280 : 960) : (isFeatureAlbum ? 1200 : 960);
        return isLandscape
          ? (isFeatureAlbum ? (isLargeDesktop ? 1600 : 1280) : (isLargeDesktop ? 1280 : 960))
          : (isFeatureAlbum ? (isLargeDesktop ? 1400 : 1200) : (isLargeDesktop ? 1200 : 960));
      case "timeline":
        if (isMobile) return 480;
        return isLargeDesktop ? 1200 : 960;
      case "card":
        if (isMobile) return 640;
        return isLargeDesktop ? 1200 : 960;
      case "invite":
        return 320;
      default:
        if (isMobile) {
          return isLandscape ? 768 : 480;
        }
        return isLandscape ? (isLargeDesktop ? 1280 : 960) : (isLargeDesktop ? 1200 : 960);
    }
  };

  const getSizes = (img, entry) => {
    const role = getRole(img);
    const isFeatureAlbum = role === "album" && isAlbumFeature(img);

    switch (role) {
      case "hero":
        return "100vw";
      case "album":
        return isFeatureAlbum
          ? "(max-width: 767px) 45vw, (max-width: 1023px) 50vw, 48vw"
          : "(max-width: 767px) 45vw, (max-width: 1023px) 33vw, 25vw";
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
    if (entry.placeholder) {
      img.dataset.placeholderSrc = entry.placeholder;
      img.classList.add("has-image-placeholder");
      img.style.backgroundImage = `url("${entry.placeholder}")`;
      img.style.backgroundSize = "cover";
      img.style.backgroundPosition = "center";
      img.style.backgroundRepeat = "no-repeat";
    }
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
