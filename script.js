// Constants
const SCROLL_THRESHOLD = 10;
const SWIPE_THRESHOLD = 80;
const SWIPE_MAX_DURATION = 600;
const SWIPE_HORIZONTAL_RATIO = 1.5;
const LABEL_HIDE_DELAY = 300;
const INTERSECTION_THRESHOLD = 0.7;
const SCROLL_TRIGGER_RATIO = 0.5;
const RESIZE_DEBOUNCE_DELAY = 150;
const TRANSLATION_TOGGLE_UPDATE_DELAY = 100;
const SCROLL_INDICATOR_HIDE_THRESHOLD = 100;
const MOBILE_WIDTH_THRESHOLD = 700;
const MOBILE_LANDSCAPE_WIDTH_THRESHOLD = 1000;
const MOBILE_LANDSCAPE_HEIGHT_THRESHOLD = 500;
const MOBILE_SCROLL_OFFSET = 20;
const SCROLL_INDICATOR_OFFSET = 60;
const POEMS_INDEX_PATH = 'poems/index.json';
const POEMS_BUNDLE_PATH = 'poems/poems-bundle.json';

// DOM elements - validated at initialization
let notebook;
let pagesContainer;
let prevBtn;
let nextBtn;

// State
let pages = [];
let currentPage = 0;
let poems = [];
let floatingTranslationButton = null;
let scrollIndicatorHidden = false;
let resizeTimeout = null;
let isMobileDeviceCache = null;
let cachedWindowWidth = null;
let cachedWindowHeight = null;
let cachedTouchSupport = null;

// Event handlers for cleanup
const eventHandlers = {
  keyboard: null,
  scroll: null,
  resize: null,
  scrollIndicator: null,
  coverClick: null,
  floatingButton: null,
  scrollHide: null,
  documentTouch: null, // Document-level touch handler for tooltip cleanup
  desktopToggleButtons: new WeakMap() // Store handlers for desktop toggle buttons
};

/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param {string} text - The text to escape
 * @returns {string} The escaped HTML string
 */
function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Normalizes line endings to Unix format (\n)
 * @param {string} text - The text to normalize
 * @returns {string} The normalized text
 */
function normalizeLineEndings(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Splits text into individual lines, preserving empty lines as empty strings
 * @param {string} text - The text to split
 * @returns {string[]} Array of lines
 */
function splitIntoLines(text) {
  if (typeof text !== 'string') return [];
  const normalized = normalizeLineEndings(text);
  return normalized.split('\n');
}

/**
 * Parses text with {} markers and returns processed HTML with hover spans
 * Also returns marker positions for line-by-line rendering
 * @param {string} text - The text to parse (may contain {marker} syntax)
 * @param {string[]} hoverTextArray - Array of hover text for each marker
 * @returns {{html: string, markerPositions: Array<{start: number, end: number, hoverText: string, markerId: number}>}}
 */
function parseTextWithMarkers(text, hoverTextArray) {
  if (typeof text !== 'string' || !hoverTextArray || !Array.isArray(hoverTextArray)) {
    return { html: escapeHtml(text), markerPositions: [] };
  }
  
  let hoverIndex = 0;
  const markerPositions = [];
  const parts = [];
  let lastIndex = 0;
  
  // Find all {} markers (supports multi-line markers via [^}]+)
  const markerRegex = /\{([^}]+)\}/gs;
  let match;
  
  while ((match = markerRegex.exec(text)) !== null) {
    // Add text before the marker (this preserves any spaces before the {)
    const textBefore = text.substring(lastIndex, match.index);
    if (textBefore.length > 0) {
      parts.push({
        type: 'text',
        content: textBefore
      });
    }
    
    // Add the marked text (content inside {}, the braces themselves are removed)
    const markedText = match[1];
    const markerStart = match.index;
    const markerEnd = match.index + match[0].length;
    
    // Only add as marker if we have hoverText, otherwise just add as regular text (without braces)
    if (hoverIndex < hoverTextArray.length) {
      const hoverText = hoverTextArray[hoverIndex];
      
      parts.push({
        type: 'marker',
        content: markedText,
        hoverText: hoverText,
        start: markerStart,
        end: markerEnd
      });
      
      markerPositions.push({
        start: markerStart,
        end: markerEnd,
        hoverText: hoverText,
        markerId: hoverIndex // Use hoverIndex as unique marker ID (will be prefixed per text type)
      });
      
      hoverIndex++;
    } else {
      // No more hoverText entries - just add the text without braces
      parts.push({
        type: 'text',
        content: markedText
      });
    }
    
    // Move past the entire marker including the closing }
    lastIndex = markerEnd;
  }
  
  // Add remaining text after last marker
  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.substring(lastIndex)
    });
  }
  
  // Build HTML, preserving newlines so we can split it back into lines later
  // Note: marker IDs use temporary "marker-" prefix, replaced with text-type prefix in renderPoems
  let markerIndex = 0;
  const html = parts.map(part => {
    if (part.type === 'marker') {
      const markerId = markerPositions[markerIndex++]?.markerId;
      const markerIdAttr = markerId !== undefined ? ` data-marker-id="marker-${markerId}"` : '';
      const escapedText = escapeHtml(part.content);
      const escapedHover = escapeHtml(part.hoverText);
      return `<span class="has-alternate-version" data-alternate-note="${escapedHover}"${markerIdAttr} title="Hover to see alternate version">${escapedText}</span>`;
    } else {
      return escapeHtml(part.content);
    }
  }).join('');
  
  return { html, markerPositions };
}

/**
 * Gets the current vertical scroll position
 * @returns {number} The scroll position in pixels
 */
function getScrollTop() {
  return window.scrollY ?? document.documentElement.scrollTop ?? 0;
}

/**
 * Detects if the current device is a mobile device (cached for performance)
 * @returns {boolean} True if mobile device, false otherwise
 */
