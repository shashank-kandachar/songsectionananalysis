/*
  CueLab Precision Workbench - UI Dossier Capture
  Version: 1.0

  What this does
  - Captures the loaded CueLab workbench across every major mode.
  - Downloads a ChatGPT-ready Markdown report and a structured JSON dossier.
  - Can optionally download PNG captures of every screen when explicitly enabled.
  - Temporarily opens read-only UI surfaces such as QA, Export preview, Help,
    rail states and album artwork, then restores your starting screen.

  What this does NOT do
  - It does not edit annotations, import/export annotation JSON, play audio,
    move section boundaries, submit BeatPulse data or read Spotify auth tokens.

  How to run in Safari
  1. Keep this file beside index.html in the deployed CueLab project.
  2. Open CueLab and load a representative track/session.
  3. Open Develop > Show JavaScript Console.
  4. Paste the short loader from cuelab-ui-dossier-launcher.txt and press Return.
  5. Attach the downloaded .md and .json files, plus Safari screenshots, to ChatGPT.
     Optional: change capturePngScreenshots to true below to auto-download PNGs.
*/
(function captureCueLabUiDossier() {
  'use strict';

  var CONFIG = {
    includeVisibleFieldValues: true,
    includeVisibleAnnotationCopy: true,
    // Off by default: enabling this loads html2canvas from cdnjs into this page.
    capturePngScreenshots: false,
    screenshotLibraryUrl: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    screenshotScale: Math.min(2, window.devicePixelRatio || 1),
    maxVisibleTextCharacters: 5200,
    maxRegionTextCharacters: 900,
    maxOverflowFindings: 30
  };

  var MODES = [
    { id: 'map', name: 'Sections / Map', purpose: 'marking, selecting, labelling and boundary adjustment' },
    { id: 'final', name: 'Annotation', purpose: 'selected-section writing surface' },
    { id: 'evidence', name: 'Evidence', purpose: 'optional listening observations worksheet' },
    { id: 'wizard', name: 'Guided Listen', purpose: 'optional five-step support for difficult sections' },
    { id: 'global', name: 'Global Fields', purpose: 'whole-track field editor' },
    { id: 'qa', name: 'QA / Golden Check', purpose: 'readiness and issue review' },
    { id: 'handover', name: 'Export / Handover', purpose: 'ChatGPT and BeatPulse delivery station' }
  ];

  var REGION_SELECTORS = [
    ['Header', '.precision-header'],
    ['Left Rail', '#studio-rail'],
    ['Track Identity', '.track-identity-row'],
    ['Structure Map', '.structure-stage'],
    ['Transport', '.transport-row'],
    ['Workbench Bar', '.tab-bar'],
    ['Section List', '.sections-workspace > .panel:first-child'],
    ['Active Surface', '#section-detail-panel'],
    ['QA Summary', '#qa-summary-card'],
    ['Globals Preview', '#global-preview-strip'],
    ['Global Workspace', '#global-tab'],
    ['QA Workspace', '#qa-tab'],
    ['Export Workspace', '#handover-tab'],
    ['Album Modal', '.album-modal-card'],
    ['Help Popup', '#shortcut-help']
  ];

  var STYLE_SAMPLES = [
    ['Application', '.app'],
    ['Header', '.precision-header'],
    ['Rail', '#studio-rail'],
    ['Panel', '.panel'],
    ['Structure Map', '.waveform-wrap'],
    ['Active Rail Item', '.rail-item.active'],
    ['Primary Action', '.ready-btn'],
    ['Small Button', '.btn-sm'],
    ['Text Input', 'textarea:not([hidden]), input:not([type="hidden"])'],
    ['Global Preview Item', '.global-preview-item']
  ];

  var TOKEN_HINTS = [
    '--bg', '--s1', '--s2', '--s3', '--panel-bg', '--card-bg', '--input-bg',
    '--popup-bg', '--border', '--border2', '--text', '--muted', '--dim',
    '--green', '--green2', '--blue', '--orange', '--amber', '--ok',
    '--danger', '--ag-soft', '--ag-cyan', '--accent-rgb', '--line-rgb',
    '--wave-rgb', '--marker-rgb', '--section-colors'
  ];

  function $(selector) { return document.querySelector(selector); }
  function $$(selector) { return Array.prototype.slice.call(document.querySelectorAll(selector)); }
  function isVisible(element) {
    if (!element || element.hidden) return false;
    var style = getComputedStyle(element);
    var rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }
  function clean(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }
  function clip(value, max) {
    value = clean(value);
    return value.length > max ? value.slice(0, max - 1) + '...' : value;
  }
  function round(value) { return Math.round(Number(value) * 10) / 10; }
  function rectOf(element) {
    var r = element.getBoundingClientRect();
    return { x: round(r.x), y: round(r.y), width: round(r.width), height: round(r.height) };
  }
  function safeText(element, max) {
    if (!element) return '';
    return clip(element.innerText || element.textContent || '', max || CONFIG.maxRegionTextCharacters);
  }
  function kebab(value) {
    return String(value).replace(/([a-z])([A-Z])/g, '$1-$2').replace(/\s+/g, '-').toLowerCase();
  }
  function escapeMarkdown(value) {
    return String(value || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  }
  function cssPath(element) {
    if (!element) return '';
    if (element.id) return '#' + element.id;
    var name = element.tagName.toLowerCase();
    var classes = Array.prototype.slice.call(element.classList || []).slice(0, 2);
    return name + (classes.length ? '.' + classes.join('.') : '');
  }
  function colorValue(value) {
    return value && value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent' ? value : '';
  }
  function settle() {
    return new Promise(function(resolve) {
      requestAnimationFrame(function() {
        requestAnimationFrame(function() { setTimeout(resolve, 60); });
      });
    });
  }
  function setHidden(element, hidden) {
    if (element) element.hidden = !!hidden;
  }
  function downloadText(filename, text, type) {
    var url = URL.createObjectURL(new Blob([text], { type: type || 'text/plain;charset=utf-8' }));
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function() { URL.revokeObjectURL(url); }, 2000);
  }
  function downloadBlob(filename, blob) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function() { URL.revokeObjectURL(url); }, 3000);
  }
  function loadScreenshotLibrary() {
    if (!CONFIG.capturePngScreenshots) return Promise.resolve(false);
    if (typeof window.html2canvas === 'function') return Promise.resolve(true);
    return new Promise(function(resolve) {
      var resolved = false;
      var timeout = setTimeout(function() {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      }, 8000);
      var script = document.createElement('script');
      script.src = CONFIG.screenshotLibraryUrl;
      script.onload = function() {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(typeof window.html2canvas === 'function');
        }
      };
      script.onerror = function() {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(false);
        }
      };
      document.head.appendChild(script);
    });
  }
  function capturePng(filename) {
    return window.html2canvas(document.body, {
        backgroundColor: getComputedStyle(document.body).backgroundColor || '#090a12',
        scale: CONFIG.screenshotScale,
        useCORS: true,
        allowTaint: false,
        logging: false,
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: -window.scrollX,
        scrollY: -window.scrollY,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight
      }).then(function(canvas) {
        return new Promise(function(resolve) { canvas.toBlob(resolve, 'image/png'); });
      }).then(function(blob) {
        if (!blob) return false;
        downloadBlob(filename, blob);
        return true;
      }).catch(function(error) {
      console.warn('[CueLab UI Dossier] PNG capture failed for ' + filename + '.', error);
      return false;
      });
  }
  function timestampSlug() {
    return new Date().toISOString().replace(/[:.]/g, '-');
  }
  function visibleRootText() {
    var root = $('#player-section') || document.body;
    return clip(root.innerText || '', CONFIG.maxVisibleTextCharacters);
  }

  function styleSnapshot(element) {
    var s = getComputedStyle(element);
    return {
      display: s.display,
      position: s.position,
      gridTemplateColumns: s.gridTemplateColumns === 'none' ? '' : s.gridTemplateColumns,
      gap: s.gap,
      padding: s.padding,
      background: colorValue(s.backgroundColor),
      color: colorValue(s.color),
      border: s.border,
      borderRadius: s.borderRadius,
      fontFamily: s.fontFamily,
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      lineHeight: s.lineHeight,
      overflowX: s.overflowX,
      overflowY: s.overflowY
    };
  }

  function captureRegions() {
    return REGION_SELECTORS.map(function(item) {
      var element = $(item[1]);
      if (!isVisible(element)) return null;
      return {
        name: item[0],
        selector: item[1],
        rect: rectOf(element),
        style: styleSnapshot(element),
        visibleText: safeText(element)
      };
    }).filter(Boolean);
  }

  function controlLabel(element) {
    var aria = element.getAttribute('aria-label') || element.getAttribute('title');
    if (aria) return clean(aria);
    if (element.id) {
      var explicit = document.querySelector('label[for="' + CSS.escape(element.id) + '"]');
      if (explicit) return clean(explicit.innerText);
    }
    return clip(element.innerText || element.value || element.placeholder || element.name || element.id || element.tagName, 110);
  }

  function captureControls() {
    var controls = $$('button, a[href], input:not([type="hidden"]), textarea:not([hidden]), select, label.file-btn')
      .filter(isVisible);
    return controls.map(function(element) {
      var tag = element.tagName.toLowerCase();
      var type = tag === 'input' ? (element.type || 'text') : tag;
      var result = {
        tag: tag,
        type: type,
        selector: cssPath(element),
        label: controlLabel(element),
        rect: rectOf(element),
        disabled: !!element.disabled
      };
      if (tag === 'select') {
        result.value = element.value;
        result.options = Array.prototype.slice.call(element.options).map(function(option) { return clean(option.textContent); });
      } else if (CONFIG.includeVisibleFieldValues && (tag === 'textarea' || (tag === 'input' && type !== 'file'))) {
        result.value = element.id === 'url-input' ? '[Spotify URL omitted]' : clip(element.value, 400);
        result.placeholder = clip(element.placeholder, 160);
      }
      return result;
    });
  }

  function captureOverflow() {
    var ignore = ['canvas', 'svg', 'path', 'script', 'style', 'option'];
    return $$('body *').filter(function(element) {
      if (!isVisible(element) || ignore.indexOf(element.tagName.toLowerCase()) >= 0) return false;
      var text = clean(element.innerText || '');
      if (!text || text.length > 4500) return false;
      return element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2;
    }).slice(0, CONFIG.maxOverflowFindings).map(function(element) {
      var style = getComputedStyle(element);
      return {
        selector: cssPath(element),
        text: clip(element.innerText, 100),
        client: { width: element.clientWidth, height: element.clientHeight },
        scroll: { width: element.scrollWidth, height: element.scrollHeight },
        overflow: style.overflow + ' / ' + style.overflowX + ' / ' + style.overflowY,
        likelyIntentionalScroll: /auto|scroll/.test(style.overflow + style.overflowX + style.overflowY)
      };
    });
  }

  function captureCanvas() {
    var canvas = $('#waveform-canvas');
    var cursor = $('#waveform-cursor');
    if (!canvas || !isVisible(canvas)) return null;
    return {
      semanticName: 'Structure Map canvas',
      rect: rectOf(canvas),
      internalResolution: { width: canvas.width, height: canvas.height },
      ariaLabel: ($('#waveform-wrap') || {}).getAttribute ? $('#waveform-wrap').getAttribute('aria-label') : '',
      playheadLeft: cursor ? getComputedStyle(cursor).left : '',
      note: 'The canvas pixels are not embedded in this text dossier; attach a screenshot when asking for visual styling feedback.'
    };
  }

  function captureScreen(id, name, purpose) {
    return {
      id: id,
      name: name,
      purpose: purpose,
      activeWorkbenchView: typeof window.activeWorkbenchView === 'string' ? window.activeWorkbenchView : id,
      viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
      documentScroll: {
        clientHeight: document.documentElement.clientHeight,
        scrollHeight: document.documentElement.scrollHeight,
        requiresPageScroll: document.documentElement.scrollHeight > document.documentElement.clientHeight + 2
      },
      regions: captureRegions(),
      controls: captureControls(),
      canvas: captureCanvas(),
      potentialOverflow: captureOverflow(),
      visibleCopy: CONFIG.includeVisibleAnnotationCopy ? visibleRootText() : '[Visible annotation copy omitted by configuration]'
    };
  }

  function getTokens() {
    var names = {};
    TOKEN_HINTS.forEach(function(name) { names[name] = true; });
    $$('style').forEach(function(style) {
      var source = style.textContent || '';
      var matches = source.match(/--[a-zA-Z0-9_-]+\s*:/g) || [];
      matches.forEach(function(match) { names[match.replace(/\s*:\s*$/, '')] = true; });
    });
    var computed = getComputedStyle(document.documentElement);
    return Object.keys(names).sort().reduce(function(output, name) {
      var value = computed.getPropertyValue(name).trim();
      if (value) output[name] = value;
      return output;
    }, {});
  }

  function getStyleSamples() {
    return STYLE_SAMPLES.map(function(item) {
      var element = $(item[1]);
      if (!isVisible(element)) return null;
      return { name: item[0], selector: item[1], style: styleSnapshot(element) };
    }).filter(Boolean);
  }

  function dormantSurface(selector, name) {
    var element = $(selector);
    if (!element) return null;
    return { name: name, selector: selector, currentlyVisible: isVisible(element), definedCopy: clip(element.textContent, 1000) };
  }

  function captureAppMetadata() {
    var track = typeof window.currentTrack === 'object' && window.currentTrack ? window.currentTrack : null;
    var sectionData = Array.isArray(window.sections) ? window.sections.map(function(section, index) {
      return {
        number: index + 1,
        label: String(section.label || ''),
        start: Number(section.start || 0),
        duration: Number(section.duration || 0)
      };
    }) : [];
    return {
      title: document.title,
      url: location.href.replace(/[?#].*$/, ''),
      capturedAt: new Date().toISOString(),
      product: clean(($('.logo') || {}).textContent || 'CueLab'),
      identity: clean(($('.product-subtitle') || {}).textContent || 'Precision Workbench'),
      trackLoaded: !!track,
      trackDisplay: track ? {
        title: track.name || '',
        artist: Array.isArray(track.artists) ? track.artists.map(function(artist) { return artist.name; }).join(', ') : '',
        album: track.album ? track.album.name || '' : '',
        durationMs: track.duration_ms || 0
      } : null,
      sectionMap: sectionData,
      nonNegotiableWorkflowConstraints: [
        'Retain the Structure Map as the central timeline visual; do not replace it with a generated waveform.',
        'No in-app speech transcription or Narration Mode.',
        'No visible Refine/pass/refinement workflow terminology.',
        'Now Playing / Structure Map remains visible rather than collapsible.',
        'Preserve Spotify authentication, saved sessions, ChatGPT JSON import/handover, Golden Check, BeatPulse bridge and Safari Paste Assistant compatibility.'
      ]
    };
  }

  function markdownScreen(screen) {
    var lines = [
      '## ' + screen.name,
      '',
      '**Purpose:** ' + screen.purpose,
      '',
      '**Viewport/fit:** `' + screen.viewport.width + ' x ' + screen.viewport.height + '`; page scroll required: `' + screen.documentScroll.requiresPageScroll + '`.',
      '',
      '**Visible regions**',
      '',
      '| Region | Bounds (x, y, w, h) | Layout | Background | Type |',
      '| --- | --- | --- | --- | --- |'
    ];
    screen.regions.forEach(function(region) {
      var layout = region.style.display + (region.style.gridTemplateColumns ? '; columns ' + region.style.gridTemplateColumns : '');
      var type = region.style.fontSize + ' / ' + region.style.lineHeight;
      lines.push('| ' + escapeMarkdown(region.name) + ' | ' +
        [region.rect.x, region.rect.y, region.rect.width, region.rect.height].join(', ') + ' | ' +
        escapeMarkdown(layout) + ' | ' + escapeMarkdown(region.style.background || '-') + ' | ' + escapeMarkdown(type) + ' |');
    });
    lines.push('', '**Controls and fields**', '');
    screen.controls.forEach(function(control) {
      var value = Object.prototype.hasOwnProperty.call(control, 'value') && control.value ? ' = `' + escapeMarkdown(control.value) + '`' : '';
      lines.push('- `' + control.type + '` ' + (control.label || control.selector) + value);
    });
    lines.push('', '**Visible copy/layout content**', '', '```text', screen.visibleCopy, '```', '');
    if (screen.canvas) {
      lines.push('**Structure Map canvas:** `' + screen.canvas.rect.width + ' x ' + screen.canvas.rect.height +
        '` displayed; internal resolution `' + screen.canvas.internalResolution.width + ' x ' + screen.canvas.internalResolution.height + '`.', '');
    }
    if (screen.screenshotFile) {
      lines.push('**PNG screen capture:** `' + screen.screenshotFile + '`', '');
    }
    if (screen.potentialOverflow.length) {
      lines.push('**Potential overflow/intentional scrolling to inspect**', '');
      screen.potentialOverflow.forEach(function(issue) {
        lines.push('- `' + issue.selector + '` client `' + issue.client.width + 'x' + issue.client.height +
          '`, scroll `' + issue.scroll.width + 'x' + issue.scroll.height + '`, intentional scroll likely: `' +
          issue.likelyIntentionalScroll + '` - ' + issue.text);
      });
      lines.push('');
    }
    return lines.join('\n');
  }

  function makeMarkdown(dossier) {
    var lines = [
      '# CueLab UI Dossier',
      '',
      'Generated: `' + dossier.app.capturedAt + '`',
      '',
      '## How To Use This With ChatGPT',
      '',
      'Attach this Markdown file and the companion JSON file, along with any screenshots that best show the visual finish. Use this prompt:',
      '',
      '```text',
      'Review the attached CueLab Precision Workbench UI dossier as a senior product designer and music-annotation workflow specialist. Identify high-impact refinements to aesthetics, information hierarchy, alignment, readability, density, mouse travel, and short-laptop viewport efficiency. Preserve the listed non-negotiable workflow constraints and existing integration behavior. Give recommendations screen-by-screen, then a prioritized implementation brief I can send to Codex. Do not propose speech transcription, waveform replacement, Refine/pass terminology, or collapsing the permanent Structure Map.',
      '```',
      '',
      '## Product And Workflow Constraints',
      ''
    ];
    dossier.app.nonNegotiableWorkflowConstraints.forEach(function(rule) { lines.push('- ' + rule); });
    lines.push('', '## Captured Context', '');
    lines.push('- Product: `' + dossier.app.product + ' - ' + dossier.app.identity + '`');
    lines.push('- Track loaded: `' + dossier.app.trackLoaded + '`');
    if (dossier.app.trackDisplay) {
      lines.push('- Representative track: `' + dossier.app.trackDisplay.title + ' - ' + dossier.app.trackDisplay.artist + '`');
      lines.push('- Sections visible in map: `' + dossier.app.sectionMap.length + '`');
    }
    lines.push('- Viewport: `' + dossier.environment.viewport.width + ' x ' + dossier.environment.viewport.height + '`');
    lines.push('', '## Captured Surfaces', '');
    dossier.screens.forEach(function(screen) {
      lines.push('- ' + screen.name + ': ' + screen.purpose);
    });
    lines.push('', '## Design Tokens', '', '```json', JSON.stringify(dossier.designTokens, null, 2), '```', '');
    dossier.screens.forEach(function(screen) { lines.push(markdownScreen(screen)); });
    lines.push('## Static Or Currently Hidden Surfaces', '');
    dossier.dormantSurfaces.filter(Boolean).forEach(function(surface) {
      lines.push('### ' + surface.name, '', '- Currently visible: `' + surface.currentlyVisible + '`', '', '```text', surface.definedCopy, '```', '');
    });
    lines.push('## Limitations', '');
    lines.push('- This dossier records rendered layout, UI copy, controls, styles and structure.');
    lines.push('- When PNG downloads succeeded, attach them alongside this file for fine visual judgment on spacing, colour balance or polish.');
    lines.push('- If PNG capture was blocked by browser or content policy, take Safari screenshots of the major modes and attach them instead.');
    lines.push('- Canvas-based Structure Map dimensions and surrounding layout are recorded, but its rendered pixels are best communicated by screenshot.');
    return lines.join('\n');
  }

  function restoreUiState(before) {
    try {
      if (typeof window.toggleBridgePreview === 'function' && before.bridgePreviewHidden != null) {
        window.toggleBridgePreview(!before.bridgePreviewHidden);
      }
      setHidden($('#shortcut-help'), before.helpHidden);
      if (before.modalHidden && typeof window.closeAlbumArtPopup === 'function') window.closeAlbumArtPopup();
      if (!before.modalHidden && typeof window.openAlbumArtPopup === 'function') window.openAlbumArtPopup();
      if (typeof window.toggleStudioRail === 'function' && before.railCollapsed != null) {
        window.toggleStudioRail(before.railCollapsed);
      }
      if (typeof window.switchWorkbenchView === 'function' && before.view) {
        window.switchWorkbenchView(before.view);
      }
      if (typeof before.guidedListenStep === 'number') window.guidedListenStep = before.guidedListenStep;
      if (typeof window.renderSectionDetail === 'function' && typeof window.selectedSection === 'number') {
        window.renderSectionDetail(window.selectedSection);
      }
    } catch (restoreError) {
      console.warn('[CueLab UI Dossier] Screen state could not be completely restored.', restoreError);
    }
  }

  var player = $('#player-section');
  var structureMap = $('.structure-stage');
  var canSwitchViews = typeof window.switchWorkbenchView === 'function';
  var hasTrackState = typeof window.currentTrack === 'object' && !!window.currentTrack;
  var hasRenderedWorkbench = !!(isVisible(player) || isVisible(structureMap) || isVisible($('.track-identity-row')));

  var before = {
    view: typeof window.activeWorkbenchView === 'string' ? window.activeWorkbenchView : 'map',
    guidedListenStep: typeof window.guidedListenStep === 'number' ? window.guidedListenStep : null,
    railCollapsed: $('#studio-frame') ? $('#studio-frame').classList.contains('rail-collapsed') : null,
    bridgePreviewHidden: $('#bridge-preview') ? $('#bridge-preview').hidden : null,
    modalHidden: $('#album-modal') ? $('#album-modal').hidden : true,
    helpHidden: $('#shortcut-help') ? $('#shortcut-help').hidden : true
  };

  var dossier = {
    schema: 'cuelab-ui-dossier-v1',
    app: captureAppMetadata(),
    environment: {
      userAgent: navigator.userAgent,
      viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
      colourScheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    },
    designTokens: getTokens(),
    representativeStyles: getStyleSamples(),
    screens: [],
    dormantSurfaces: [
      dormantSurface('#auth-screen', 'Spotify connection/login screen'),
      dormantSurface('#track-url-card', 'Track URL entry or loaded-track summary'),
      dormantSurface('#drop-overlay', 'ChatGPT JSON drop overlay')
    ],
    captureNotes: [
      'No annotation field, marker, audio playback, import, export or dashboard-transfer action was intentionally invoked.',
      'Visible field values are included to show representative density; the Spotify URL input is omitted.'
    ]
  };
  if (!hasTrackState) {
    dossier.captureNotes.push('No currentTrack object was exposed at capture time. If a track is visibly loaded, this reflects a UI-state hook difference rather than an empty screen.');
  }
  if (!hasRenderedWorkbench) {
    dossier.captureNotes.push('The standard visible-workbench selectors were not visible at capture time; the script recorded the currently rendered page as a diagnostic surface.');
  }
  if (!canSwitchViews) {
    dossier.captureNotes.push('switchWorkbenchView was not exposed on this deployed version, so automated mode traversal was unavailable.');
  }
  var suffix = timestampSlug();
  var screenshotReady = false;
  var captureFailed = false;

  function appendScreen(id, name, purpose) {
    var screen = captureScreen(id, name, purpose);
    if (!screenshotReady) {
      dossier.screens.push(screen);
      return Promise.resolve();
    }
    var filename = 'cuelab-ui-' + kebab(id) + '-' + suffix + '.png';
    return capturePng(filename).then(function(captured) {
      if (captured) screen.screenshotFile = filename;
      dossier.screens.push(screen);
    });
  }

  function captureModes(index) {
    if (!canSwitchViews) {
      if (index === 0) return appendScreen('current-page', 'Current Visible Page', 'currently rendered CueLab surface and compatibility diagnostic');
      return Promise.resolve();
    }
    if (index >= MODES.length) return Promise.resolve();
    var mode = MODES[index];
    window.switchWorkbenchView(mode.id);
    return settle().then(function() {
      return appendScreen(mode.id, mode.name, mode.purpose);
    }).then(function() {
      return captureModes(index + 1);
    });
  }

  function captureRailStates() {
    if (!canSwitchViews) return Promise.resolve();
    window.switchWorkbenchView('map');
    return settle().then(function() {
      if (typeof window.toggleStudioRail !== 'function') return null;
      window.toggleStudioRail(false);
      return settle().then(function() {
        return appendScreen('rail-expanded', 'Navigation Rail - Expanded', 'labelled navigation state');
      }).then(function() {
        window.toggleStudioRail(true);
        return settle();
      }).then(function() {
        return appendScreen('rail-collapsed', 'Navigation Rail - Collapsed', 'icon-only navigation state');
      });
    });
  }

  function captureHelpPopup() {
    var help = $('#shortcut-help');
    if (!help) return Promise.resolve();
    help.hidden = false;
    return settle().then(function() {
      return appendScreen('help', 'Keyboard Shortcuts Popup', 'compact on-demand help surface');
    }).then(function() {
      help.hidden = true;
    });
  }

  function captureBridgePreview() {
    if (!canSwitchViews) return Promise.resolve();
    window.switchWorkbenchView('handover');
    return settle().then(function() {
      if (typeof window.toggleBridgePreview !== 'function' || !$('#bridge-preview')) return null;
      window.toggleBridgePreview(true);
      return settle().then(function() {
        return appendScreen('bridge-preview', 'Export - Bridge Preview Open', 'BeatPulse bridge inspection state');
      }).then(function() {
        window.toggleBridgePreview(false);
      });
    });
  }

  function captureAlbumLightbox() {
    if (typeof window.openAlbumArtPopup === 'function' && window.currentTrack &&
        window.currentTrack.album && window.currentTrack.album.images && window.currentTrack.album.images.length) {
      window.openAlbumArtPopup();
      return settle().then(function() {
        return appendScreen('album-lightbox', 'Album Art Lightbox', 'track metadata modal');
      }).then(function() {
        if (typeof window.closeAlbumArtPopup === 'function') window.closeAlbumArtPopup();
      });
    }
    dossier.captureNotes.push('Album-art lightbox was not captured because the loaded session has no available artwork image.');
    return Promise.resolve();
  }

  function restoreAndFinish() {
    restoreUiState(before);
    return settle().then(function() {
      if (captureFailed) return;
      var markdown = makeMarkdown(dossier);
      downloadText('cuelab-ui-dossier-' + suffix + '.md', markdown, 'text/markdown;charset=utf-8');
      downloadText('cuelab-ui-dossier-' + suffix + '.json', JSON.stringify(dossier, null, 2), 'application/json;charset=utf-8');
      console.log('[CueLab UI Dossier] Captured ' + dossier.screens.length + ' UI surfaces. Downloaded Markdown and JSON files; your starting view has been restored.');
      console.log('[CueLab UI Dossier] Attach both files plus any preferred screenshots to ChatGPT for design refinement.');
    });
  }

  loadScreenshotLibrary().then(function(ready) {
    screenshotReady = ready;
    if (screenshotReady) {
      dossier.captureNotes.push('PNG captures use html2canvas loaded from cdnjs only for local rendered-screen capture. Cross-origin cover artwork may be omitted by the browser.');
    } else if (CONFIG.capturePngScreenshots) {
      dossier.captureNotes.push('PNG capture library could not be loaded in this browser session. Use Safari screenshots alongside the Markdown/JSON dossier.');
    }
    return captureModes(0)
      .then(captureRailStates)
      .then(captureHelpPopup)
      .then(captureBridgePreview)
      .then(captureAlbumLightbox);
  }).catch(function(error) {
    captureFailed = true;
    console.error('[CueLab UI Dossier] Capture stopped before export.', error);
  }).then(restoreAndFinish);
})();
