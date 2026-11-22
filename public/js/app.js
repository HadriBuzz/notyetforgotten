/* Both the website and the conversation preview use this application. */
window.initNYF = function initNYF(catalogue, dictionaries, embeddedDetails) {
  const root = document.getElementById('nyf-design');
  const select = (selector) => root.querySelector(selector);
  const artworks = catalogue.artworks;
  if (!Array.isArray(artworks) || artworks.length === 0) throw new Error('Le catalogue doit contenir au moins une œuvre.');
  const byId = new Map(artworks.map((artwork) => [artwork.id, artwork]));
  const events = new Map((catalogue.events || []).map((event) => [event.id, event]));
  const artists = new Map((catalogue.artists || []).map((artist) => [artist.id, artist]));
  if (byId.size !== artworks.length) throw new Error('Les identifiants des œuvres doivent être uniques.');
  if (artists.size !== (catalogue.artists || []).length) throw new Error('Les identifiants des artistes doivent être uniques.');
  if (artworks.some((artwork) => !events.has(artwork.disappearanceEventId))) throw new Error('Chaque œuvre doit être liée à un événement de disparition.');
  if (artworks.some((artwork) => !artists.has(artwork.artistId))) throw new Error('Chaque œuvre doit être liée à un artiste ou une attribution.');
  let featuredId = null;
  let lastFeaturedId = null;
  const state = { screen: 'home', history: [], position: -1, language: 'fr', eventId: null, artistId: null };
  let screenBeforeSupport = 'home';
  const storageKey = 'nyf-visit-v1';
  const dialog = select('[data-lightbox]');
  const detailsDialog = select('[data-details-dialog]');
  let detailsRequest = null;
  const statusLabels = {
    stolen: 'statusStolen',
    destroyed: 'statusDestroyed',
    'probably-destroyed': 'statusProbablyDestroyed',
    lost: 'statusLost',
    'historical-disappearance': 'statusHistoricalDisappearance',
    unknown: 'statusUnknown',
    found: 'statusFound',
  };
  let zoomedId = null;
  let zoomOpener = null;
  let cancelWorkTransition = null;
  let cancelPageTransition = null;
  let dialogAnimation = null;
  let closingImage = false;
  let imageZoom = 1;
  let imagePan = { x: 0, y: 0 };
  let drag = null;
  const motion = { duration: 1100, easing: 'cubic-bezier(.22,.61,.36,1)' };
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    const preference = localStorage.getItem('nyf-language');
    if (dictionaries[preference]) state.language = preference;
    lastFeaturedId = localStorage.getItem('nyf-last-featured-artwork');
  } catch (_) { /* Language switching also works without browser storage. */ }

  function t(key, values = {}) {
    let text = dictionaries[state.language]?.ui[key] || dictionaries.fr.ui[key] || key;
    for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{${name}}`, value);
    return text;
  }

  function snapshot(element, className) {
    const copy = element.cloneNode(true);
    copy.classList.add(className);
    copy.setAttribute('aria-hidden', 'true');
    copy.inert = true;
    for (const node of [copy, ...copy.querySelectorAll('*')]) {
      for (const attribute of [...node.attributes]) {
        if (attribute.name.startsWith('data-') || attribute.name === 'id') node.removeAttribute(attribute.name);
      }
    }
    return copy;
  }

  function validValuation(artwork) {
    const value = artwork.valuation;
    if (!value || !Number.isFinite(value.minimum) || !Number.isFinite(value.maximum)
      || value.minimum < 0 || value.maximum <= value.minimum || !/^[A-Z]{3}$/.test(value.currency)) return null;
    if (value.type !== 'editorial-range' && (!value.source?.url
      || !/^\d{4}(-\d{2}-\d{2})?$/.test(value.source.date))) return null;
    return value;
  }

  function valuationText(artwork) {
    const value = validValuation(artwork);
    if (!value) return t('valuationUnknown');
    const format = new Intl.NumberFormat(state.language === 'en' ? 'en-GB' : 'fr-FR', {
      style: 'currency', currency: value.currency, notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1,
    });
    return `${format.format(value.minimum)} – ${format.format(value.maximum)}`;
  }

  function localize(item, group) {
    const translation = dictionaries[state.language]?.[group]?.[item.id] || {};
    return {
      ...item, ...translation,
      image: item.image ? { ...item.image, ...translation.image } : undefined,
      sources: (item.sources || []).map((source, index) => ({
        ...source, label: translation.sourceLabels?.[index] || source.label,
      })),
    };
  }

  function artworkById(id) {
    const artwork = byId.get(id);
    if (!artwork) return null;
    return { ...localize(artwork, 'artworks'), artist: localize(artists.get(artwork.artistId), 'artists').name };
  }

  function artistKind(artist) {
    return t(artist.kind === 'origin' ? 'origin' : artist.kind === 'after' ? 'attribution' : 'artist');
  }

  function currentArtwork() {
    return artworkById(state.history[state.position]);
  }

  function formatDate(value) {
    if (/^\d{4}$/.test(value)) return value;
    return new Intl.DateTimeFormat(state.language === 'en' ? 'en-GB' : 'fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    }).format(new Date(`${value}T12:00:00Z`));
  }

  function renderDate(element, value) {
    element.dateTime = value;
    element.textContent = formatDate(value);
  }

  function artworkStatus(artwork) {
    if (artwork.statusId === 'destroyed' && artwork.statusCertainty === 'probable') return 'probably-destroyed';
    return Object.hasOwn(statusLabels, artwork.statusId) ? artwork.statusId : 'unknown';
  }

  function renderArtworkStatus(element, artwork) {
    const status = artworkStatus(artwork);
    element.dataset.status = status;
    element.textContent = t(statusLabels[status]);
  }

  function setImage(image, artwork) {
    const changed = image.getAttribute('src') !== artwork.image.src;
    if (changed) image.src = artwork.image.src;
    image.alt = artwork.image.alt;
    image.width = artwork.image.width;
    image.height = artwork.image.height;
    return changed;
  }

  function renderSources(container, sources) {
    container.replaceChildren(...sources.map((source) => {
      const link = document.createElement('a');
      link.className = 'nyf-source';
      link.href = source.url;
      link.textContent = `${source.label} ↗`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      return link;
    }));
  }

  function chooseFeatured() {
    const others = artworks.filter((artwork) => artwork.id !== lastFeaturedId);
    const candidates = others.length > 0 ? others : artworks;
    featuredId = candidates[Math.floor(Math.random() * candidates.length)].id;
    lastFeaturedId = featuredId;
    try { localStorage.setItem('nyf-last-featured-artwork', featuredId); } catch (_) { /* The current page still avoids consecutive repeats without storage. */ }
  }

  function renderFeatured() {
    if (!featuredId) chooseFeatured();
    const featured = artworkById(featuredId);
    setImage(select('[data-featured-image]'), featured);
    const button = select('[data-featured-zoom]');
    button.dataset.artworkId = featured.id;
    button.setAttribute('aria-label', t('enlargeImage', { title: featured.title }));
    select('[data-featured-archive]').textContent = featured.archive;
    select('[data-featured-artist]').textContent = featured.artist;
    renderArtworkStatus(select('[data-featured-status]'), featured);
    select('[data-featured-title]').textContent = featured.title;
    select('[data-featured-caption]').textContent = `${featured.date} · ${featured.medium} · ${t('reproduction')}`;
  }

  function renderArtwork(artwork) {
    select('[data-work-artist]').textContent = `${artwork.artist} · ${artwork.date}`;
    select('[data-work-headline]').textContent = artwork.headline;
    renderArtworkStatus(select('[data-work-status]'), artwork);
    const statusNote = select('[data-work-status-note]');
    statusNote.textContent = artwork.statusNote || '';
    statusNote.hidden = !artwork.statusNote;
    select('[data-work-title]').textContent = artwork.title;
    const artist = localize(artists.get(artwork.artistId), 'artists');
    select('[data-work-creator-label]').textContent = artistKind(artist);
    const artistLink = select('[data-work-artist-link]');
    artistLink.textContent = `${artist.name} ↗`;
    artistLink.dataset.artistId = artist.id;
    artistLink.href = `#artist-${artist.id}`;
    select('[data-work-dimensions]').textContent = artwork.dimensions || t('dimensionsUnknown');
    select('[data-work-valuation]').textContent = valuationText(artwork);
    const valuation = validValuation(artwork);
    const valuationNote = select('[data-work-valuation-note]');
    valuationNote.replaceChildren();
    valuationNote.hidden = !valuation;
    if (valuation?.type === 'editorial-range') {
      valuationNote.textContent = t('valuationIndicative');
    } else if (valuation) {
      const source = valuation.source;
      const link = document.createElement('a');
      link.href = source.url;
      link.textContent = source.label;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      valuationNote.append(t('valuationPublished', { date: formatDate(source.date) }), ' ', link, ' ↗');
    }
    select('[data-work-medium]').textContent = artwork.medium;
    select('[data-work-collection]').textContent = artwork.collection;
    select('[data-work-credit]').textContent = artwork.image.credit;
    select('[data-work-image-source]').href = artwork.image.sourceUrl;
    const event = localize(events.get(artwork.disappearanceEventId), 'events');
    renderDate(select('[data-work-disappearance-date]'), event.date);
    select('[data-work-circumstances]').textContent = event.cause;
    const image = select('[data-work-image]');
    if (setImage(image, artwork)) {
      image.hidden = false;
      select('[data-image-error]').hidden = true;
      select('[data-work-zoom]').disabled = false;
    }
    const zoomButton = select('[data-work-zoom]');
    zoomButton.dataset.artworkId = artwork.id;
    zoomButton.setAttribute('aria-label', t('enlargeImage', { title: artwork.title }));
    select('[data-work-story]').replaceChildren(...artwork.story.map((text) => {
      const paragraph = document.createElement('p');
      paragraph.className = 'nyf-story';
      paragraph.textContent = text;
      return paragraph;
    }));
    select('[data-action="previous"]').disabled = state.position <= 0;
    select('[data-action="random"]').disabled = artworks.length < 2;
  }

  function appendMarkdownText(element, text) {
    let position = 0;
    for (const match of text.matchAll(/\[([^\]\n]+)\]\((https?:\/\/(?:[^()\s]|\([^()\s]*\))+)\)/gi)) {
      const link = document.createElement('a');
      link.textContent = match[1];
      link.href = match[2];
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      element.append(text.slice(position, match.index), link);
      position = match.index + match[0].length;
    }
    element.append(text.slice(position));
  }

  function renderMarkdown(markdown) {
    const fragment = document.createDocumentFragment();
    for (const block of markdown.trim().split(/\n[ \t]*\n/)) {
      const lines = block.split('\n');
      if (lines.every((line) => /^[-*] /.test(line))) {
        const list = document.createElement('ul');
        for (const line of lines) {
          const item = document.createElement('li');
          appendMarkdownText(item, line.slice(2));
          list.append(item);
        }
        fragment.append(list);
      } else {
        const heading = lines.length === 1 && /^#{1,6} /.test(block);
        const element = document.createElement(heading ? 'h3' : 'p');
        appendMarkdownText(element, heading ? block.replace(/^#+ /, '') : lines.join(' '));
        fragment.append(element);
      }
    }
    return fragment;
  }

  async function openDetails(artwork) {
    const language = state.language;
    const content = select('[data-details-content]');
    const feedback = select('[data-details-feedback]');
    select('[data-details-title]').textContent = artwork.title;
    const eventLink = select('[data-details-event]');
    eventLink.dataset.eventId = artwork.disappearanceEventId;
    eventLink.href = `#event-${artwork.disappearanceEventId}`;
    content.replaceChildren();
    feedback.textContent = t('detailsLoading');
    detailsRequest?.abort();
    const request = new AbortController();
    detailsRequest = request;
    detailsDialog.showModal();
    try {
      let markdown = embeddedDetails?.[artwork.id];
      if (markdown === undefined) {
        const response = await fetch(`ressources/oeuvres/${encodeURIComponent(artwork.id)}.md`, { signal: request.signal });
        if (!response.ok || response.headers.get('content-type')?.includes('text/html')) throw new Error('Markdown unavailable');
        markdown = await response.text();
      }
      if (detailsRequest !== request || !detailsDialog.open) return;
      const [fr, en] = markdown.replaceAll('\r\n', '\n').split(/^<!-- en -->[ \t]*$/m, 2);
      const useEnglish = language === 'en' && en?.trim();
      const localizedMarkdown = (useEnglish ? en : fr).trim();
      if (!localizedMarkdown) throw new Error('Markdown is empty');
      content.lang = useEnglish ? 'en' : 'fr';
      content.append(renderMarkdown(localizedMarkdown));
      feedback.textContent = '';
    } catch (_) {
      if (detailsRequest === request && detailsDialog.open) feedback.textContent = t('detailsUnavailable');
    }
  }

  function renderEvent() {
    const event = localize(events.get(state.eventId), 'events');
    select('[data-event-title]').textContent = event.title;
    renderDate(select('[data-event-date]'), event.date);
    select('[data-event-location]').textContent = event.location;
    select('[data-event-description]').textContent = event.description;
    renderSources(select('[data-event-sources]'), event.sources);
    const related = artworks.filter((artwork) => artwork.disappearanceEventId === event.id);
    select('[data-event-empty]').hidden = related.length > 1;
    renderArtworkGrid(select('[data-event-artworks]'), related);
  }

  function renderArtist() {
    const artist = localize(artists.get(state.artistId), 'artists');
    const related = artworks.filter((artwork) => artwork.artistId === artist.id);
    select('[data-artist-title]').textContent = artist.name;
    select('[data-artist-kind]').textContent = artistKind(artist);
    select('[data-artist-count]').textContent = t(related.length === 1 ? 'artistCountOne' : 'artistCountMany', { count: related.length });
    select('[data-artist-description]').textContent = t(artist.kind === 'origin' ? 'artistOriginDescription' : artist.kind === 'after' ? 'artistAttributionDescription' : 'artistDescription');
    renderArtworkGrid(select('[data-artist-artworks]'), related);
  }

  function renderArtworkGrid(container, related) {
    container.replaceChildren(...related.map((base) => {
      const artwork = artworkById(base.id);
      const entry = document.createElement('article');
      entry.className = 'nyf-event-artwork';
      const zoom = document.createElement('button');
      zoom.className = 'nyf-event-image nyf-zoom-trigger';
      zoom.type = 'button';
      zoom.dataset.action = 'zoom';
      zoom.dataset.artworkId = artwork.id;
      zoom.setAttribute('aria-label', t('enlargeImage', { title: artwork.title }));
      const image = document.createElement('img');
      setImage(image, artwork);
      zoom.append(image);
      const artist = document.createElement('p');
      artist.className = 'nyf-eyebrow';
      artist.textContent = artwork.artist;
      const heading = document.createElement('h4');
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'nyf-artwork-link';
      link.dataset.action = 'open-artwork';
      link.dataset.artworkId = artwork.id;
      link.textContent = artwork.title;
      heading.append(link);
      const hint = document.createElement('p');
      hint.className = 'nyf-caption-small';
      hint.textContent = artwork.id === currentArtwork()?.id ? t('currentArtwork') : `${t('readStory')} ↗`;
      entry.append(zoom, artist, heading, hint);
      const valuation = document.createElement('p');
      valuation.className = 'nyf-caption-small';
      const valuationYear = validValuation(artwork)?.source?.date.slice(0, 4);
      valuation.textContent = `${t('valuation')} : ${valuationText(artwork)}${valuationYear ? ` (${valuationYear})` : ''}`;
      entry.append(valuation);
      return entry;
    }));
  }

  function renderZoomCaption() {
    if (!zoomedId) return;
    const artwork = artworkById(zoomedId);
    select('[data-lightbox-title]').textContent = `${artwork.title} · ${artwork.date}`;
    select('[data-lightbox-artist]').textContent = artwork.artist;
    const event = events.get(artwork.disappearanceEventId);
    renderDate(select('[data-lightbox-disappearance-date]'), event.date);
    select('[data-lightbox-credit]').textContent = artwork.image.credit;
    select('[data-lightbox-image]').alt = artwork.image.alt;
  }

  function render(announce = false) {
    const artwork = currentArtwork();
    if (['work', 'event', 'artist'].includes(state.screen) && !artwork) state.screen = 'home';
    if (state.screen === 'event' && !events.has(state.eventId)) state.screen = 'work';
    if (state.screen === 'artist' && !artists.has(state.artistId)) state.screen = 'work';
    document.documentElement.lang = state.language;
    root.lang = state.language;
    document.title = t('pageTitle');
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('pageDescription'));
    root.querySelectorAll('[data-i18n]').forEach((element) => { element.textContent = t(element.dataset.i18n); });
    root.querySelectorAll('[data-i18n-aria]').forEach((element) => { element.setAttribute('aria-label', t(element.dataset.i18nAria)); });
    const languageButton = select('[data-action="language"]');
    languageButton.textContent = state.language === 'fr' ? 'EN' : 'FR';
    languageButton.lang = state.language === 'fr' ? 'en' : 'fr';
    const supportLink = select('[data-support-link]');
    if (state.screen === 'support') supportLink.setAttribute('aria-current', 'page');
    else supportLink.removeAttribute('aria-current');
    root.querySelectorAll('[data-nyf-view]').forEach((view) => { view.hidden = view.dataset.nyfView !== state.screen; });
    if (state.screen === 'home') renderFeatured();
    if (state.screen === 'work') renderArtwork(artwork);
    if (state.screen === 'event') renderEvent();
    if (state.screen === 'artist') renderArtist();
    renderZoomCaption();
    root.querySelectorAll('.nyf-header [data-action]').forEach((button) => {
      const screen = button.dataset.action === 'visit' ? 'work' : button.dataset.action;
      if (screen === state.screen || (screen === 'work' && ['event', 'artist'].includes(state.screen))) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    if (announce) {
      select('[data-nyf-status]').textContent = state.screen === 'work'
        ? `${artwork.title}, ${artwork.artist}. ${t(statusLabels[artworkStatus(artwork)])}.`
        : state.screen === 'event' ? localize(events.get(state.eventId), 'events').title
        : state.screen === 'artist' ? localize(artists.get(state.artistId), 'artists').name
        : state.screen === 'about' ? t('aboutSection')
        : state.screen === 'support' ? t('supportProject') : t('homeSection');
    }
  }

  function persist() {
    const snapshot = { ...state, screen: state.screen === 'support' ? screenBeforeSupport : state.screen, history: [...state.history] };
    try { sessionStorage.setItem(storageKey, JSON.stringify(snapshot)); } catch (_) { /* Storage may be unavailable in an embedded preview. */ }
    try { localStorage.setItem('nyf-language', state.language); } catch (_) { /* The current language still works in memory. */ }
    if (window.openai && window.openai.setWidgetState) {
      window.openai.setWidgetState({
        modelContent: { screen: state.screen, artwork: currentArtwork()?.title || null, language: state.language, eventId: state.eventId },
        privateContent: snapshot,
      }).catch(() => {});
    }
  }

  function restore(snapshot) {
    if (!snapshot || !['home', 'work', 'about', 'event', 'artist'].includes(snapshot.screen)) return;
    if (!Array.isArray(snapshot.history) || snapshot.history.length > 100 || !snapshot.history.every((id) => byId.has(id))) return;
    if (!Number.isInteger(snapshot.position) || snapshot.position < -1 || snapshot.position >= snapshot.history.length) return;
    if ((snapshot.history.length === 0) !== (snapshot.position === -1)) return;
    cancelWorkTransition?.();
    cancelPageTransition?.();
    if (snapshot.screen === 'home' && state.screen !== 'home') featuredId = null;
    state.screen = snapshot.screen;
    state.history = [...snapshot.history];
    state.position = snapshot.position;
    state.eventId = events.has(snapshot.eventId) ? snapshot.eventId : null;
    state.artistId = artists.has(snapshot.artistId) ? snapshot.artistId : null;
    if (dictionaries[snapshot.language]) state.language = snapshot.language;
    render();
  }

  function syncSupportRoute() {
    if (window.location.hash === '#soutenir') {
      if (state.screen === 'support') return;
      cancelWorkTransition?.();
      cancelPageTransition?.();
      screenBeforeSupport = state.screen;
      state.screen = 'support';
      render(true);
      select('#nyf-support-title').focus({ preventScroll: true });
      root.scrollIntoView({ block: 'start', behavior: 'instant' });
    } else if (state.screen === 'support') {
      state.screen = screenBeforeSupport;
      render(true);
      select('[data-support-link]').focus({ preventScroll: true });
    }
  }

  function visitArtwork(id) {
    if (!byId.has(id)) return;
    if (currentArtwork()?.id !== id) {
      state.history = state.history.slice(0, state.position + 1);
      state.history.push(id);
      if (state.history.length > 100) state.history.shift();
      state.position = state.history.length - 1;
    }
    state.screen = 'work';
  }

  function discoverAnother() {
    const others = artworks.filter((artwork) => artwork.id !== currentArtwork()?.id);
    if (others.length === 0) return;
    const visited = new Set(state.history.slice(0, state.position + 1));
    const unseen = others.filter((artwork) => !visited.has(artwork.id));
    const candidates = unseen.length > 0 ? unseen : others;
    visitArtwork(candidates[Math.floor(Math.random() * candidates.length)].id);
  }

  async function slideArtwork(action) {
    if (cancelWorkTransition || state.screen !== 'work') return;
    if (action === 'previous' && state.position <= 0) return;
    if (action === 'random' && artworks.length < 2) return;
    const stage = select('[data-work-stage]');
    const page = select('[data-work]');
    const outgoing = reduceMotion() ? null : snapshot(page, 'nyf-work-outgoing');
    const previousHeight = stage.getBoundingClientRect().height;
    if (action === 'previous') state.position -= 1;
    else discoverAnother();
    render(true);
    persist();
    root.scrollIntoView({ block: 'start', behavior: 'instant' });
    if (!outgoing) return;

    // Keep the old artwork visible while the incoming reproduction loads.
    stage.style.height = `${Math.max(previousHeight, stage.getBoundingClientRect().height)}px`;
    stage.setAttribute('aria-busy', 'true');
    stage.append(outgoing);
    page.style.visibility = 'hidden';
    const animations = [];
    const cleanup = () => {
      animations.forEach((animation) => animation.cancel());
      outgoing.remove();
      page.style.visibility = '';
      stage.style.height = '';
      stage.removeAttribute('aria-busy');
      cancelWorkTransition = null;
    };
    cancelWorkTransition = cleanup;
    try {
      await select('[data-work-image]').decode().catch(() => {});
      if (cancelWorkTransition !== cleanup) return;
      page.style.visibility = '';
      const direction = action === 'previous' ? -1 : 1;
      animations.push(
        outgoing.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-direction * 100}%)` }], { ...motion, fill: 'forwards' }),
        page.animate([{ transform: `translateX(${direction * 100}%)` }, { transform: 'translateX(0)' }], motion),
        select('[data-work-image]').animate([{ opacity: .35, filter: 'blur(12px)' }, { opacity: 1, filter: 'blur(0)' }], motion),
      );
      await Promise.all(animations.map((animation) => animation.finished));
    } catch (_) { /* Navigation away can cancel an active slide. */ }
    finally { if (cancelWorkTransition === cleanup) cleanup(); }
  }

  async function revealPage(outgoing, previousHeight) {
    const main = select('main');
    const incoming = select(`[data-nyf-view="${state.screen}"]`);
    main.style.minHeight = `${Math.max(previousHeight, main.getBoundingClientRect().height)}px`;
    main.setAttribute('aria-busy', 'true');
    incoming.style.visibility = 'hidden';
    main.append(outgoing);
    const animations = [];
    const cleanup = () => {
      animations.forEach((animation) => animation.cancel());
      outgoing.remove();
      incoming.style.visibility = '';
      main.style.minHeight = '';
      main.removeAttribute('aria-busy');
      cancelPageTransition = null;
    };
    cancelPageTransition = cleanup;
    try {
      await Promise.all([...incoming.querySelectorAll('img')].map((image) => image.decode().catch(() => {})));
      if (cancelPageTransition !== cleanup) return;
      incoming.style.visibility = '';
      animations.push(
        outgoing.animate([{ opacity: 1 }, { opacity: 0 }], { ...motion, duration: motion.duration * .45, fill: 'forwards' }),
        incoming.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { ...motion, duration: motion.duration * .8, delay: motion.duration * .2, fill: 'backwards' }),
      );
      const image = incoming.querySelector('[data-work-image], [data-featured-image]');
      if (image) animations.push(image.animate([{ filter: 'blur(12px)' }, { filter: 'blur(0)' }], motion));
      await Promise.all(animations.map((animation) => animation.finished));
    } catch (_) { /* A new navigation cancels the current transition. */ }
    finally { if (cancelPageTransition === cleanup) cleanup(); }
  }

  function setImageZoom(value) {
    imageZoom = Math.round(Math.max(1, Math.min(2, value)) * 100) / 100;
    const canvas = select('[data-zoom-canvas]');
    const image = select('[data-lightbox-image]');
    const size = canvas.getBoundingClientRect();
    const fit = image.naturalWidth ? Math.min(size.width / image.naturalWidth, size.height / image.naturalHeight) : 0;
    const boundX = Math.max(0, (image.naturalWidth * fit * imageZoom - size.width) / 2);
    const boundY = Math.max(0, (image.naturalHeight * fit * imageZoom - size.height) / 2);
    imagePan.x = Math.max(-boundX, Math.min(boundX, imagePan.x));
    imagePan.y = Math.max(-boundY, Math.min(boundY, imagePan.y));
    select('[data-zoom-surface]').style.transform = `translate3d(${imagePan.x}px, ${imagePan.y}px, 0) scale(${imageZoom})`;
    canvas.classList.toggle('is-zoomed', imageZoom > 1);
    select('[data-zoom-value]').textContent = new Intl.NumberFormat(state.language === 'en' ? 'en-GB' : 'fr-FR', { style: 'percent' }).format(imageZoom);
    select('[data-action="zoom-out"]').disabled = imageZoom <= 1;
    select('[data-action="zoom-in"]').disabled = imageZoom >= 2;
  }

  function endDrag() {
    const canvas = select('[data-zoom-canvas]');
    const pointerId = drag?.id;
    drag = null;
    canvas.classList.remove('is-panning');
    if (pointerId !== undefined && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
  }

  function resetImageZoom() {
    endDrag();
    imagePan = { x: 0, y: 0 };
    setImageZoom(1);
  }

  async function closeImage() {
    if (!dialog.open || closingImage) return;
    closingImage = true;
    const opacity = getComputedStyle(dialog).opacity;
    dialogAnimation?.cancel();
    if (reduceMotion()) { dialog.close(); return; }
    const animation = dialog.animate([{ opacity }, { opacity: 0 }], { ...motion, fill: 'forwards' });
    dialogAnimation = animation;
    try { await animation.finished; } catch (_) { return; }
    if (dialogAnimation === animation && closingImage) {
      dialog.close();
      animation.cancel();
    }
  }

  function openImage(id, opener) {
    const artwork = artworkById(id);
    if (!artwork) return;
    zoomedId = id;
    zoomOpener = opener;
    closingImage = false;
    dialogAnimation?.cancel();
    resetImageZoom();
    const image = select('[data-lightbox-image]');
    image.getAnimations().forEach((animation) => animation.cancel());
    image.removeAttribute('src');
    image.hidden = true;
    select('[data-lightbox-error]').hidden = true;
    let revealed = false;
    const reveal = () => {
      if (revealed || !dialog.open) return;
      revealed = true;
      image.hidden = false;
      setImageZoom(imageZoom);
      if (!reduceMotion()) {
        image.animate([
          { opacity: 0.25, filter: 'blur(16px)' },
          { opacity: 1, filter: 'blur(0)' },
        ], motion);
      }
    };
    image.onload = reveal;
    image.onerror = () => {
      if (image.getAttribute('src') !== artwork.image.src) image.src = artwork.image.src;
      else {
        image.hidden = true;
        select('[data-lightbox-error]').hidden = false;
      }
    };
    image.src = artwork.image.largeSrc || artwork.image.src;
    renderZoomCaption();
    document.documentElement.classList.add('nyf-zoom-open');
    if (!dialog.open) dialog.showModal();
    if (!reduceMotion()) dialogAnimation = dialog.animate([{ opacity: 0 }, { opacity: 1 }], motion);
    if (image.complete && image.naturalWidth > 0) reveal();
  }

  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button || !root.contains(button) || button.disabled) return;
    const action = button.dataset.action;
    if (action === 'zoom-in') { setImageZoom(imageZoom + .25); return; }
    if (action === 'zoom-out') { setImageZoom(imageZoom - .25); return; }
    if (action === 'zoom-reset') { resetImageZoom(); return; }
    cancelPageTransition?.();
    if (action === 'random' || action === 'previous') { void slideArtwork(action); return; }
    cancelWorkTransition?.();
    if (action === 'zoom') { openImage(button.dataset.artworkId, button); return; }
    if (action === 'close-image') { void closeImage(); return; }
    if (action === 'details') {
      const artwork = currentArtwork();
      if (artwork && state.screen === 'work') void openDetails(artwork);
      return;
    }
    if (action === 'event' && detailsDialog.open) detailsDialog.close();
    const previousScreen = state.screen;
    const main = select('main');
    const previousHeight = main.getBoundingClientRect().height;
    const outgoing = !reduceMotion() && action !== 'language' ? snapshot(select(`[data-nyf-view="${previousScreen}"]`), 'nyf-view-outgoing') : null;
    switch (action) {
      case 'home': featuredId = null; state.screen = 'home'; break;
      case 'about': state.screen = 'about'; break;
      case 'language': state.language = state.language === 'fr' ? 'en' : 'fr'; break;
      case 'visit':
        if (state.screen === 'home' || state.history.length === 0) {
          if (!featuredId) chooseFeatured();
          visitArtwork(featuredId);
        }
        else state.screen = 'work';
        break;
      case 'event':
        event.preventDefault();
        if (!events.has(button.dataset.eventId)) return;
        state.eventId = button.dataset.eventId;
        state.screen = 'event';
        break;
      case 'artist':
        event.preventDefault();
        if (!artists.has(button.dataset.artistId)) return;
        state.artistId = button.dataset.artistId;
        state.screen = 'artist';
        break;
      case 'back-artwork': state.screen = 'work'; break;
      case 'open-artwork': visitArtwork(button.dataset.artworkId); break;
      default: return;
    }
    if (previousScreen === 'support' && state.screen !== previousScreen) {
      window.history.replaceState(window.history.state, '', window.location.href.split('#')[0]);
    }
    render(true);
    persist();
    if (state.screen !== previousScreen) select(`[data-nyf-view="${state.screen}"] button:not(:disabled)`)?.focus({ preventScroll: true });
    if (state.screen !== previousScreen) root.scrollIntoView({ block: 'start', behavior: 'instant' });
    if (outgoing && (state.screen !== previousScreen || action === 'home')) void revealPage(outgoing, previousHeight);
  });

  detailsDialog.addEventListener('close', () => {
    if (detailsDialog.open) return;
    detailsRequest?.abort();
    detailsRequest = null;
  });
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); void closeImage(); });
  dialog.addEventListener('close', () => {
    if (dialog.open) return; // Ignore a queued close event if the viewer was reopened.
    dialogAnimation?.cancel();
    dialogAnimation = null;
    closingImage = false;
    resetImageZoom();
    const image = select('[data-lightbox-image]');
    image.getAnimations().forEach((animation) => animation.cancel());
    image.onload = null;
    image.onerror = null;
    document.documentElement.classList.remove('nyf-zoom-open');
    zoomedId = null;
    (zoomOpener?.isConnected ? zoomOpener : select('[data-action="language"]')).focus({ preventScroll: true });
  });
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) void closeImage();
  });
  const zoomCanvas = select('[data-zoom-canvas]');
  zoomCanvas.addEventListener('wheel', (event) => {
    if (!dialog.open || select('[data-lightbox-image]').hidden) return;
    event.preventDefault();
    setImageZoom(imageZoom + (event.deltaY < 0 ? .125 : -.125));
  }, { passive: false });
  zoomCanvas.addEventListener('dblclick', () => { if (dialog.open) { if (imageZoom > 1) resetImageZoom(); else setImageZoom(1.5); } });
  zoomCanvas.addEventListener('pointerdown', (event) => {
    if (imageZoom <= 1 || event.button !== 0 || !event.isPrimary) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    zoomCanvas.setPointerCapture(event.pointerId);
    zoomCanvas.classList.add('is-panning');
    event.preventDefault();
  });
  zoomCanvas.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    imagePan.x += event.clientX - drag.x;
    imagePan.y += event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    setImageZoom(imageZoom);
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) zoomCanvas.addEventListener(name, endDrag);
  window.addEventListener('resize', () => { if (dialog.open) setImageZoom(imageZoom); });
  select('[data-work-image]').addEventListener('error', (event) => {
    event.target.hidden = true;
    select('[data-work-zoom]').disabled = true;
    select('[data-image-error]').hidden = false;
  });
  select('[data-work-image]').addEventListener('load', (event) => {
    event.target.hidden = false;
    select('[data-work-zoom]').disabled = false;
    select('[data-image-error]').hidden = true;
  });
  select('[data-featured]').hidden = false;
  root.querySelectorAll('[data-action="visit"], [data-action="language"]').forEach((button) => { button.disabled = false; });
  try { restore(JSON.parse(sessionStorage.getItem(storageKey))); } catch (_) { /* A fresh visit is the default. */ }
  restore(window.openai?.widgetState?.privateContent);
  window.addEventListener('openai:set_globals', (event) => {
    restore(event.detail?.globals?.widgetState?.privateContent);
    syncSupportRoute();
  });
  window.addEventListener('hashchange', syncSupportRoute);
  render();
  syncSupportRoute();
};