function isMobileDevice() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  
  // Use cache if dimensions haven't changed
  if (isMobileDeviceCache !== null && 
      cachedWindowWidth === width && 
      cachedWindowHeight === height) {
    return isMobileDeviceCache;
  }
  
  cachedWindowWidth = width;
  cachedWindowHeight = height;
  
  if (cachedTouchSupport === null) {
    cachedTouchSupport = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }
  
  // Portrait mobile: width <= 700px
  // Landscape mobile: width <= 1000px AND height <= 500px AND touch device
  isMobileDeviceCache = width <= MOBILE_WIDTH_THRESHOLD || 
    (width <= MOBILE_LANDSCAPE_WIDTH_THRESHOLD && 
     height <= MOBILE_LANDSCAPE_HEIGHT_THRESHOLD && 
     cachedTouchSupport);
  
  return isMobileDeviceCache;
}

/**
 * Invalidates the mobile device detection cache
 * Should be called when window dimensions change
 */
function invalidateMobileCache() {
  isMobileDeviceCache = null;
  cachedWindowWidth = null;
  cachedWindowHeight = null;
}

/**
 * Renders all loaded poems into page elements
 * Creates DOM structure for each poem with original, phonetic, and translation text
 */
function renderPoems() {
  if (!pagesContainer) {
    console.error('Pages container not found');
    return;
  }
  
  pagesContainer.innerHTML = '';
  pages = [];

  poems.forEach((poem, index) => {
    const page = document.createElement('article');
    page.className = 'page';
    if (index === 0) page.classList.add('active');
    page.setAttribute('data-page', index + 1);
    page.setAttribute('aria-label', `Poem ${index + 1}: ${poem.title}`);

    const pageContent = document.createElement('div');
    pageContent.className = 'page-content';

    const header = document.createElement('header');

    // Add "originally untitled" indicator if applicable
    if (poem.untitled) {
      const untitledIndicator = document.createElement('span');
      untitledIndicator.className = 'untitled-indicator';
      untitledIndicator.textContent = 'originally untitled';
      header.appendChild(untitledIndicator);
    }

    const h2 = document.createElement('h2');
    h2.textContent = poem.title;
    header.appendChild(h2);
    
    // Add phonetic title if available
    if (poem.titlePhonetic) {
      const h3Phonetic = document.createElement('h3');
      h3Phonetic.className = 'title-phonetic';
      h3Phonetic.textContent = poem.titlePhonetic;
      h3Phonetic.setAttribute('lang', 'en'); // Phonetic transliteration in English script
      header.appendChild(h3Phonetic);
    }
    
    // Add translated title if available
    if (poem.titleTranslation) {
      const h3 = document.createElement('h3');
      h3.className = 'title-translation';
      h3.textContent = poem.titleTranslation;
      h3.setAttribute('lang', 'en'); // English translation
      header.appendChild(h3);
    }

    const poemBody = document.createElement('div');
    poemBody.className = 'poem-body';

    // Get hoverText array from poem
    const hoverTextArray = poem.hoverText && Array.isArray(poem.hoverText) ? poem.hoverText : [];
    
    // Parse full texts with markers first (allows markers to span multiple lines)
    const originalParsed = parseTextWithMarkers(poem.original, hoverTextArray);
    let hoverIndexUsed = originalParsed.markerPositions.length;
    
    const phoneticParsed = poem.phonetic ? parseTextWithMarkers(poem.phonetic, hoverTextArray.slice(hoverIndexUsed)) : { html: '', markerPositions: [] };
    hoverIndexUsed += phoneticParsed.markerPositions.length;
    
    const translationParsed = parseTextWithMarkers(poem.translation, hoverTextArray.slice(hoverIndexUsed));
    
    // Render lines with markers that may span multiple lines
    // markerIdPrefix ensures unique IDs across different text types (original, phonetic, translation)
    function renderLinesWithMarkers(text, markerPositions, markerIdPrefix = '') {
      const lines = splitIntoLines(text);
      if (lines.length === 0) return [''];
      
      const htmlLines = [];
      
      // Calculate cumulative character positions for each line in the original text
      // We need to account for newlines when calculating positions
      let cumulativePos = 0;
      const lineRanges = lines.map((line, index) => {
        const start = cumulativePos;
        const end = start + line.length;
        // Move past this line and its newline (except for the last line)
        cumulativePos = end + (index < lines.length - 1 ? 1 : 0);
        return { start, end, line, index, markers: [] };
      });
      
      // First pass: identify which markers span which lines
      for (let i = 0; i < lineRanges.length; i++) {
        const { start, end } = lineRanges[i];
        
        for (const marker of markerPositions) {
          // Check if marker overlaps with this line
          if (marker.start < end && marker.end > start) {
            const isStart = marker.start >= start && marker.start < end;
            const isEnd = marker.end > start && marker.end <= end;
            
            // Calculate positions within this line
            const markerStartInLine = isStart ? marker.start - start : 0;
            const markerEndInLine = isEnd ? marker.end - start : end - start;
            
            lineRanges[i].markers.push({
              ...marker,
              isStart,
              isEnd,
              markerStartInLine,
              markerEndInLine
            });
          }
        }
        
        // Sort markers by start position within the line
        lineRanges[i].markers.sort((a, b) => a.markerStartInLine - b.markerStartInLine);
      }
      
      // Second pass: render each line with proper marker tags
      for (let i = 0; i < lineRanges.length; i++) {
        const { line, markers } = lineRanges[i];
        const parts = [];
        let currentPos = 0;
        
        for (const marker of markers) {
          // Add text before marker
          if (marker.markerStartInLine > currentPos) {
            const beforeText = line.substring(currentPos, marker.markerStartInLine);
            if (beforeText) {
              parts.push({ type: 'text', content: beforeText });
            }
          }
          
          // Extract marker text (remove braces)
          let markerText = line.substring(marker.markerStartInLine, marker.markerEndInLine);
          if (marker.isStart && markerText.startsWith('{')) markerText = markerText.substring(1);
          if (marker.isEnd && markerText.endsWith('}')) markerText = markerText.slice(0, -1);
          
          if (markerText) {
            parts.push({
              type: 'marker',
              content: markerText,
              hoverText: marker.hoverText,
              markerId: marker.markerId
            });
          }
          
          // Move past this marker segment
          currentPos = marker.markerEndInLine + (marker.isEnd && line[marker.markerEndInLine] === '}' ? 1 : 0);
        }
        
        // Add remaining text after last marker
        if (currentPos < line.length) {
          const afterText = line.substring(currentPos);
          if (afterText) {
            parts.push({ type: 'text', content: afterText });
          }
        }
        
        // Build HTML for this line
        const html = parts.map(part => {
          if (part.type === 'marker') {
            const escapedText = escapeHtml(part.content);
            const escapedHover = escapeHtml(part.hoverText);
            const fullMarkerId = part.markerId !== undefined ? `${markerIdPrefix}${part.markerId}` : '';
            const markerIdAttr = fullMarkerId ? ` data-marker-id="${fullMarkerId}"` : '';
            return `<span class="has-alternate-version" data-alternate-note="${escapedHover}"${markerIdAttr} title="Hover to see alternate version">${escapedText}</span>`;
          } else {
            return escapeHtml(part.content);
          }
        }).join('');
        htmlLines.push(html);
      }
      
      return htmlLines;
    }
    
    // Use renderLinesWithMarkers which properly handles multi-line markers
    // It works with the original text but removes braces and applies spans correctly
    // Prefixes ensure marker IDs are unique across text types (orig-, phon-, trans-)
    const originalHtmlLines = renderLinesWithMarkers(poem.original, originalParsed.markerPositions || [], 'orig-');
    const phoneticHtmlLines = poem.phonetic && phoneticParsed.markerPositions ? renderLinesWithMarkers(poem.phonetic, phoneticParsed.markerPositions, 'phon-') : [];
    const translationHtmlLines = translationParsed.markerPositions && translationParsed.markerPositions.length > 0 
      ? renderLinesWithMarkers(poem.translation, translationParsed.markerPositions, 'trans-')
      : splitIntoLines(poem.translation).map(line => escapeHtml(line));
    
    // Also get the original line structure for reference
    const originalLines = splitIntoLines(poem.original);
    const phoneticLines = poem.phonetic ? splitIntoLines(poem.phonetic) : [];
    const translationLines = splitIntoLines(poem.translation);
    
    // Determine the maximum number of lines
    const maxLines = Math.max(originalLines.length, translationLines.length, originalHtmlLines.length, translationHtmlLines.length);
    
    // Create a grid container for line pairs
    const stanzaGrid = document.createElement('div');
    stanzaGrid.className = 'stanza-grid';
    
    // Create rows for each line pair
    for (let i = 0; i < maxLines; i++) {
      const stanzaRow = document.createElement('div');
      stanzaRow.className = 'stanza-row';
      
      // Original line cell (with phonetic underneath if available)
      const originalCell = document.createElement('div');
      originalCell.className = 'stanza-cell original';
      
      const originalLineContainer = document.createElement('div');
      originalLineContainer.className = 'original-line-container';
      
      // Add original Sindhi line
      if (i < originalHtmlLines.length && originalHtmlLines[i].trim()) {
        const originalLine = document.createElement('div');
        originalLine.className = 'original-line';
        originalLine.innerHTML = originalHtmlLines[i];
        originalLineContainer.appendChild(originalLine);
        
        // Add phonetic line underneath if available
        if (i < phoneticHtmlLines.length && phoneticHtmlLines[i].trim()) {
          const phoneticLine = document.createElement('div');
          phoneticLine.className = 'phonetic-line';
          phoneticLine.setAttribute('lang', 'en'); // Phonetic transliteration
          phoneticLine.innerHTML = phoneticHtmlLines[i];
          originalLineContainer.appendChild(phoneticLine);
        }
      } else if (i < originalLines.length && originalLines[i].trim()) {
        // Fallback: if HTML parsing didn't produce a line, use the original line
        const originalLine = document.createElement('div');
        originalLine.className = 'original-line';
        originalLine.textContent = originalLines[i].trim();
        originalLineContainer.appendChild(originalLine);
        
        if (i < phoneticLines.length && phoneticLines[i].trim()) {
          const phoneticLine = document.createElement('div');
          phoneticLine.className = 'phonetic-line';
          phoneticLine.setAttribute('lang', 'en'); // Phonetic transliteration
          phoneticLine.textContent = phoneticLines[i].trim();
          originalLineContainer.appendChild(phoneticLine);
        }
      } else {
        // Empty line or beyond original lines - add spacing
        originalLineContainer.innerHTML = '&nbsp;';
      }
      
      originalCell.appendChild(originalLineContainer);
      stanzaRow.appendChild(originalCell);
      
      // Translation line cell
      const translationCell = document.createElement('div');
      translationCell.className = 'stanza-cell translation';
      translationCell.setAttribute('lang', 'en'); // English translation
      
      // Wrap content in a span to maintain inline flow within flex container
      const translationContent = document.createElement('span');
      translationContent.className = 'translation-line-content';
      
      if (i < translationHtmlLines.length && translationHtmlLines[i].trim()) {
        translationContent.innerHTML = translationHtmlLines[i];
      } else if (i < translationLines.length && translationLines[i].trim()) {
        translationContent.textContent = translationLines[i].trim();
      } else {
        translationContent.innerHTML = '&nbsp;';
      }
      
      translationCell.appendChild(translationContent);
      stanzaRow.appendChild(translationCell);
      
      stanzaGrid.appendChild(stanzaRow);
    }
    
    // For non-translation-visible state, show only original
    const original = document.createElement('p');
    original.className = 'original';
    
    // Use the already-parsed original HTML (allows markers to span multiple lines)
    // Replace newlines with <br /> tags for display
    // For non-grid view, apply prefix to marker IDs in the HTML
    let originalHtmlWithBreaks = originalParsed.html;
    // Replace marker IDs with prefixed versions
    originalHtmlWithBreaks = originalHtmlWithBreaks.replace(/data-marker-id="marker-(\d+)"/g, (match, id) => {
      return `data-marker-id="orig-${id}"`;
    });
    originalHtmlWithBreaks = originalHtmlWithBreaks.replace(/\n/g, '<br />');
    original.innerHTML = originalHtmlWithBreaks;
    
    poemBody.appendChild(original);
    
    // Add the grid (hidden by default, shown when translation is visible)
    poemBody.appendChild(stanzaGrid);

    pageContent.appendChild(header);
    pageContent.appendChild(poemBody);

    const footer = document.createElement('footer');
    
    const topRow = document.createElement('div');
    topRow.className = 'footer-top';
    
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'toggle-translation';
    toggleBtn.type = 'button';
    toggleBtn.textContent = 'Show translation';
    toggleBtn.setAttribute('aria-label', 'Toggle translation visibility');
    topRow.appendChild(toggleBtn);

    const pageCount = document.createElement('span');
    pageCount.className = 'page-count';
    pageCount.textContent = `Page ${index + 1} of ${poems.length}`;
    topRow.appendChild(pageCount);
    
    footer.appendChild(topRow);

    const scrollHint = document.createElement('span');
    scrollHint.className = 'scroll-hint';
    scrollHint.textContent = 'Scroll inside the page to read the full poem';
    footer.appendChild(scrollHint);

    page.appendChild(pageContent);
    page.appendChild(footer);
    pagesContainer.appendChild(page);
    pages.push(page);
  });
  
  // Setup scroll shadows after rendering
  requestAnimationFrame(() => {
    setupScrollShadows();
    setupAlternateVersionTooltips();
  });
}

/**
 * Updates the visual state of all pages based on current page index
 * Handles page flipping animations and button states
 */
function updatePages() {
  if (!prevBtn || !nextBtn) return;
  
  pages.forEach((page, index) => {
    const flipped = index < currentPage;
    page.classList.toggle('flipped', flipped);
    page.classList.toggle('active', index === currentPage);
    page.style.zIndex = String(pages.length - index);
    page.style.transform = flipped ? 'rotateY(-180deg)' : 'rotateY(0deg)';
  });

  prevBtn.disabled = currentPage === 0;
  nextBtn.disabled = currentPage === pages.length - 1;
}

/**
 * Changes the current page by the specified delta
 * @param {number} delta - The number of pages to move (positive for next, negative for previous)
 */
function changePage(delta) {
  if (pages.length === 0) return;
  
  const nextPage = Math.min(pages.length - 1, Math.max(0, currentPage + delta));
  if (nextPage !== currentPage) {
    currentPage = nextPage;
    updatePages();
    const activeContent = pages[currentPage]?.querySelector('.page-content');
    if (activeContent) {
      activeContent.scrollTop = 0;
      updateScrollShadow(activeContent);
    }
    // Update floating button text on mobile
    updateFloatingButton();
    // On mobile, scroll to top of the new poem
    if (isMobileDevice()) {
      const activePage = pages[currentPage];
      if (activePage) {
        // Scroll to the new page
        requestAnimationFrame(() => {
          const rect = activePage.getBoundingClientRect();
          const scrollTop = getScrollTop();
          const targetPosition = rect.top + scrollTop - MOBILE_SCROLL_OFFSET;
          window.scrollTo({
            top: targetPosition,
            behavior: 'smooth'
          });
        });
      }
    }
  }
}

// Update scroll shadow visibility based on scroll position
function updateScrollShadow(element) {
  if (!element) return;
  
  const { scrollTop, scrollHeight, clientHeight } = element;
  const isAtTop = scrollTop < SCROLL_THRESHOLD;
  const isAtBottom = scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD;
  
  // Remove all shadow classes first
  element.classList.remove('has-more-content-top', 'has-more-content-bottom');
  
  // Add appropriate classes based on scroll position
  if (!isAtTop && !isAtBottom) {
    element.classList.add('has-more-content-top', 'has-more-content-bottom');
  } else if (!isAtTop) {
    element.classList.add('has-more-content-top');
  } else if (!isAtBottom) {
    element.classList.add('has-more-content-bottom');
  }
}

// Setup scroll listeners for all page-content elements
function setupScrollShadows() {
  const pageContents = document.querySelectorAll('.page-content');
  pageContents.forEach((content) => {
    updateScrollShadow(content);
    // Add scroll listener if not already added
    if (!content.dataset.scrollListenerAdded) {
      const scrollHandler = () => updateScrollShadow(content);
      content.addEventListener('scroll', scrollHandler, { passive: true });
      content.dataset.scrollListenerAdded = 'true';
    }
  });
}

// Setup tooltips for lines with alternate versions
function setupAlternateVersionTooltips() {
  // Create a single tooltip element that will be reused
  let tooltip = document.getElementById('alternate-version-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'alternate-version-tooltip';
    tooltip.className = 'alternate-version-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tooltip);
  }
  
  // Track active marker for cleanup when hiding tooltip
  let activeMarkerElement = null;
  let activePage = null;
  
  // Helper function to toggle hover class on related spans
  function toggleMarkerHover(markerId, page, add) {
    if (!markerId || !page) return;
    const relatedSpans = page.querySelectorAll(`[data-marker-id="${markerId}"]`);
    relatedSpans.forEach(span => {
      span.classList[add ? 'add' : 'remove']('marker-hovered');
    });
  }
  
  // Function to hide tooltip and clean up marker highlighting
  function hideTooltipAndCleanup() {
    // Remove highlighting from all markers (more reliable than tracking activeMarkerElement)
    const allHighlightedMarkers = document.querySelectorAll('.marker-hovered');
    allHighlightedMarkers.forEach(span => {
      span.classList.remove('marker-hovered');
    });
    activeMarkerElement = null;
    activePage = null;
    hideTooltip(tooltip);
  }
  
  // Document-level touch handler to close tooltip when tapping outside
  function handleDocumentTouch(e) {
    // Check if the touch target is a marker element or inside the tooltip
    const target = e.target;
    if (target.closest('.has-alternate-version') || target.closest('#alternate-version-tooltip')) {
      return; // Don't hide if tapping on a marker or the tooltip itself
    }
    
    // Hide tooltip if tapping elsewhere
    if (tooltip.style.display === 'block') {
      hideTooltipAndCleanup();
    }
  }
  
  // Remove existing document-level touch handler if present (prevent memory leak)
  if (eventHandlers.documentTouch) {
    document.removeEventListener('touchstart', eventHandlers.documentTouch, { passive: true });
  }
  
  // Add document-level touch handler (only on mobile)
  eventHandlers.documentTouch = handleDocumentTouch;
  document.addEventListener('touchstart', handleDocumentTouch, { passive: true });
  
  // Get all elements with alternate versions
  const elementsWithAlternates = document.querySelectorAll('.has-alternate-version');
  
  elementsWithAlternates.forEach((element) => {
    const note = element.getAttribute('data-alternate-note');
    if (!note || element.dataset.tooltipSetup === 'true') return;
    
    element.dataset.tooltipSetup = 'true';
    const page = element.closest('.page');
    
    // Mouse hover handlers
    element.addEventListener('mouseenter', (e) => {
      const markerId = e.target.getAttribute('data-marker-id');
      toggleMarkerHover(markerId, page, true);
      showTooltip(e.target, note, tooltip);
    });
    
    element.addEventListener('mouseleave', () => {
      const markerId = element.getAttribute('data-marker-id');
      toggleMarkerHover(markerId, page, false);
      hideTooltip(tooltip);
    });
    
    // Touch handler
    element.addEventListener('touchstart', (e) => {
      e.stopPropagation(); // Prevent document-level handler from firing
      const markerId = e.target.getAttribute('data-marker-id');
      const isVisible = tooltip.style.display === 'block';
      
      if (isVisible) {
        hideTooltipAndCleanup();
      } else {
        activeMarkerElement = e.target;
        activePage = page;
        toggleMarkerHover(markerId, page, true);
        showTooltip(e.target, note, tooltip);
      }
    });
  });
}

/**
 * Shows a tooltip at the position of the specified element
 * Automatically positions above or below based on available space
 * @param {HTMLElement} element - The element to show tooltip for
 * @param {string} note - The tooltip text content
 * @param {HTMLElement} tooltip - The tooltip DOM element
 */
function showTooltip(element, note, tooltip) {
  tooltip.textContent = note;
  tooltip.setAttribute('aria-hidden', 'false');
  tooltip.style.display = 'block';
  
  // Force a reflow to get accurate dimensions
  tooltip.offsetHeight;
  
  // Position tooltip
  const rect = element.getBoundingClientRect();
  const scrollTop = getScrollTop();
  const scrollLeft = window.scrollX ?? document.documentElement.scrollLeft ?? 0;
  const tooltipRect = tooltip.getBoundingClientRect();
  
  // Position tooltip above the element by default, or below if not enough space
  const tooltipHeight = tooltipRect.height;
  const spaceAbove = rect.top;
  const spaceBelow = window.innerHeight - rect.bottom;
  const padding = 12;
  
  let top, left, position;
  
  // Determine if tooltip should be above or below
  if (spaceAbove > tooltipHeight + padding) {
    // Position above
    position = 'above';
    top = rect.top + scrollTop - tooltipHeight - padding;
  } else {
    // Position below
    position = 'below';
    top = rect.bottom + scrollTop + padding;
  }
  
  // Center horizontally relative to element
  left = rect.left + scrollLeft + (rect.width / 2);
  
  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
  tooltip.style.transform = 'translateX(-50%)';
  tooltip.setAttribute('data-position', position);
  
  // Adjust position to keep tooltip in viewport
  requestAnimationFrame(() => {
    const finalRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 10;
    
    let adjustedLeft = left;
    let adjustedTop = top;
    
    // Adjust horizontal position
    if (finalRect.left < margin) {
      adjustedLeft = scrollLeft + margin + (finalRect.width / 2);
      tooltip.style.transform = 'translateX(0)';
    } else if (finalRect.right > viewportWidth - margin) {
      adjustedLeft = scrollLeft + viewportWidth - margin - (finalRect.width / 2);
      tooltip.style.transform = 'translateX(0)';
    }
    
    // Adjust vertical position if needed
    if (finalRect.top < margin) {
      adjustedTop = scrollTop + margin;
      tooltip.setAttribute('data-position', 'below');
    } else if (finalRect.bottom > viewportHeight - margin) {
      adjustedTop = scrollTop + viewportHeight - margin - tooltipHeight;
      tooltip.setAttribute('data-position', 'above');
    }
    
    tooltip.style.top = `${adjustedTop}px`;
    tooltip.style.left = `${adjustedLeft}px`;
  });
}

/**
 * Hides the tooltip element
 * @param {HTMLElement} tooltip - The tooltip DOM element to hide
 */
function hideTooltip(tooltip) {
  tooltip.style.display = 'none';
  tooltip.setAttribute('aria-hidden', 'true');
}

/**
 * Updates the text of the floating translation button based on current state
 * Only updates if on mobile device and button exists
 */
function updateFloatingButton() {
  if (floatingTranslationButton && isMobileDevice()) {
    const activePage = pages[currentPage];
    if (activePage) {
      const isVisible = activePage.classList.contains('translation-visible');
      floatingTranslationButton.textContent = isVisible ? 'Hide translation' : 'Show translation';
    }
  }
}


/**
 * Sets up translation toggle buttons based on device type
 * Mobile: Creates a single floating button
 * Desktop: Uses individual buttons in each page footer
 * Automatically switches between modes on resize
 */
function setupTranslationToggles() {
  // Invalidate cache since device type might have changed
  invalidateMobileCache();
  const isMobile = isMobileDevice();
  
  if (isMobile) {
    // Remove any existing floating button first
    const existingButton = document.querySelector('body > .toggle-translation');
    if (existingButton) {
      existingButton.remove();
    }
    
    // Remove existing event listener if present
    if (eventHandlers.floatingButton) {
      floatingTranslationButton?.removeEventListener('click', eventHandlers.floatingButton);
      eventHandlers.floatingButton = null;
    }
    
    // Create a single floating translation button for mobile (always visible)
    floatingTranslationButton = document.createElement('button');
    floatingTranslationButton.className = 'toggle-translation';
    floatingTranslationButton.type = 'button';
    floatingTranslationButton.textContent = 'Show translation';
    floatingTranslationButton.setAttribute('aria-label', 'Toggle translation visibility');
    document.body.appendChild(floatingTranslationButton);
    
    // Toggle translation for the active page
    const floatingButtonHandler = () => {
      const activePage = pages[currentPage];
      if (activePage) {
        const isVisible = activePage.classList.toggle('translation-visible');
        floatingTranslationButton.textContent = isVisible ? 'Hide translation' : 'Show translation';
        // Re-setup tooltips after DOM changes
        setTimeout(() => setupAlternateVersionTooltips(), TRANSLATION_TOGGLE_UPDATE_DELAY);
      }
    };
    
    floatingTranslationButton.addEventListener('click', floatingButtonHandler);
    eventHandlers.floatingButton = floatingButtonHandler;
    
    // Initial text update
    updateFloatingButton();
  } else {
    // Desktop: use buttons in each page footer
    // Remove floating button if it exists
    const existingButton = document.querySelector('body > .toggle-translation');
    if (existingButton) {
      existingButton.remove();
      floatingTranslationButton = null;
    }
    
    // Remove existing event listeners from toggle buttons and add new ones
    document.querySelectorAll('.toggle-translation').forEach((button) => {
      // Remove old listener if it exists
      const oldHandler = eventHandlers.desktopToggleButtons.get(button);
      if (oldHandler) {
        button.removeEventListener('click', oldHandler);
      }
      
      // Create named handler function so we can remove it later
      const toggleHandler = () => {
        const page = button.closest('.page');
        if (!page) return;
        
        const isVisible = page.classList.toggle('translation-visible');
        button.textContent = isVisible ? 'Hide translation' : 'Show translation';
        // Update scroll shadow after translation toggle (content height may change)
        const pageContent = page.querySelector('.page-content');
        if (pageContent) {
          setTimeout(() => {
            updateScrollShadow(pageContent);
            setupAlternateVersionTooltips(); // Re-setup tooltips after DOM changes
          }, TRANSLATION_TOGGLE_UPDATE_DELAY);
        }
      };
      
      // Store handler reference and add listener
      eventHandlers.desktopToggleButtons.set(button, toggleHandler);
      button.addEventListener('click', toggleHandler);
    });
  }
}

/**
 * Validates a poem object structure and content
 * @param {Object} poem - The poem object to validate
 * @param {string} filename - The filename for error messages
 * @throws {Error} If validation fails
 */
function validatePoem(poem, filename) {
  if (!poem || typeof poem !== 'object') {
    throw new Error(`Invalid poem format in ${filename}: not an object`);
  }
  
  // Required fields
  if (!poem.title || typeof poem.title !== 'string' || poem.title.trim() === '') {
    throw new Error(`Invalid poem format in ${filename}: missing or invalid title`);
  }
  
  if (!poem.original || typeof poem.original !== 'string' || poem.original.trim() === '') {
    throw new Error(`Invalid poem format in ${filename}: missing or invalid original`);
  }
  
  if (!poem.translation || typeof poem.translation !== 'string' || poem.translation.trim() === '') {
    throw new Error(`Invalid poem format in ${filename}: missing or invalid translation`);
  }
  
  // Optional fields validation
  if (poem.titlePhonetic !== undefined && (typeof poem.titlePhonetic !== 'string' || poem.titlePhonetic.trim() === '')) {
    throw new Error(`Invalid poem format in ${filename}: titlePhonetic must be a non-empty string if provided`);
  }
  
  if (poem.titleTranslation !== undefined && (typeof poem.titleTranslation !== 'string' || poem.titleTranslation.trim() === '')) {
    throw new Error(`Invalid poem format in ${filename}: titleTranslation must be a non-empty string if provided`);
  }
  
  if (poem.phonetic !== undefined && (typeof poem.phonetic !== 'string' || poem.phonetic.trim() === '')) {
    throw new Error(`Invalid poem format in ${filename}: phonetic must be a non-empty string if provided`);
  }
  
  if (poem.hoverText !== undefined) {
    if (!Array.isArray(poem.hoverText)) {
      throw new Error(`Invalid poem format in ${filename}: hoverText must be an array if provided`);
    }
    if (poem.hoverText.some(text => typeof text !== 'string' || text.trim() === '')) {
      throw new Error(`Invalid poem format in ${filename}: all hoverText entries must be non-empty strings`);
    }
  }
  
  if (poem.untitled !== undefined && typeof poem.untitled !== 'boolean') {
    throw new Error(`Invalid poem format in ${filename}: untitled must be a boolean if provided`);
  }
  
  // Check for reasonable length limits (prevent extremely long content)
  const MAX_LENGTH = 100000; // 100KB per field
  if (poem.original.length > MAX_LENGTH) {
    throw new Error(`Invalid poem format in ${filename}: original text exceeds maximum length`);
  }
  if (poem.translation.length > MAX_LENGTH) {
    throw new Error(`Invalid poem format in ${filename}: translation text exceeds maximum length`);
  }
}

/**
 * Parses a poem YAML file using js-yaml loaded in index.html.
 * @param {string} yamlText - Raw YAML content
 * @param {string} filename - Source file name
 * @returns {Object} Parsed poem object
 */
function parsePoemFromYaml(yamlText, filename) {
  if (typeof jsyaml === 'undefined' || typeof jsyaml.load !== 'function') {
    throw new Error('js-yaml parser is not available');
  }
  
  let parsed;
  try {
    parsed = jsyaml.load(yamlText);
  } catch (error) {
    throw new Error(`Invalid YAML in ${filename}: ${error.message}`);
  }
  
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid YAML structure in ${filename}: expected an object`);
  }
  
  return parsed;
}

/**
 * Loads the poem YAML manifest from poems/index.json.
 * @returns {Promise<string[]>} Ordered list of poem YAML filenames
 */
async function loadPoemManifest() {
  const response = await fetch(POEMS_INDEX_PATH);
  if (!response.ok) {
    throw new Error(`Failed to load poem index: ${response.status} ${response.statusText}`);
  }
  
  const manifest = await response.json();
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.files)) {
    throw new Error('Invalid poem index format: missing files array');
  }
  
  const files = manifest.files;
  if (files.length === 0) {
    throw new Error('Poem index is empty');
  }
  
  const isValidFile = (file) =>
    typeof file === 'string' &&
    file.trim() !== '' &&
    file.endsWith('.yaml') &&
    !file.includes('..') &&
    !file.startsWith('/');
  
  if (!files.every(isValidFile)) {
    throw new Error('Invalid poem index format: files must be relative .yaml filenames');
  }
  
  return files;
}

/**
 * Loads prebuilt poem bundle generated in CI.
 * @returns {Promise<Object[]>} Validated poems array from bundle
 */
async function loadPoemsFromBundle() {
  const response = await fetch(POEMS_BUNDLE_PATH, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load poem bundle: ${response.status} ${response.statusText}`);
  }
  
  const bundle = await response.json();
  if (!bundle || typeof bundle !== 'object' || !Array.isArray(bundle.poems)) {
    throw new Error('Invalid poem bundle format: missing poems array');
  }
  
  if (bundle.poems.length === 0) {
    throw new Error('Poem bundle is empty');
  }
  
  const validatedPoems = [];
  for (const [index, poem] of bundle.poems.entries()) {
    const filename = Array.isArray(bundle.files) ? (bundle.files[index] || `bundle-entry-${index + 1}`) : `bundle-entry-${index + 1}`;
    validatePoem(poem, filename);
    validatedPoems.push(poem);
  }
  
  return validatedPoems;
}

/**
 * Legacy fallback path: load and parse individual YAML poem files.
 * @returns {Promise<{successfulPoems: Object[], failedPoems: Array<{file: string, error: string}>}>}
 */
async function loadPoemsFromYamlFiles() {
  const poemYamlFiles = await loadPoemManifest();
  
  const successfulPoems = [];
  const failedPoems = [];
  
  for (const filename of poemYamlFiles) {
    try {
      const response = await fetch(`poems/${filename}`);
      if (!response.ok) {
        throw new Error(`Failed to load ${filename}: ${response.status} ${response.statusText}`);
      }
      
      const yamlText = await response.text();
      const parsedPoem = parsePoemFromYaml(yamlText, filename);
      validatePoem(parsedPoem, filename);
      successfulPoems.push(parsedPoem);
    } catch (error) {
      console.error(`Failed to process ${filename}:`, error);
      failedPoems.push({ file: filename, error: error.message });
    }
  }
  
  return { successfulPoems, failedPoems };
}

/**
 * Loads poems from prebuilt bundle (preferred), with YAML fallback.
 * Loads available poems even if some YAML files fail to load.
 */
async function loadPoems() {
  try {
    let loadedFromBundle = false;
    let successfulPoems = [];
    let failedPoems = [];
    
    try {
      successfulPoems = await loadPoemsFromBundle();
      loadedFromBundle = true;
    } catch (bundleError) {
      console.warn('Poem bundle unavailable, falling back to YAML files:', bundleError);
      const yamlResult = await loadPoemsFromYamlFiles();
      successfulPoems = yamlResult.successfulPoems;
      failedPoems = yamlResult.failedPoems;
    }
    
    if (failedPoems.length > 0) {
      console.warn(`${failedPoems.length} poem(s) failed to process:`, failedPoems);
    }
    
    if (successfulPoems.length === 0) {
      throw new Error('No poems processed successfully. Please check the console for details.');
    }
    
    poems = successfulPoems;
    
    if (loadedFromBundle) {
      console.info(`Loaded ${successfulPoems.length} poem(s) from prebuilt bundle`);
    }
    
    // Initialize the notebook once all poems are loaded
    renderPoems();
    setupTranslationToggles();
    updatePages();
    setupScrollShadows();
  } catch (error) {
    console.error('Error loading poems:', error);
    const userMessage = 'Unable to load poems. Please refresh the page or contact support if the problem persists.';
    const technicalMessage = error instanceof Error ? escapeHtml(error.message) : 'Unknown error';
    if (pagesContainer) {
      pagesContainer.innerHTML = `
        <div style="padding: 2rem; text-align: center; color: var(--ink);">
          <p style="font-size: 1.1rem; margin-bottom: 0.5rem;">Error loading poems</p>
          <p style="font-size: 0.9rem; color: var(--text-tertiary);">${escapeHtml(userMessage)}</p>
          <p style="font-size: 0.85rem; margin-top: 1rem; color: var(--text-tertiary);">Technical details: ${technicalMessage}</p>
          <p style="font-size: 0.85rem; margin-top: 0.5rem; color: var(--text-tertiary);">Please check the console for more information.</p>
        </div>
      `;
    }
  }
}

// Hide scroll indicator
function hideScrollIndicator() {
  const indicator = document.querySelector('.scroll-indicator');
  if (indicator) {
    indicator.classList.add('hidden');
  }
  scrollIndicatorHidden = true;
}

// Show scroll indicator
function showScrollIndicator() {
  const indicator = document.querySelector('.scroll-indicator');
  if (indicator) {
    indicator.classList.remove('hidden');
  }
  scrollIndicatorHidden = false;
}

// Open the notebook when it scrolls into view or is clicked
function setupNotebookReveal() {
  const target = document.querySelector('.notebook-stage');
  if (!target || !notebook) return;

  function openNotebook() {
    if (notebook.classList.contains('open')) return;
    
    notebook.classList.add('open');
    hideScrollIndicator();
    setTimeout(() => {
      notebook.classList.add('label-hidden');
    }, LABEL_HIDE_DELAY);
  }

  // Allow opening by clicking the cover
  const coverFront = document.querySelector('.cover.front');
  if (coverFront) {
    // Remove old listener if exists
    if (eventHandlers.coverClick) {
      coverFront.removeEventListener('click', eventHandlers.coverClick);
    }
    
    eventHandlers.coverClick = openNotebook;
    coverFront.addEventListener('click', eventHandlers.coverClick);
  }

  // Use IntersectionObserver if available
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            openNotebook();
            observer.disconnect();
          }
        });
      },
      { root: null, threshold: INTERSECTION_THRESHOLD }
    );
    observer.observe(target);
  } else {
    // Fallback: open when user scrolls to the notebook
    const onScroll = () => {
      const rect = target.getBoundingClientRect();
      const vh = window.innerHeight ?? document.documentElement.clientHeight;
      if (rect.top < vh * SCROLL_TRIGGER_RATIO) {
        openNotebook();
        if (eventHandlers.scroll) {
          window.removeEventListener('scroll', eventHandlers.scroll, { passive: true });
          eventHandlers.scroll = null;
        }
      }
    };
    
    eventHandlers.scroll = onScroll;
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // Check if already in view on load
  }
}

/**
 * Detects Safari browser and adds 'safari' class to body for CSS workarounds
 * Safari has known issues with 3D transforms that require special handling
 */
function detectSafari() {
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  if (isSafari) {
    document.body.classList.add('safari');
  }
}

// Initialize the application
function init() {
  detectSafari();
  
  // Validate DOM elements
  notebook = document.getElementById('notebook');
  pagesContainer = document.getElementById('pages');
  prevBtn = document.getElementById('prevPage');
  nextBtn = document.getElementById('nextPage');
  
  if (!notebook || !pagesContainer || !prevBtn || !nextBtn) {
    console.error('Required DOM elements not found');
    return;
  }

  // Keyboard navigation
  const keyboardHandler = (event) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      changePage(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      changePage(-1);
    }
  };
  
  eventHandlers.keyboard = keyboardHandler;
  window.addEventListener('keydown', keyboardHandler);

  // Navigation buttons
  prevBtn.addEventListener('click', () => changePage(-1));
  nextBtn.addEventListener('click', () => changePage(1));

  // Touch swipe handling
  const stage = document.querySelector('.notebook-stage');
  if (stage) {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    stage.addEventListener(
      'touchstart',
      (event) => {
        if (event.touches.length !== 1) return;
        const touch = event.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchStartTime = Date.now();
      },
      { passive: true }
    );

    stage.addEventListener(
      'touchend',
      (event) => {
        if (!touchStartTime || event.changedTouches.length !== 1) return;
        const touch = event.changedTouches[0];
        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;
        const duration = Date.now() - touchStartTime;
        touchStartTime = 0;

        const isHorizontalSwipe =
          Math.abs(deltaX) > SWIPE_THRESHOLD &&
          Math.abs(deltaX) > Math.abs(deltaY) * SWIPE_HORIZONTAL_RATIO &&
          duration < SWIPE_MAX_DURATION;

        if (isHorizontalSwipe) {
          changePage(deltaX < 0 ? 1 : -1);
        }
      },
      { passive: true }
    );
  }

  // Scroll indicator click handler
  const scrollIndicator = document.querySelector('.scroll-indicator');
  if (scrollIndicator) {
    const scrollIndicatorHandler = () => {
      const notebookStage = document.querySelector('.notebook-stage');
      if (notebookStage) {
        const rect = notebookStage.getBoundingClientRect();
        const scrollTop = getScrollTop();
        const targetPosition = rect.top + scrollTop - SCROLL_INDICATOR_OFFSET;
        
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
        hideScrollIndicator();
      }
    };
    
    eventHandlers.scrollIndicator = scrollIndicatorHandler;
    scrollIndicator.addEventListener('click', scrollIndicatorHandler);
  }

  // Manage scroll indicator visibility based on scroll position
  // Remove any existing scroll hide handler first
  if (eventHandlers.scrollHide) {
    window.removeEventListener('scroll', eventHandlers.scrollHide, { passive: true });
  }
  
  const scrollIndicatorVisibilityHandler = () => {
    const scrollY = getScrollTop();
    const indicator = document.querySelector('.scroll-indicator');
    
    if (!indicator) return;
    
    // Show indicator when near top, hide when scrolled down
    if (scrollY <= SCROLL_INDICATOR_HIDE_THRESHOLD) {
      if (scrollIndicatorHidden) {
        showScrollIndicator();
      }
    } else {
      if (!scrollIndicatorHidden) {
        hideScrollIndicator();
      }
    }
  };
  
  eventHandlers.scrollHide = scrollIndicatorVisibilityHandler;
  window.addEventListener('scroll', scrollIndicatorVisibilityHandler, { passive: true });
  
  // Initial check on load
  scrollIndicatorVisibilityHandler();

  // Update scroll shadows on window resize (e.g., device rotation)
  const resizeHandler = () => {
    clearTimeout(resizeTimeout);
    invalidateMobileCache();
    resizeTimeout = setTimeout(() => {
      setupScrollShadows();
      setupTranslationToggles();
    }, RESIZE_DEBOUNCE_DELAY);
  };
  
  eventHandlers.resize = resizeHandler;
  window.addEventListener('resize', resizeHandler, { passive: true });

  // Setup notebook reveal
  setupNotebookReveal();

  // Load poems
  loadPoems();
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  // DOM is already ready
  init();
}
